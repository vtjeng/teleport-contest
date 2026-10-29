// Versioned, presentation-only projections. No gameplay execution or acceptance writes.
export function discoverySummary({ runId, leads, reviews = [] }) {
  const states = ['explained_negative', 'confirmed', 'accepted', 'duplicate', 'unresolved',
    'invalid_setup', 'unreachable', 'missing_coverage', 'stale', 'unreviewed', 'unknown'];
  const counts = Object.fromEntries(states.map(state => [state, 0]));
  const keys = new Set(), rows = [];
  for (const lead of leads) {
    if (keys.has(lead.key)) throw new Error('Duplicate inventory key');
    keys.add(lead.key);
    const bound = reviews.filter(review => review.key === lead.key && review.runId === runId
      && typeof lead.evidenceKey === 'string' && lead.evidenceKey.length > 0
      && typeof lead.reviewFingerprint === 'string' && lead.reviewFingerprint.length > 0
      && review.evidenceKey === lead.evidenceKey && review.reviewFingerprint === lead.reviewFingerprint);
    const outcomes = new Set(bound.map(review => review.status));
    const conflictingRoots = new Set(bound.map(review => review.root)).size > 1;
    const review = bound[0];
    const stale = lead.historicalReview || reviews.some(item => item.key === lead.key) && !bound.length;
    const status = outcomes.size > 1 || conflictingRoots ? 'unresolved' : review
      ? states.includes(review.status) ? review.status : 'unknown' : stale ? 'stale' : 'unreviewed';
    counts[status]++;
    rows.push({ key: lead.key, status, root: conflictingRoots ? null : review?.root ?? null,
      methods: review?.methods ?? lead.methods ?? [],
      filter: review?.filter ?? (lead.rankingHint ? 'heuristic-priority-only' : null) });
  }
  const reviewed = rows.filter(row => !['stale', 'unreviewed'].includes(row.status));
  const resolved = counts.explained_negative + counts.confirmed + counts.accepted;
  const groups = new Map();
  for (const row of reviewed) {
    if (!row.root) continue;
    const group = groups.get(row.root) ?? new Set(); group.add(row.status); groups.set(row.root, group);
  }
  const causes = Object.fromEntries(states.map(state => [state, 0]));
  for (const values of groups.values()) {
    // A confirmed cause and its accepted repair are one true finding.
    if (values.has('accepted') && [...values].every(x => ['accepted', 'confirmed'].includes(x))) causes.accepted++;
    else causes[values.size === 1 ? [...values][0] : 'unresolved']++;
  }
  const causeResolved = causes.explained_negative + causes.confirmed + causes.accepted;
  const causeCoverage = reviewed.every(row => row.root);
  return { total: leads.length, counts, reviewed: reviewed.length, resolved,
    withoutCurrentReview: counts.unreviewed + counts.stale,
    negativeShare: resolved ? counts.explained_negative / resolved : null,
    filters: { exactBoundDecisions: rows.filter(row => row.filter === 'exact-bound-decision').length,
      heuristicPriorityHints: rows.filter(row => row.filter === 'heuristic-priority-only').length },
    causes, classifiedCauses: groups.size, missingCauseIdentity: reviewed.filter(row => !row.root).length,
    causeNegativeShare: causeCoverage && causeResolved ? causes.explained_negative / causeResolved : null,
    rows: rows.filter(row => !['unreviewed', 'stale'].includes(row.status)) };
}

// Self-contained so the build can embed the same reducer in the browser.
export function workflowSummary({ cases = [], results = [], operations = {}, receipt = null }) {
  const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
  const elapsed = (a, b) => time(a) !== null && time(b) !== null && time(b) >= time(a) ? time(b) - time(a) : null;
  const roots = new Map();
  for (const item of cases) {
    if (item.category === 'static-audit' || item.category === 'tooling') continue;
    const root = item.root || `case:${item.id}`;
    const group = roots.get(root) ?? { root, cases: [], keys: new Set(), prs: new Set(), events: [] };
    group.cases.push(item);
    (item.keys ?? []).forEach(key => group.keys.add(key));
    (item.prs ?? []).forEach(pr => group.prs.add(pr));
    group.events.push(...(item.events ?? [])); roots.set(root, group);
  }
  const batches = new Map();
  for (const result of results) {
    if (result.repair.kind !== 'parity-repair') continue;
    for (const candidate of result.candidates ?? []) {
      const sha = candidate.candidate.sha;
      const batch = batches.get(sha) ?? { sha, repairs: [], publishedAt: null, receiptStatus: 'unknown', acceptedAt: null };
      batch.repairs.push(result.repair.id);
      if (result.accepted?.candidate.sha !== sha) batch.incomplete = true;
      // result.accepted is the existing publication-gate verdict, not receipt completion.
      if (result.accepted?.candidate.sha === sha) batch.publishedAt = result.accepted.closureAt;
      batches.set(sha, batch);
    }
    const flow = result.repair.workflow;
    for (const group of roots.values()) {
      const linked = flow?.rootCause === group.root || group.cases.some(item =>
        (result.repair.evidence?.witness ?? []).some(path => path.includes(`/${item.id}/`)));
      if (!linked) continue;
      group.events.push(...(flow?.events ?? []));
      group.repairId = result.repair.id;
      group.publication = result.accepted ?? null;
    }
  }
  for (const batch of batches.values()) {
    if (batch.incomplete) batch.publishedAt = null;
    if (receipt?.verified && receipt.sha === batch.sha && batch.publishedAt) {
      batch.receiptStatus = 'complete';
      batch.acceptedAt = elapsed(batch.publishedAt, receipt.completedAt) !== null ? receipt.completedAt : null;
    }
  }
  const queue = [...roots.values()].map(group => {
    const events = group.events.filter(event => ['reported-ready', 'picked-up', 'returned-for-evidence'].includes(event.type)
      && time(event.at) !== null && event.evidence)
      .sort((a, b) => time(a.at) - time(b.at));
    const first = type => events.find(event => event.type === type)?.at ?? null;
    const latest = events.at(-1)?.type;
    const reported = group.cases.some(item => item.reportedReady);
    const sha = group.publication?.candidate.sha;
    const batch = batches.get(sha);
    const completed = group.cases.find(item => item.completion?.verified)?.completion;
    const accepted = batch?.receiptStatus === 'complete' || completed;
    const ready = first('reported-ready'), pickup = first('picked-up');
    const acceptedAt = batch?.acceptedAt ?? completed?.completedAt ?? null;
    const status = accepted ? 'accepted' : group.publication ? 'published; receipt unknown'
      : latest === 'returned-for-evidence' ? 'returned for evidence'
        : latest === 'picked-up' ? 'picked up' : reported || latest === 'reported-ready'
          ? 'reported ready' : 'awaiting qualification';
    return { root: group.root, caseIds: group.cases.map(item => item.id), keys: [...group.keys], prs: [...group.prs],
      status, ready, pickup, acceptedAt, sha: sha ?? completed?.sha ?? null,
      readyToPickupMs: elapsed(ready, pickup), pickupToAcceptedMs: elapsed(pickup, acceptedAt),
      readyToAcceptedMs: elapsed(ready, acceptedAt), events,
      outcomes: [...new Set(group.cases.map(item => item.outcome))] };
  }).filter(row => !row.outcomes.every(outcome => outcome === 'explained_negative'));
  const waits = (operations.noActionableHandoffIntervals ?? []).filter(interval =>
    interval.evidence && elapsed(interval.start, interval.end) !== null);
  return { queue, batches: [...batches.values()].filter(batch => batch.publishedAt)
      .sort((a, b) => time(a.publishedAt) - time(b.publishedAt)),
    waitingIntervals: waits, coverage: operations.transitionCoverage ?? 'partial; unrecorded transitions unknown' };
}
