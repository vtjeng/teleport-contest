// Convert timestamped worker handoffs into observed task and coordinator lanes.
// An assigned interval is elapsed task ownership, not continuous active work.
export function activityTimeline(activity, capturedAt) {
  const tasks = new Map();
  const segments = [];
  const events = [...(activity?.events ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  const end = capturedAt ?? events.at(-1)?.at ?? null;
  const coordinator = new Map();

  function closeCoordinator(id, at, ongoing = false) {
    const stage = coordinator.get(id);
    if (stage && Date.parse(at) >= Date.parse(stage.start))
      segments.push({ ...stage, end: at, ...(ongoing ? { ongoing: true } : {}) });
    coordinator.delete(id);
  }

  function close(task, phase, at, ongoing = false) {
    const start = task.starts[phase];
    if (start && Date.parse(at) >= Date.parse(start)) {
      segments.push({ task: task.id, goal: task.goal, worker: task.worker,
        kind: task.kind, phase, start, end: at, ...(ongoing ? { ongoing: true } : {}),
        lane: ['working', 'rework', 'queued'].includes(phase) ? task.worker : 'Main' });
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
    if (event.type === 'activity') {
      closeCoordinator(taskId, event.at);
      if (event.phase !== 'done' && task.starts.publication) {
        close(task, 'publication', event.at);
        task.resumePublication = true;
      }
      if (event.phase === 'done' && task.resumePublication) {
        begin(task, 'publication', event.at);
        task.resumePublication = false;
      }
      if (event.phase !== 'done') coordinator.set(taskId, {
        task: taskId, worker: task.worker, kind: task.kind, goal: task.goal,
        lane: 'Main', phase: event.phase, reason: event.reason, start: event.at,
      });
      continue;
    }
    if (['integrating', 'feedback', 'validated', 'accepted', 'published', 'park'].includes(event.type))
      closeCoordinator(taskId, event.at);
    switch (event.type) {
      case 'implement':
        task.kind = 'implementation';
        task.goal = event.goal;
        break;
      case 'ready':
        close(task, 'working', event.at);
        close(task, 'rework', event.at);
        begin(task, 'queued', event.at);
        task.status = 'ready';
        break;
      case 'feedback':
        close(task, 'queued', event.at);
        close(task, 'integrating', event.at);
        task.status = 'changes-required';
        task.rework = true;
        break;
      case 'resume':
        begin(task, task.rework ? 'rework' : 'working', event.at);
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
      if (task.starts[phase]) close(task, phase, end, true);
    }
  }
  if (end) for (const id of coordinator.keys()) closeCoordinator(id, end, true);
  // Fill only gaps in recorded lanes, never invent work or infer idleness from
  // silence. Worker turn reasons explain otherwise unassigned intervals.
  const observed = [...segments];
  for (const lane of new Set(observed.map(row => row.lane))) {
    const occupied = observed.filter(row => row.lane === lane)
      .sort((a, b) => a.start.localeCompare(b.start));
    const turns = lane === 'Main' ? [] : events.filter(event =>
      event.type === 'turn' && event.worker === lane);
    const ownership = events.filter(event => event.worker === lane
      && ['register', 'observe'].includes(event.type));
    const gap = (start, finish) => {
      const boundaries = [...new Set([start, ...[...turns, ...ownership].map(row => row.at)
        .filter(at => at > start && at < finish), finish])].sort();
      for (let index = 0; index < boundaries.length - 1; index++) {
        const a = boundaries[index], b = boundaries[index + 1];
        if (Date.parse(b) <= Date.parse(a)) continue;
        if (ownership.filter(row => row.at <= a).at(-1)?.live === false) continue;
        const turn = turns.filter(row => row.at <= a).at(-1);
        // A new assignment ends the previous idle report, even if the worker
        // did not emit a subsequent active-turn event.
        const assignment = events.filter(row => row.type === 'assign'
          && row.worker === lane && row.at <= a).at(-1);
        const waiting = turn && turn.at >= (assignment?.at ?? '')
          && ['idle', 'blocked'].includes(turn.state);
        segments.push({ task: `gap:${lane}:${a}`, label: lane,
          worker: lane, lane, phase: waiting ? 'waiting' : 'unrecorded',
          start: a, end: b, ...(b === end ? { ongoing: true } : {}), reason: waiting
            ? turn.reason ?? `Worker reported ${turn.state}; no public reason was recorded.`
            : 'No activity recorded. This is not evidence of idleness.' });
      }
    };
    let cursor = occupied[0].start;
    for (const row of occupied) {
      if (row.start > cursor) gap(cursor, row.start);
      if (row.end > cursor) cursor = row.end;
    }
    // Without ownership/turn evidence, a retired historical worker must not
    // acquire an invented multi-day wait extending to today's snapshot.
    if (end && end > cursor && (lane === 'Main' || turns.length || ownership.length)) gap(cursor, end);
  }
  return {
    runId: activity?.runId ?? null,
    capturedAt: end,
    tasks: [...tasks.values()].map(({ starts, resumePublication: _resumePublication, ...task }) => task),
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
