// Pure adapter into the existing timeline schema; also embedded in the page.
export function singleWorkerActivity(view) {
  const lane = 'Standard engineer';
  const valid = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const iso = value => new Date(value).toISOString();
  const root = 'https://github.com/vtjeng/teleport-contest';
  const tasks = [], segments = [];
  for (const result of view?.results ?? []) {
    const repair = result.repair;
    if (repair.window !== 'single-worker') continue;
    const latest = result.candidates.at(-1);
    const task = { id: repair.id, label: repair.title, worker: lane,
      status: result.accepted ? 'Accepted repair' : 'Not fully accepted',
      source: repair.evidence?.source?.join(', '), outcome: repair.note,
      publishedAt: result.accepted?.closureAt,
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
      const runs = new Map();
      for (const gate of Object.values(item.gates)) {
        for (const run of gate.runs) {
          const key = `${run.id}:${run.attempt}`;
          // Prefer the snapshot with a known final job time over list metadata.
          if (!runs.has(key) || valid(run.completedAt)) runs.set(key, run);
        }
      }
      const publications = [];
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
        if (checkpoint) span('validation', run.createdAt, end,
          `${link.label}. Elapsed CI span includes queue time.`, [commit, link], ongoing);
        if (publication && valid(run.createdAt) && valid(end)) publications.push({ run, end, ongoing, link });
      }
      // Parallel Lint/Pages runs are one elapsed publication span per candidate.
      if (publications.length) span('publication',
        iso(Math.min(...publications.map(row => Date.parse(row.run.createdAt)))),
        iso(Math.max(...publications.map(row => Date.parse(row.end)))),
        (item.closureAt ? 'All exact-SHA gates passed. ' : 'Acceptance incomplete. ')
          + 'Publication checks include queue time; missing gate times are unknown.',
        [commit, ...publications.map(row => row.link)], publications.some(row => row.ongoing));
      const missing = Object.entries(item.gates).filter(([, gate]) => gate.status !== 'passed');
      if (missing.length) task.status += ' · ' + candidate.sha.slice(0, 8) + ': '
        + missing.map(([name, gate]) => `${name} ${gate.status}`).join(', ');
    }
  }
  return { tasks, segments, stages: segments,
    capturedAt: view?.api?.status === 'fresh' ? view.api.checkedAt : view?.registerAsOf,
    acceptedCount: tasks.filter(task => task.publishedAt).length,
  };
}
