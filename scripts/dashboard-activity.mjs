// Convert timestamped worker handoffs into observed task and coordinator lanes.
// An assigned interval is elapsed task ownership, not continuous active work.
export function activityTimeline(activity, capturedAt) {
  const tasks = new Map();
  const segments = [];
  const events = [...(activity?.events ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  const end = capturedAt ?? events.at(-1)?.at ?? null;
  const coordinator = new Map();

  function closeCoordinator(id, at, ongoing = false, superseded = false) {
    const stage = coordinator.get(id);
    if (stage && Date.parse(at) >= Date.parse(stage.start))
      segments.push({ ...stage, end: at, ...(ongoing ? { ongoing: true } : {}),
        ...(superseded ? { superseded: true } : {}) });
    coordinator.delete(id);
  }

  function close(task, phase, at, ongoing = false) {
    const start = task.starts[phase];
    if (start && Date.parse(at) >= Date.parse(start)) {
      segments.push({ task: task.id, goal: task.goal, worker: task.worker,
        kind: task.kind, ...(task.batch ? { batch: task.batch } : {}), phase, start, end: at, ...(ongoing ? { ongoing: true } : {}),
        ...(task.prepGroup ? {prepGroup: task.prepGroup, integration: task.integration} : {}),
        ...(phase === 'parked' ? { reason: task.parkedReason } : {}),
        lane: ['working', 'rework', 'queued', 'parked'].includes(phase) ? task.worker : 'Main' });
    }
    task.starts[phase] = null;
  }
  function begin(task, phase, at) { task.starts[phase] = at; }

  for (const event of events) {
    const taskId = event.runId ? event.runId + '/' + event.task : event.task;
    if (event.type === 'assign') {
      const task = { id: taskId, label: event.task, goal: event.goal ?? null,
        worker: event.worker, kind: event.kind ?? 'implementation',
        ...(event.batch ? { batch: event.batch } : {}),
        assignedAt: event.at, starts: {}, status: 'working',
        integration: null, publishedAt: null };
      tasks.set(task.id, task);
      begin(task, 'working', event.at);
      continue;
    }
    const task = tasks.get(taskId);
    if (event.type === 'observe' && event.live === false) {
      for (const owned of tasks.values()) if (owned.worker === event.worker) {
        close(owned, 'working', event.at);
        close(owned, 'rework', event.at);
        close(owned, 'parked', event.at);
      }
    }
    if (!task) continue;
    if (event.type === 'activity') {
      if (event.phase !== 'done') for (const id of coordinator.keys())
        if (id !== taskId) closeCoordinator(id, event.at, false, true);
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
        ...(task.batch ? { batch: task.batch } : {}),
        lane: 'Main', phase: event.phase, reason: event.reason, start: event.at,
      });
      continue;
    }
    if (['integrating', 'feedback', 'validated', 'accepted', 'published', 'park'].includes(event.type))
      closeCoordinator(taskId, event.at);
    if (['integrating', 'accepted'].includes(event.type)) {
      for (const id of coordinator.keys()) closeCoordinator(id, event.at, false, true);
    }
    if (['integrating', 'validated', 'accepted', 'published'].includes(event.type)) {
      close(task, 'working', event.at);
      close(task, 'rework', event.at);
      close(task, 'parked', event.at);
      if (['accepted', 'published'].includes(event.type)) {
        close(task, 'queued', event.at);
        close(task, 'integrating', event.at);
      }
      if (event.type === 'published') close(task, 'acceptance', event.at);
    }
    switch (event.type) {
      case 'implement':
        task.kind = 'implementation';
        task.goal = event.goal;
        break;
      case 'ready':
        close(task, 'parked', event.at);
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
        close(task, 'parked', event.at);
        begin(task, task.rework ? 'rework' : 'working', event.at);
        task.status = 'working';
        break;
      case 'integrating':
        close(task, 'queued', event.at);
        if (!task.starts.integrating) begin(task, 'integrating', event.at);
        task.integration = event.integration ?? task.integration;
        task.prepGroup = event.prepGroup;
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
      case 'publication-confirmed':
        // A historical upper bound establishes completion, not elapsed work.
        // Remove any synthetic publication intervals for this task; retain a
        // zero-duration history entry that cannot occupy the Main activity lane.
        for (let index = segments.length - 1; index >= 0; index--)
          if (segments[index].task === task.id && segments[index].phase === 'publication') segments.splice(index, 1);
        task.starts.publication = null;
        task.resumePublication = false;
        task.publicationKnownBy = event.knownBy;
        task.status = 'published';
        segments.push({ task: task.id, goal: task.goal, worker: task.worker,
          kind: task.kind, ...(task.batch ? { batch: task.batch } : {}), lane: 'Main',
          phase: 'publication', start: event.knownBy, end: event.knownBy, durationUnknown: true });
        break;
      case 'park':
        for (const phase of Object.keys(task.starts)) close(task, phase, event.at);
        task.status = 'parked';
        task.parkedReason = event.reason ?? 'Task explicitly parked; no reason was recorded.';
        begin(task, 'parked', event.at);
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
    const occupied = observed.filter(row => row.lane === lane && row.phase !== 'queued')
      .map(row => {
        if (row.phase !== 'parked') return row;
        // A paused task can remain parked while its worker takes other work.
        // Only the part before the next assignment occupies that worker's row.
        const next = events.find(event => event.type === 'assign' && event.worker === lane
          && event.at > row.start && event.at < row.end);
        return next ? { ...row, end: next.at } : row;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
    if (!occupied.length) continue;
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
        const assignment = events.filter(row => ['assign', 'implement', 'resume'].includes(row.type)
          && (row.worker ?? tasks.get(row.runId ? row.runId + '/' + row.task : row.task)?.worker) === lane
          && row.at <= a).at(-1);
        const waiting = turn && turn.at >= (assignment?.at ?? '')
          && ['idle', 'blocked'].includes(turn.state);
        segments.push({ task: `gap:${lane}:${a}`, label: lane,
          worker: lane, lane, phase: waiting ? (turn.state === 'blocked' ? 'blocked' : 'idle') : 'unrecorded',
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
    stages: agentStages(segments, events),
  };
}

// Measure the disjoint stages actually drawn for each worker, clipped to the
// visible window. Pool worker-time, not percentages. Unknown time stays in the
// denominator; queue time is task history, not a blocked worker. This function
// is also embedded in the buildless dashboard so the browser uses the same math.
export function activityUtilization(stages, start, end) {
  const work = new Set(['working', 'rework', 'review', 'integrating', 'acceptance', 'publication', 'admission', 'baseline']);
  const groups = ['A/B/C', 'Prep', 'Main'].map(role => ({ role, workers: new Map() }));
  for (const stage of stages) {
    if (['queued', 'pending'].includes(stage.phase)) continue;
    const role = stage.lane === 'Main' ? 'Main' : /^Prep\d*$/u.test(stage.lane) ? 'Prep'
      : /^[ABC]\d*$/u.test(stage.lane) ? 'A/B/C' : null;
    const group = groups.find(row => row.role === role);
    const a = Math.max(start, Date.parse(stage.start)), b = Math.min(end, Date.parse(stage.end));
    if (!group || !(b > a)) continue;
    if (!group.workers.has(stage.lane)) group.workers.set(stage.lane,
      { lane: stage.lane, total: 0, work: 0, blocked: 0, idle: 0, unknown: 0 });
    const row = group.workers.get(stage.lane);
    const state = work.has(stage.phase) ? 'work' : ['blocked', 'parked', 'waiting'].includes(stage.phase)
      ? 'blocked' : stage.phase === 'idle' ? 'idle' : 'unknown';
    row.total += b - a;
    row[state] += b - a;
  }
  return groups.map(group => {
    const result = { role: group.role, total: 0, work: 0, blocked: 0, idle: 0, unknown: 0,
      workers: [...group.workers.values()].map(row => ({ ...row, utilization: row.work / row.total })) };
    for (const row of result.workers) for (const key of ['total', 'work', 'blocked', 'idle', 'unknown']) result[key] += row[key];
    return { ...result, utilization: result.total ? result.work / result.total : null };
  });
}

// Full elapsed durations of completed integration/checks attempts, not CPU
// time. Keep retries and outliers; never treat an open snapshot as an endpoint.
// Embedded in the dashboard so the chart and tests use the same calculation.
export function mainIntegrationDurations(activity) {
  const windowSize = 10;
  const points = (activity?.segments ?? []).map((segment, sourceIndex) => ({ segment, sourceIndex }))
    .filter(({ segment }) => segment.lane === 'Main' && segment.phase === 'integrating'
      && !segment.ongoing && !segment.durationUnknown && !segment.superseded
      && Number.isFinite(Date.parse(segment.start)) && Number.isFinite(Date.parse(segment.end))
      && Date.parse(segment.end) >= Date.parse(segment.start))
    .sort((a, b) => Date.parse(a.segment.end) - Date.parse(b.segment.end) || a.sourceIndex - b.sourceIndex);
  return Object.fromEntries(['implementation', 'preparation'].map(group => {
    const attempts = new Map();
    const recent = [];
    let sum = 0;
    const seenGroups = new Set();
    const grouped = points.filter(({ segment }) => {
      if ((segment.kind === 'challenge-preparation') !== (group === 'preparation')) return false;
      if (!segment.prepGroup) return true;
      const key = `${segment.integration}/${segment.start}/${segment.end}`;
      if (seenGroups.has(key)) return false;
      seenGroups.add(key);
      return true;
    });
    return [group, grouped.map(({ segment, sourceIndex }) => {
      const durationMs = Date.parse(segment.end) - Date.parse(segment.start);
      const attempt = (attempts.get(segment.task) ?? 0) + 1;
      attempts.set(segment.task, attempt);
      recent.push(durationMs);
      sum += durationMs;
      if (recent.length > windowSize) sum -= recent.shift();
      return { sourceIndex, task: segment.task, start: segment.start, end: segment.end,
        ...(segment.prepGroup ? {prepGroup: segment.prepGroup} : {}),
        durationMs, attempt, rollingMeanMs: sum / recent.length, sampleSize: recent.length };
    })];
  }));
}

// One row represents each agent's current stage. Delivery queue intervals are
// retained above for task history and metrics, never for worker-row activity.
export function agentStages(segments, events = []) {
  const stages = [];
  for (const lane of new Set(segments.map(row => row.lane))) {
    const rows = segments.flatMap((segment, sourceIndex) =>
      segment.lane === lane && segment.phase !== 'queued' ? [{ ...segment, sourceIndex }] : []);
    const turns = events.filter(row => row.type === 'turn' && row.worker === lane);
    const taskWorkers = new Map(rows.map(row => [row.task, row.worker]));
    const assignments = events.filter(row => ['assign', 'implement', 'resume'].includes(row.type)
      && (row.worker ?? taskWorkers.get(row.runId ? row.runId + '/' + row.task : row.task)) === lane);
    const boundaries = [...new Set(rows.flatMap(row => [row.start, row.end])
      .concat([...turns, ...assignments].map(row => row.at)))].sort();
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i], end = boundaries[i + 1];
      if (end <= start) continue;
      const present = rows.filter(row => row.start <= start && row.end > start);
      if (!present.length) continue;
      let chosen;
      if (lane === 'Main') {
        // An old missing publication endpoint must not reappear after Main
        // starts newer work. Its open record remains visible in task history.
        chosen = present.filter(row => !(row.ongoing
          && rows.some(other => other.phase !== 'unrecorded'
            && other.start > row.start && other.start <= start)))
          .sort((a, b) => a.start.localeCompare(b.start)).at(-1);
        if (!chosen) chosen = { ...present[0], task: `gap:Main:${start}`, label: 'Main', worker: 'Main', phase: 'unrecorded',
          reason: 'An earlier stage has no end event; Main has since started other work.' };
      } else {
        const assignment = assignments.filter(row => row.at <= start).at(-1);
        const turn = turns.filter(row => row.at <= start).at(-1);
        const reportedWait = turn && turn.at >= (assignment?.at ?? '')
          && ['idle', 'blocked'].includes(turn.state);
        const work = present.filter(row => ['working', 'rework'].includes(row.phase)
          && !(row.ongoing && assignments.some(event => event.at > row.start && event.at <= start)))
          .sort((a, b) => a.start.localeCompare(b.start)).at(-1);
        const parked = present.filter(row => row.phase === 'parked'
          && (!assignment || row.task === (assignment.runId ? assignment.runId + '/' + assignment.task : assignment.task)))
          .sort((a, b) => a.start.localeCompare(b.start)).at(-1);
        chosen = work ?? parked ?? present.find(row => ['blocked', 'idle', 'unrecorded'].includes(row.phase));
        if (!chosen) continue;
        if (reportedWait && chosen.phase !== 'parked') chosen = { ...chosen, phase: turn.state === 'blocked' ? 'blocked' : 'idle',
          reason: turn.reason ?? `Worker reported ${turn.state}; no public reason was recorded.` };
      }
      const previous = stages.at(-1);
      if (previous?.lane === lane && (previous.sourceIndex === chosen.sourceIndex
        || (['blocked', 'idle'].includes(chosen.phase) && previous.task === chosen.task))
        && previous.phase === chosen.phase && previous.reason === chosen.reason && previous.end === start) {
        previous.end = end;
      } else stages.push({ ...chosen, start, end });
    }
  }
  return stages;
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
