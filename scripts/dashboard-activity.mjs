// Convert timestamped worker handoffs into observed task and coordinator lanes.
// An assigned interval is elapsed task ownership, not continuous active work.
export function activityTimeline(activity, capturedAt) {
  const tasks = new Map();
  const segments = [];
  const events = [...(activity?.events ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  const end = capturedAt ?? events.at(-1)?.at ?? null;

  function close(task, phase, at) {
    const start = task.starts[phase];
    if (start && Date.parse(at) >= Date.parse(start)) {
      segments.push({ task: task.id, goal: task.goal, worker: task.worker,
        kind: task.kind, phase, start, end: at,
        lane: phase === 'working' ? task.worker : 'Integration' });
    }
    task.starts[phase] = null;
  }
  function begin(task, phase, at) { task.starts[phase] = at; }

  for (const event of events) {
    const taskId = event.runId ? event.runId + '/' + event.task : event.task;
    if (event.type === 'assign') {
      const task = { id: taskId, label: event.task, goal: event.goal ?? null,
        worker: event.worker, kind: event.kind ?? 'implementation',
        assignedAt: event.at, starts: {}, status: 'working',
        integration: null, publishedAt: null };
      tasks.set(task.id, task);
      begin(task, 'working', event.at);
      continue;
    }
    const task = tasks.get(taskId);
    if (!task) continue;
    switch (event.type) {
      case 'ready':
        close(task, 'working', event.at);
        begin(task, 'queued', event.at);
        task.status = 'ready';
        break;
      case 'feedback':
        close(task, 'queued', event.at);
        close(task, 'integrating', event.at);
        task.status = 'changes-required';
        break;
      case 'resume':
        begin(task, 'working', event.at);
        task.status = 'working';
        break;
      case 'integrating':
        close(task, 'queued', event.at);
        if (!task.starts.integrating) begin(task, 'integrating', event.at);
        task.integration = event.integration ?? task.integration;
        task.status = 'integrating';
        break;
      case 'validated':
        close(task, 'integrating', event.at);
        if (event.passed) begin(task, 'acceptance', event.at);
        task.status = event.passed ? 'validated' : 'changes-required';
        break;
      case 'accepted':
        close(task, 'acceptance', event.at);
        begin(task, 'publication', event.at);
        task.status = 'accepted';
        break;
      case 'published':
        close(task, 'publication', event.at);
        task.publishedAt = event.at;
        task.status = 'published';
        break;
      case 'park':
        for (const phase of Object.keys(task.starts)) close(task, phase, event.at);
        task.status = 'parked';
        break;
    }
  }
  if (end) for (const task of tasks.values()) {
    for (const phase of Object.keys(task.starts)) {
      if (task.starts[phase]) close(task, phase, end);
    }
  }
  return {
    runId: activity?.runId ?? null,
    capturedAt: end,
    tasks: [...tasks.values()].map(({ starts, ...task }) => task),
    segments,
  };
}

// Compare each candidate's saved evaluation to the immediately preceding
// evaluation of the same immutable batch. New batches establish a baseline.
export function syntheticGainByCommit(rows, readEvaluation) {
  const previousByManifest = new Map();
  const gains = new Map();
  for (const row of rows) {
    if (row.event !== 'challenge' || !row.challenge_evaluation) continue;
    const current = readEvaluation(row.challenge_evaluation);
    if (current?.status !== 'complete' || !current.manifestSha256) continue;
    const previous = previousByManifest.get(current.manifestSha256);
    previousByManifest.set(current.manifestSha256, current);
    if (!previous || previous.status !== 'complete'
        || previous.scorerSha256 !== current.scorerSha256) continue;
    const before = new Map(previous.cases.map(entry => [entry.id, entry]));
    let gained = 0;
    let lost = 0;
    let comparable = false;
    for (const entry of current.cases) {
      const old = before.get(entry.id);
      const a = old?.metrics?.screens;
      const b = entry.metrics?.screens;
      if (!old || old.recordingSha256 !== entry.recordingSha256
          || a?.total !== b?.total
          || !Number.isSafeInteger(a?.matched)
          || !Number.isSafeInteger(b?.matched)) continue;
      comparable = true;
      const change = b.matched - a.matched;
      if (change > 0) gained += change;
      if (change < 0) lost -= change;
    }
    if (!comparable) continue;
    const total = gains.get(row.sha) ?? { gained: 0, lost: 0, batches: 0 };
    total.gained += gained;
    total.lost += lost;
    total.batches++;
    gains.set(row.sha, total);
  }
  return gains;
}
