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
    if (handoffs !== null && (!Array.isArray(handoffs) || handoffs.length > 1))
      throw new Error('Waiting handoff cap is one');
    const ids = new Set();
    for (const repair of data.register.repairs) {
      if (!repair.id || ids.has(repair.id) || !Array.isArray(repair.candidates))
        throw new Error('Repair IDs must be unique and stable');
      ids.add(repair.id);
      for (const candidate of repair.candidates) {
        if (!shaPattern.test(candidate.sha) || !Array.isArray(candidate.runs))
          throw new Error('Invalid candidate SHA or run history');
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
    return { repair, candidates, accepted };
  }

  function summarize(at = options.now?.() ?? new Date()) {
    const now = at instanceof Date ? at.getTime() : new Date(at).getTime();
    const manifest = current.manifest;
    const results = current.register.repairs.map(repair =>
      repairResult(repair, current.apiRuns ?? []));
    function windowResult(window, start, end, elapsedHours, coverage) {
      const accepted = results.filter(result => result.accepted
        && result.accepted.closureAt >= start
        && result.accepted.closureAt < end
        && result.repair.window === window);
      const carryIn = accepted.filter(result => {
        const started = timestamp(result.accepted.candidate.startedAt);
        return result.repair.carryIn === true || (started !== null && started < timestamp(start));
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
    const selected = manifest.operations?.currentCandidate;
    const selectedRepair = selected
      ? results.find(result => result.repair.id === selected.repairId) : null;
    const selectedCandidate = selectedRepair?.candidates.find(result =>
      result.candidate.sha === selected.sha)
      ?? (selected && shaPattern.test(selected.sha)
        ? candidateResult({ sha: selected.sha, runs: [] },
          (current.apiRuns ?? []).filter(run => run.sha === selected.sha)) : null);
    return {
      baseline: baselineResult, trial: { ...trialResult, status: trial.status,
        plannedHours: trial.plannedHours, start: trial.start, end: trial.end,
        coverage: trial.coverage },
      currentCandidate: selectedCandidate ? { repairId: selected?.repairId,
        sha: selected.sha, origin: selected.origin ?? null,
        investigator: selected.investigator ?? null,
        registered: Boolean(selectedRepair), ...selectedCandidate } : null,
      investigators: manifest.operations?.investigators ?? null,
      waitingHandoffs: manifest.operations?.waitingHandoffs ?? null,
      buildAt: current.builtAt, buildSha: current.buildSha,
      manifestAsOf: manifest.asOf, registerAsOf: current.register.asOf,
      api, pageDeployment: current.pageDeployment ?? 'unknown',
      results,
    };
  }

  async function refresh() {
    const fetchPublic = options.fetchPublic ?? globalThis.fetch;
    const checkedAt = new Date().toISOString();
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
      const [manifestFile, registerFile, runPage] = await Promise.all([
        read('contents/trial-monitor/manifest.json?ref=main'),
        read('contents/trial-monitor/repairs.json?ref=main'),
        read('actions/runs?per_page=100'),
      ]);
      const manifest = content(manifestFile);
      const register = content(registerFile);
      if (!Array.isArray(runPage.workflow_runs))
        throw new Error('GitHub run response is incomplete');
      const selectedSha = manifest.operations?.currentCandidate?.sha;
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
        if (!Array.isArray(jobs.jobs)) throw new Error('GitHub jobs response is incomplete');
        run.completedAt = jobs.jobs.map(job => job.completed_at)
          .filter(value => timestamp(value) !== null).sort().at(-1) ?? null;
      }));
      const pageDeployment = apiRuns.some(run => run.name === 'Dashboard'
        && run.sha === current.buildSha && run.branch === 'main'
        && run.event === 'push' && run.conclusion === 'success')
        ? 'confirmed' : 'unknown';
      const next = { ...current, manifest, register, apiRuns, pageDeployment };
      validate(next);
      current = next;
      api = { status: 'fresh', checkedAt, error: null };
    } catch (error) {
      api = { status: 'failed', checkedAt, error: error.message };
    }
    return summarize();
  }
  return { summarize, refresh };
}
