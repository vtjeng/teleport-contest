// Pure adapter into the existing timeline schema; also embedded in the page.
export function singleWorkerActivity(view) {
  const lane = 'Standard engineer';
  const valid = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const iso = value => new Date(value).toISOString();
  const root = 'https://github.com/vtjeng/teleport-contest';
  const tasks = [], segments = [];
  const membersBySha = new Map(), shownValidation = new Set();
  const publicationBySha = new Map();
  for (const result of view?.results ?? []) {
    if (!['single-worker', 'post-trial'].includes(result.repair.window)) continue;
    for (const item of result.candidates) {
      const members = membersBySha.get(item.candidate.sha) ?? new Set();
      members.add(result.repair.id);
      membersBySha.set(item.candidate.sha, members);
    }
  }
  for (const result of view?.results ?? []) {
    const repair = result.repair;
    // Both tags belong to the continuing Standard engineer lane. Keep the
    // frozen baseline and unused trial outside this partial current register.
    if (!['single-worker', 'post-trial'].includes(repair.window)) continue;
    const latest = result.candidates.at(-1);
    const task = { id: repair.id, label: repair.title, worker: lane,
      status: result.accepted ? 'Accepted repair' : 'Not fully accepted',
      source: repair.evidence?.source?.join(', '), outcome: repair.note,
      publishedAt: result.accepted?.closureAt,
      validationSha: result.accepted?.candidate.sha ?? latest?.candidate.sha ?? null,
      validationGroupSize: membersBySha.get(result.accepted?.candidate.sha
        ?? latest?.candidate.sha)?.size ?? 0,
      investigation: 'Investigation timestamps unknown', links: [],
    };
    if (result.candidates.length > 1) task.status += latest?.closureAt
      ? ' · latest correction passed all gates' : ' · latest correction not fully validated';
    tasks.push(task);
    function span(phase, start, end, reason, links = [], ongoing = false) {
      if (!valid(start) || !valid(end) || Date.parse(end) < Date.parse(start)) return false;
      segments.push({ task: repair.id, lane, worker: lane, phase,
        start: iso(start), end: iso(end), reason, links, ongoing });
      return true;
    }
    for (const event of repair.investigations ?? []) {
      if (span('investigation', event.start, event.end ?? view.registerAsOf,
        event.note ?? 'Recorded investigation', [], !event.end)) {
        task.investigation = 'Recorded investigation intervals only; gaps are unknown';
      }
    }
    for (const item of result.candidates) {
      const candidate = item.candidate;
      const commit = { url: `${root}/commit/${candidate.sha}`, label: candidate.sha.slice(0, 12) };
      task.links.push(commit);
      if (candidate.sourceCommit && candidate.sourceCommit !== candidate.sha)
        task.links.push({ url: `${root}/commit/${candidate.sourceCommit}`,
          label: `Repair commit ${candidate.sourceCommit.slice(0, 12)}` });
      const runs = new Map();
      for (const gate of Object.values(item.gates)) {
        for (const run of gate.runs) {
          const key = `${run.id}:${run.attempt}`;
          // Prefer the snapshot with a known final job time over list metadata.
          if (!runs.has(key) || valid(run.completedAt)) runs.set(key, run);
        }
      }
      for (const run of runs.values()) {
        if (run.sha !== candidate.sha) continue;
        const checkpoint = run.name === 'Checkpoint'
          && run.branch?.startsWith('integration-checkpoint/')
          && ['push', 'workflow_dispatch'].includes(run.event);
        const publication = ['Lint', 'Dashboard'].includes(run.name)
          && run.branch === 'main' && run.event === 'push';
        const link = { url: `${root}/actions/runs/${run.id}/attempts/${run.attempt}`,
          label: `${run.name} attempt ${run.attempt}: ${run.conclusion ?? run.status}` };
        task.links.push(link);
        if (!checkpoint && !publication) continue;
        const ongoing = ['queued', 'in_progress'].includes(run.status);
        const end = ongoing ? view.api.checkedAt ?? view.registerAsOf : run.completedAt;
        if (checkpoint) {
          const key = `${candidate.sha}:${run.id}:${run.attempt}`;
          if (!shownValidation.has(key) && span('validation', run.createdAt, end,
            `${link.label}. Shared by ${membersBySha.get(candidate.sha)?.size ?? 1} repairs. Elapsed CI span includes queue time.`,
            [commit, link], ongoing)) shownValidation.add(key);
        }
        if (publication && valid(run.createdAt) && valid(end)) {
          const group = publicationBySha.get(candidate.sha) ?? { owner: repair.id, runs: new Map() };
          group.runs.set(`${run.id}:${run.attempt}`, { run, end, ongoing, link });
          publicationBySha.set(candidate.sha, group);
        }
      }
      const missing = Object.entries(item.gates).filter(([, gate]) => gate.status !== 'passed');
      if (missing.length) task.status += ' · ' + candidate.sha.slice(0, 8) + ': '
        + missing.map(([name, gate]) => `${name} ${gate.status}`).join(', ');
    }
  }
  // One span per validated SHA, even when members recorded different subsets
  // of the same CI runs. An incomplete or contradictory group is never marked
  // accepted merely because one member has all three gates.
  for (const [sha, group] of publicationBySha) {
    const rows = [...group.runs.values()];
    const members = (view.results ?? []).filter(result =>
      ['single-worker', 'post-trial'].includes(result.repair.window))
      .flatMap(result => result.candidates.filter(item => item.candidate.sha === sha)
        .map(item => ({ result, item })));
    const complete = members.length === (membersBySha.get(sha)?.size ?? 0)
      && members.every(({ result, item }) => result.supported && item.closureAt
        && ['Checkpoint', 'Lint', 'Dashboard']
        .every(name => {
          const first = members[0].item.gates[name].run;
          const run = item.gates[name].run;
          return run?.id === first?.id && run?.attempt === first?.attempt
            && run?.completedAt === first?.completedAt;
        }));
    segments.push({ task: group.owner, lane, worker: lane, phase: 'publication',
      start: iso(Math.min(...rows.map(row => Date.parse(row.run.createdAt)))),
      end: iso(Math.max(...rows.map(row => Date.parse(row.end)))),
      reason: (complete ? 'All exact-SHA gates passed. ' : 'Acceptance incomplete or member evidence differs. ')
        + `Shared by ${membersBySha.get(sha)?.size ?? 1} repairs. `
        + 'Publication checks include queue time; missing gate times are unknown.',
      links: [{ url: `${root}/commit/${sha}`, label: sha.slice(0, 12) },
        ...rows.map(row => row.link)], ongoing: rows.some(row => row.ongoing) });
  }
  return { tasks, segments, stages: segments,
    capturedAt: view?.api?.checkedAt ?? view?.registerAsOf,
    acceptedCount: tasks.filter(task => task.publishedAt).length,
  };
}
