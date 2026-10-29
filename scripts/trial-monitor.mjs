// A small, self-contained reducer for the trial panel. build-dashboard embeds
// this function in the static page; it does not require a server or token.
export function createTrialMonitor(initial, options = {}) {
  const repo = 'vtjeng/teleport-contest';
  const apiBase = options.apiBase ?? `https://api.github.com/repos/${repo}`;
  const names = ['Checkpoint', 'Lint', 'Dashboard'];
  const shaPattern = /^[a-f0-9]{40}$/u;
  const timestamp = value => value && Number.isFinite(Date.parse(value))
    ? Date.parse(value) : null;
  const runUrl = id => `https://github.com/${repo}/actions/runs/${id}`;
  const copy = value => JSON.parse(JSON.stringify(value));
  let current = copy(initial);
  let api = { status: 'build-only', checkedAt: null, error: null };

  function validate(data) {
    if (!data || data.manifest?.version !== 1 || data.register?.version !== 1
        || data.manifest.repository !== repo
        || !Array.isArray(data.register.repairs)
        || !timestamp(data.manifest.baseline?.start)
        || !timestamp(data.manifest.baseline?.end)
        || !['not-started', 'running', 'completed'].includes(data.manifest.trial?.status))
      throw new Error('Invalid trial manifest or repair register');
    const trial = data.manifest.trial;
    if ((trial.status === 'not-started' && (trial.start || trial.end))
        || (trial.status !== 'not-started' && !timestamp(trial.start))
        || (trial.status === 'completed' && !timestamp(trial.end))
        || !Number.isFinite(trial.plannedHours) || trial.plannedHours <= 0)
      throw new Error('Invalid trial clock');
    const handoffs = data.manifest.operations?.waitingHandoffs;
    if (handoffs !== null && !Array.isArray(handoffs))
      throw new Error('Waiting handoffs must be an array or null');
    const ids = new Set();
    for (const repair of data.register.repairs) {
      if (!repair.id || ids.has(repair.id) || !Array.isArray(repair.candidates))
        throw new Error('Repair IDs must be unique and stable');
      ids.add(repair.id);
      for (const candidate of repair.candidates) {
        if (!shaPattern.test(candidate.sha) || !Array.isArray(candidate.runs))
          throw new Error('Invalid candidate SHA or run history');
        if ((candidate.sourceCommit && !shaPattern.test(candidate.sourceCommit))
            || (candidate.sourceCommittedAt && !timestamp(candidate.sourceCommittedAt)))
          throw new Error('Invalid repair source commit');
      }
    }
  }
  validate(current);

  function gate(candidate, name, extraRuns = []) {
    const runs = [...candidate.runs, ...extraRuns]
      .filter(run => run.name === name);
    const valid = runs.filter(run => run.sha === candidate.sha
      && (name === 'Checkpoint'
        ? run.branch?.startsWith('integration-checkpoint/')
          && ['push', 'workflow_dispatch'].includes(run.event)
        : run.branch === 'main' && run.event === 'push'));
    const successful = valid.filter(run => run.status === 'completed'
      && run.conclusion === 'success' && timestamp(run.completedAt))
      .sort((a, b) => timestamp(a.completedAt) - timestamp(b.completedAt));
    if (successful.length) return { status: 'passed', run: successful[0], runs };
    const latest = valid.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
    if (latest) {
      const status = latest.conclusion === 'success' ? 'time-unknown'
        : latest.status === 'in_progress' ? 'running'
          : latest.status === 'queued' ? 'queued'
            : latest.conclusion ?? 'unknown';
      return { status, run: latest, runs };
    }
    return { status: runs.length
      ? runs.some(run => run.sha !== candidate.sha) ? 'wrong-sha' : 'wrong-trigger'
      : 'missing', run: runs.at(-1) ?? null, runs };
  }

  function candidateResult(candidate, extraRuns = []) {
    const gates = Object.fromEntries(names.map(name =>
      [name, gate(candidate, name, extraRuns)]));
    const passed = names.every(name => gates[name].status === 'passed');
    const closureAt = passed
      ? new Date(Math.max(...names.map(name =>
        timestamp(gates[name].run.completedAt)))).toISOString() : null;
    return { candidate, gates, closureAt };
  }

  function repairResult(repair, extraRuns = []) {
    const evidence = repair.evidence;
    const supported = repair.kind === 'parity-repair'
      && evidence && ['source', 'witness', 'test'].every(key =>
        Array.isArray(evidence[key]) && evidence[key].length > 0);
    const candidates = repair.candidates.map(candidate =>
      candidateResult(candidate, extraRuns.filter(run => run.sha === candidate.sha)));
    const accepted = supported ? candidates.filter(item => item.closureAt)
      .sort((a, b) => a.closureAt.localeCompare(b.closureAt))[0] ?? null : null;
    return { repair, candidates, accepted, supported };
  }

  // Candidate identity and ordering come from persisted candidate evidence, never
  // the manifest pointer, register watermark, array position or an API poll.
  function selectCandidate(data) {
    const entries = data.register.repairs.flatMap(repair => repair.candidates.map(candidate => {
      const firstRun = candidate.runs.filter(run => run.sha === candidate.sha && timestamp(run.createdAt) !== null)
        .map(run => timestamp(run.createdAt)).sort((a, b) => a - b)[0];
      const at = timestamp(candidate.committedAt) ?? timestamp(candidate.startedAt) ?? firstRun ?? null;
      return {repair, candidate, at};
    }));
    const dated = entries.filter(entry => entry.at !== null).sort((a, b) => b.at - a.at);
    const undatedCount = entries.length - dated.length;
    const unrecordedCount = data.register.repairs.filter(repair => repair.window === 'single-worker' && !repair.candidates.length).length;
    const latest = dated[0];
    const unrecordedNewerCount = latest ? data.register.repairs.filter(repair =>
      ['single-worker', 'post-trial'].includes(repair.window) && !repair.candidates.length
      && (repair.investigations ?? []).some(event =>
        (timestamp(event.end) ?? timestamp(event.start) ?? -Infinity) > latest.at)).length : 0;
    const tied = latest && dated.some(entry => entry.at === latest.at
      && entry.candidate.sha !== latest.candidate.sha);
    const selected = tied ? null : latest ?? null;
    const members = selected ? entries.filter(entry =>
      entry.candidate.sha === selected.candidate.sha) : [];
    const pointer = data.manifest.operations?.currentCandidate;
    return {selected, members, selection: {
      source: 'repair-register', undatedCount, unrecordedCount, unrecordedNewerCount,
      status: tied ? 'ambiguous' : !entries.length ? 'none' : !selected ? 'undated'
        : undatedCount || unrecordedCount ? 'partial' : 'selected',
      legacyPointerMismatch: Boolean(pointer && (!selected || pointer.sha !== selected.candidate.sha
        || !members.some(entry => entry.repair.id === pointer.repairId))),
    }};
  }

  function summarize(at = options.now?.() ?? new Date()) {
    const now = at instanceof Date ? at.getTime() : new Date(at).getTime();
    const manifest = current.manifest;
    const results = current.register.repairs.map(repair =>
      repairResult(repair, current.apiRuns ?? []));
    // Count repairs individually, but use each validated SHA only once as a
    // publication group. These are wall-clock rates for recorded candidates,
    // never an estimate of active engineering or CI compute time.
    const bySha = new Map();
    for (const result of results) {
      if (!['single-worker', 'post-trial'].includes(result.repair.window)) continue;
      for (const item of result.candidates) {
        const group = bySha.get(item.candidate.sha) ?? [];
        group.push({ result, item });
        bySha.set(item.candidate.sha, group);
      }
    }
    // Select each repair's earliest fully valid candidate only after checking
    // the whole group. A blocked earlier group must not hide a valid correction.
    const validGroups = new Set([...bySha.entries()].filter(([, members]) => {
      if (!members.every(({ result, item }) => result.supported && item.closureAt)) return false;
      return names.every(name => members.every(({ item }) => {
        const first = members[0].item.gates[name].run;
        const run = item.gates[name].run;
        return run?.id === first?.id && run?.attempt === first?.attempt
          && run?.completedAt === first?.completedAt;
      }));
    }).map(([sha]) => sha));
    for (const result of results) {
      if (!['single-worker', 'post-trial'].includes(result.repair.window)) continue;
      result.accepted = result.candidates.filter(item => item.closureAt
        && validGroups.has(item.candidate.sha))
        .sort((a, b) => a.closureAt.localeCompare(b.closureAt))[0] ?? null;
    }
    const completeGroups = [...bySha.entries()].flatMap(([sha, members]) => {
      if (!validGroups.has(sha)) return [];
      // A correction to an already accepted repair can share a new repair's
      // SHA. It is group membership, not another distinct acceptance.
      const newlyAccepted = members.filter(({ result, item }) => result.accepted === item);
      if (!newlyAccepted.length) return [];
      const starts = members.map(({ item }) => timestamp(item.candidate.sourceCommittedAt
        ?? item.candidate.committedAt ?? item.candidate.startedAt));
      const ends = members.map(({ item }) => timestamp(item.closureAt));
      if (starts.some(start => start === null) || ends.some(end => end === null)) return [];
      return [{ sha, repairs: newlyAccepted.length, start: Math.min(...starts), end: Math.max(...ends) }];
    }).sort((a, b) => a.end - b.end);
    const recentGroups = completeGroups.slice(-3);
    const recentStart = recentGroups.length ? Math.min(...recentGroups.map(group => group.start)) : null;
    const recentEnd = recentGroups.length ? Math.max(...recentGroups.map(group => group.end)) : null;
    const recentRepairs = recentGroups.reduce((sum, group) => sum + group.repairs, 0);
    const recentHours = recentStart !== null && recentEnd > recentStart
      ? (recentEnd - recentStart) / 3600000 : null;
    function windowResult(window, start, end, elapsedHours, coverage) {
      const startMs = timestamp(start), endMs = timestamp(end);
      const accepted = results.filter(result => result.accepted
        && timestamp(result.accepted.closureAt) >= startMs
        && timestamp(result.accepted.closureAt) < endMs
        && result.repair.window === window);
      const carryIn = accepted.filter(result => {
        const started = timestamp(result.accepted.candidate.startedAt);
        return result.repair.carryIn === true || (started !== null && started < startMs);
      });
      const complete = coverage === 'audited' || coverage === 'complete';
      return {
        acceptedCount: complete ? accepted.length : null,
        observedCount: accepted.length,
        carryInCount: complete ? carryIn.length : null,
        elapsedHours,
        rate: complete && elapsedHours > 0 ? accepted.length / elapsedHours : null,
        withoutCarryInRate: complete && elapsedHours > 0
          ? (accepted.length - carryIn.length) / elapsedHours : null,
      };
    }
    const baseline = manifest.baseline;
    const baselineHours = (timestamp(baseline.end) - timestamp(baseline.start)) / 3600000;
    const baselineResult = windowResult('baseline', baseline.start, baseline.end,
      baselineHours, baseline.coverage);
    const trial = manifest.trial;
    const trialStart = timestamp(trial.start);
    const plannedEnd = trialStart === null ? null
      : trialStart + trial.plannedHours * 3600000;
    const actualEnd = trial.status === 'completed' ? Math.min(timestamp(trial.end), plannedEnd)
      : Math.min(now, plannedEnd ?? now);
    const trialHours = trialStart === null ? null
      : Math.max(0, (actualEnd - trialStart) / 3600000);
    const trialResult = trialStart === null
      ? { acceptedCount: 0, observedCount: 0, carryInCount: 0,
        elapsedHours: null, rate: null, withoutCarryInRate: null }
      : windowResult('trial', trial.start,
        new Date(Math.min(plannedEnd, trial.status === 'completed'
          ? timestamp(trial.end) : now)).toISOString(),
        trialHours, trial.coverage);
    const {selected, members, selection} = selectCandidate(current);
    const selectedCandidate = selected ? candidateResult(selected.candidate,
      (current.apiRuns ?? []).filter(run => run.sha === selected.candidate.sha)) : null;
    const evidenceAt = selected ? new Date(selected.at).toISOString() : null;
    const evidenceAgeMs = selected && Number.isFinite(now) ? now - selected.at : null;
    return {
      baseline: {...baselineResult, start: baseline.start, end: baseline.end}, trial: { ...trialResult, status: trial.status,
        plannedHours: trial.plannedHours, start: trial.start, end: trial.end,
        coverage: trial.coverage },
      selection,
      recentProgress: { groupCount: recentGroups.length, repairCount: recentRepairs,
        start: recentStart === null ? null : new Date(recentStart).toISOString(),
        end: recentEnd === null ? null : new Date(recentEnd).toISOString(),
        elapsedHours: recentHours, rate: recentHours === null ? null : recentRepairs / recentHours },
      currentCandidate: selectedCandidate ? { repairId: selected.repair.id,
        repairIds: members.map(entry => entry.repair.id), groupSize: members.length,
        sha: selected.candidate.sha, origin: selected.repair.origin ?? null,
        investigator: selected.repair.investigator ?? null, registered: true,
        evidenceAt, evidenceAgeMs,
        freshness: evidenceAgeMs === null ? 'unknown' : evidenceAgeMs < 0 ? 'clock-ahead'
          : evidenceAgeMs > 3600000 ? 'stale' : 'recent',
        state: validGroups.has(selected.candidate.sha) ? 'completed' : 'pending',
        ...selectedCandidate } : null,
      investigators: manifest.operations?.investigators ?? null,
      waitingHandoffs: manifest.operations?.waitingHandoffs ?? null,
      buildAt: current.builtAt, buildSha: current.buildSha,
      operations: manifest.operations, manifestAsOf: manifest.asOf, registerAsOf: current.register.asOf,
      sourceSha: current.sourceSha ?? current.buildSha,
      api, pageDeployment: current.pageDeployment ?? 'unknown',
      results,
    };
  }

  async function performRefresh() {
    const fetchPublic = options.fetchPublic ?? globalThis.fetch;
    const read = async path => {
      const response = await fetchPublic(`${apiBase}/${path}`, {
        headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
      return response.json();
    };
    const content = value => {
      if (value.encoding !== 'base64' || typeof value.content !== 'string')
        throw new Error('GitHub file response is not base64 content');
      const bytes = Uint8Array.from(atob(value.content.replaceAll('\n', '')),
        character => character.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    };
    try {
      const source = await read('commits/main');
      if (!shaPattern.test(source.sha)) throw new Error('GitHub Main revision unavailable');
      const [manifestFile, registerFile, runPage] = await Promise.all([
        read(`contents/trial-monitor/manifest.json?ref=${source.sha}`),
        read(`contents/trial-monitor/repairs.json?ref=${source.sha}`),
        read('actions/runs?per_page=100'),
      ]);
      const manifest = content(manifestFile);
      const register = content(registerFile);
      if (!Array.isArray(runPage.workflow_runs))
        throw new Error('GitHub run response is incomplete');
      validate({...current, manifest, register});
      const selectedSha = selectCandidate({manifest, register}).selected?.candidate.sha;
      let rawRuns = runPage.workflow_runs;
      if (selectedSha && shaPattern.test(selectedSha)
          && !rawRuns.some(run => run.head_sha === selectedSha)) {
        const targeted = await read(`actions/runs?head_sha=${selectedSha}&per_page=100`);
        if (!Array.isArray(targeted.workflow_runs))
          throw new Error('GitHub candidate run response is incomplete');
        rawRuns = [...rawRuns, ...targeted.workflow_runs];
      }
      const seen = new Set();
      const apiRuns = rawRuns.filter(run => {
        const key = `${run.id}:${run.run_attempt}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return names.includes(run.name);
      }).map(run => ({
        id: run.id, name: run.name, sha: run.head_sha,
        attempt: run.run_attempt, event: run.event, branch: run.head_branch,
        status: run.status, conclusion: run.conclusion,
        createdAt: run.created_at, completedAt: null,
        url: runUrl(run.id),
      }));
      // A run's updated_at is not the final gate time. Fetch job completion
      // for the explicit current candidate before permitting acceptance.
      const currentRuns = apiRuns.filter(run => run.sha === selectedSha
        && run.status === 'completed' && run.conclusion === 'success');
      await Promise.all(currentRuns.map(async run => {
        const jobs = await read(`actions/runs/${run.id}/jobs?per_page=100`);
        if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length)
          throw new Error('GitHub jobs response is incomplete');
        run.completedAt = jobs.jobs.map(job => job.completed_at)
          .filter(value => timestamp(value) !== null).sort().at(-1) ?? null;
      }));
      const pageDeployment = apiRuns.some(run => run.name === 'Dashboard'
        && run.sha === current.buildSha && run.branch === 'main'
        && run.event === 'push' && run.conclusion === 'success')
        ? 'confirmed' : 'unknown';
      const next = { ...current, manifest, register, apiRuns, pageDeployment, sourceSha: source.sha };
      validate(next);
      current = next;
      api = { status: 'fresh', checkedAt: new Date(options.now?.() ?? new Date()).toISOString(), error: null };
    } catch (error) {
      api = { status: 'failed', checkedAt: api.checkedAt, error: error.message };
    }
    return summarize();
  }
  let pending = null;
  function refresh() {
    if (!pending) pending = performRefresh().finally(() => { pending = null; });
    return pending;
  }
  return { summarize, refresh };
}
