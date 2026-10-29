// Self-contained DOM renderer, embedded by build-dashboard. All evidence text is
// assigned with textContent; no source-controlled markup enters innerHTML.
export function renderWorkflow(document, evidence, view, summarize, publication) {
  const target = document.getElementById('workflowEvidence');
  if (!target) return;
  target.replaceChildren();
  const element = (tag, text, cls) => {
    const node = document.createElement(tag); if (text != null) node.textContent = text;
    if (cls) node.className = cls; return node;
  };
  const add = (parent, tag, text, cls) => { const node = element(tag, text, cls); parent.append(node); return node; };
  const stamp = value => value ? new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : 'unknown';
  const short = value => value?.slice(0, 12) ?? 'unknown';
  const link = (parent, text, url) => {
    if (!/^https:\/\/github.com\/vtjeng\/teleport-contest\//u.test(url ?? '')) return add(parent, 'span', text);
    const node = add(parent, 'a', text); node.href = url; return node;
  };
  const details = (parent, label) => { const node = add(parent, 'details'); add(node, 'summary', label); return node; };
  const policy = view?.operations?.workflow;
  add(target, 'h2', 'Sessions & handoffs', 'section-title');
  add(target, 'p', policy ? `Reported topology · ${stamp(policy.asOf)}. Main batches up to ${policy.batchPolicy.maxRepairs} compatible repairs; oldest-ready flush ${policy.batchPolicy.oldestReadyFlushMinutes} minutes.`
    : 'Session topology unknown at this revision.', 'compact-note');
  const lanes = add(target, 'div', null, 'workflow-lanes');
  for (const session of policy?.sessions ?? []) {
    const lane = add(lanes, 'article', null, 'workflow-card'); add(lane, 'strong', session.name);
    add(lane, 'p', session.role); add(lane, 'small', session.status);
  }
  if (!evidence || evidence.version !== 1) { add(target, 'p', 'Evidence projection unavailable. Queue and review coverage unknown.'); return; }
  for (const cohort of evidence.cohorts) {
    if (['last-known', 'not-applied'].includes(cohort.refresh?.state))
      add(target, 'p', `${cohort.id}: LAST-KNOWN review data. Refresh attempt ${stamp(cohort.refresh.attemptedAt)} failed or was not applied; last successful source refresh ${stamp(cohort.refresh.lastSuccessAt)}. ${cohort.refresh.error}`, 'workflow-rate');
  }
  const flow = summarize({ cases: evidence.cases, results: view.results,
    operations: { ...view.operations, transitionCoverage: policy?.transitionCoverage },
    receipt: publication ? { sha: publication.sha, verified: true, completedAt: null } : null });
  add(target, 'p', 'Selected pinned handoffs, not the complete queue · ' + flow.coverage, 'compact-note');
  const queue = add(target, 'div', null, 'workflow-queue');
  const duration = value => value == null ? 'unknown' : (value / 60000).toFixed(1) + ' min';
  for (const row of flow.queue) {
    const card = add(queue, 'article', null, 'workflow-card');
    add(card, 'strong', row.status, 'workflow-status');
    add(card, 'p', row.caseIds.join(' · '));
    const refs = add(card, 'p');
    row.caseIds.forEach(id => { const item = evidence.cases.find(item => item.id === id);
      if (item) { link(refs, 'Evidence ' + short(item.ref), item.url); refs.append(' · '); } });
    row.prs.forEach(pr => { link(refs, `PR #${pr}`, `https://github.com/vtjeng/teleport-contest/pull/${pr}`); refs.append(' '); });
    add(card, 'small', `${row.keys.length} scanner keys · ${row.root.startsWith('case:') ? 'semantic root unrecorded' : row.root}`);
    const timing = details(card, 'Observed latency & transitions');
    for (const [label, value] of [['Ready → pickup', row.readyToPickupMs], ['Pickup → accepted', row.pickupToAcceptedMs], ['Ready → accepted', row.readyToAcceptedMs]]) add(timing, 'p', `${label}: ${duration(value)}`);
    add(timing, 'p', `Ready ${stamp(row.ready)} · pickup ${stamp(row.pickup)} · accepted ${stamp(row.acceptedAt)}`);
    if (!row.events.length) add(timing, 'p', 'No timed transitions recorded. PR creation and package validation do not establish readiness or acceptance.');
    for (const event of row.events) add(timing, 'p', `${event.type} · ${stamp(event.at)}`);
  }
  add(target, 'p', `Consumer waiting: ${flow.waitingIntervals.length ? flow.waitingIntervals.length + ' explicitly recorded no-actionable-handoff intervals' : 'unknown; no explicit intervals recorded'}. Ready-to-pickup delay belongs to the producer backlog. Wall-clock gaps do not measure idle time, active compute, token cost or savings; interruptions can make durations ambiguous.`, 'compact-note');
  const batches = details(target, 'Publication groups & receipt coverage');
  add(batches, 'p', 'Shared gates are grouped once by candidate SHA. A publication-verified repair is not necessarily backed by a recorded complete receipt. Historical receipt coverage remains unknown.');
  for (const batch of flow.batches.slice(-5).reverse()) add(batches, 'p', `${short(batch.sha)} · ${batch.repairs.length} repairs · publication ${stamp(batch.publishedAt)} · complete receipt: ${batch.receiptStatus} · receipt completion time ${stamp(batch.acceptedAt)}`);
  add(target, 'h2', 'Discovery outcomes', 'section-title workflow-heading');
  add(target, 'p', 'Finite scanner inventories, selected analyst reviews. Explained negatives are separate from confirmed divergences, accepted fixes, duplicates, invalid setups and unresolved leads. A failed reproduction is not automatically a false positive.', 'compact-note');
  const controls = add(target, 'label', 'Inventory ', 'workflow-controls');
  const select = add(controls, 'select'); select.setAttribute('aria-label', 'Discovery inventory');
  evidence.cohorts.forEach((cohort, index) => { const option = add(select, 'option', cohort.id); option.value = String(index); });
  const cohortNode = add(target, 'div');
  function renderCohort() {
    cohortNode.replaceChildren(); const cohort = evidence.cohorts[Number(select.value)]; if (!cohort) return;
    const s = cohort.summary, c = s.counts;
    const refresh = cohort.refresh;
    add(cohortNode, 'p', refresh
      ? `Published-source refresh: ${refresh.state} · attempted ${stamp(refresh.attemptedAt)} · last success ${stamp(refresh.lastSuccessAt)}. This checks source heads, not discovery execution or review times.`
      : 'Published-source refresh has not been recorded; showing the configured pinned snapshot.', 'compact-note');
    for (const source of refresh?.resolved ?? []) add(cohortNode, 'p', `Observed source ${source.pr ? 'PR #' + source.pr : source.branch}: ${short(source.head)} · applied only when refresh is updated or unchanged.`, 'compact-note');
    const tiles = add(cohortNode, 'div', null, 'workflow-lanes');
    for (const [label, value] of [['Scanner keys in scope', s.total], ['Reviewed keys', s.reviewed], ['Conclusive keys', s.resolved], ['No current review', s.withoutCurrentReview]]) {
      const tile = add(tiles, 'div', null, 'workflow-card'); add(tile, 'strong', String(value), 'workflow-number'); add(tile, 'span', label);
    }
    add(cohortNode, 'p', `${cohort.rawFileScoped} raw file-scoped keys before scope exclusions. ${c.stale} stale bindings are included in “no current review”; they are not current negatives.`, 'compact-note');
    const table = add(cohortNode, 'table', null, 'workflow-outcomes');
    const head = add(table, 'thead'), tr = add(head, 'tr'); ['Recorded outcome', 'Keys', 'Named roots'].forEach(text => add(tr, 'th', text));
    const body = add(table, 'tbody');
    for (const [key, label] of Object.entries({ explained_negative: 'Explained negative', confirmed: 'Confirmed divergence', accepted: 'Accepted fix', duplicate: 'Duplicate / already fixed', unresolved: 'Unresolved', invalid_setup: 'Invalid setup', unreachable: 'Unreachable', missing_coverage: 'Missing coverage', stale: 'Stale binding', unreviewed: 'Unreviewed', unknown: 'Unknown disposition' })) {
      const row = add(body, 'tr'); add(row, 'th', label); add(row, 'td', String(c[key])); add(row, 'td', ['stale', 'unreviewed'].includes(key) ? 'unknown' : String(s.causes[key]));
    }
    add(cohortNode, 'p', `Negative share of conclusively reviewed keys: ${s.negativeShare == null ? 'unknown' : (100 * s.negativeShare).toFixed(1) + '%'} = ${c.explained_negative} explained negatives ÷ (${c.explained_negative} negatives + ${c.confirmed} confirmed + ${c.accepted} accepted). Excludes unresolved, duplicate, setup failures, stale and unreviewed keys. Selected reviews are biased; this is not a population false-positive rate.`, 'workflow-rate');
    add(cohortNode, 'p', `Semantic causes: ${s.classifiedCauses} explicitly named roots; ${s.missingCauseIdentity} reviewed keys lack a root identity. Cause-level negative share: ${s.causeNegativeShare == null ? 'unknown (incomplete root classification)' : (100 * s.causeNegativeShare).toFixed(1) + '% (negative roots / negative + confirmed + accepted roots)'}. Keys are never divided by cause counts.`, 'compact-note');
    const strata = details(cohortNode, 'Technique versions, filters & coverage');
    const completion = cohort.completionCoverage;
    if (completion) add(strata, 'p', `${completion.verified} verified explicit completion references of ${completion.references} configured; ${completion.unsupported} unsupported/incomplete notices. Cases without matching machine-readable completion evidence retain unknown acceptance. Observation times are not receipt-completion times.`);
    add(strata, 'p', `${cohort.unboundCases?.length ?? 0} manual/differently bound cases and ${cohort.skippedMetadata?.length ?? 0} unsupported metadata records remain outside this scanner denominator.`);
    for (const item of cohort.unboundCases ?? []) { const row = add(strata, 'p'); link(row, item.id, item.url); row.append(` · ${item.outcome} · ${item.reason}`); }
    for (const item of cohort.skippedMetadata ?? []) add(strata, 'p', `${item.path}: ${item.reason}`);
    add(strata, 'p', `${s.filters.exactBoundDecisions} exact bound negative decisions; ${s.filters.heuristicPriorityHints} priority-only hints retained in this inventory. Hint coverage is partial; absence of a hint is not an exclusion or a negative.`);
    add(strata, 'p', 'Strata remain within one pinned run/source/configuration. Repeated method versions are not merged. Exact bound decisions exclude only their proven keys; heuristic hints only lower priority. No review here establishes correctness on current Main.');
    for (const stratum of cohort.strata) add(strata, 'p', `${stratum.method.kind} · ${stratum.method.version} · ${stratum.total} keys / ${stratum.reviewed} reviewed / ${stratum.resolved} conclusive / ${stratum.counts.explained_negative} negatives / ${stratum.counts.unresolved} unresolved.`);
    add(strata, 'p', `${cohort.techniqueCoverageUnknown} keys with technique coverage unknown. Older unbound hypotheses and manual inventories are outside this denominator, not resolved by it.`);
    add(strata, 'p', `Configuration: ${JSON.stringify(cohort.configHashes)}. Tools: ${JSON.stringify(cohort.toolHashes)}.`);
    add(cohortNode, 'p', `Scanner completed ${stamp(cohort.scanCompletedAt)} · recorded review watermark ${stamp(cohort.reviewAsOf)} (not complete coverage) · source ${short(cohort.scanBase)} · C ${short(cohort.cGitlink)} · run ${cohort.runId}.`, 'compact-note');
    link(cohortNode, `Pinned evidence PR #${cohort.pr} · ${short(cohort.ref)}`, `https://github.com/vtjeng/teleport-contest/tree/${cohort.ref}`);
  }
  select.addEventListener('change', renderCohort); renderCohort();
  const audits = details(target, 'Completed finite static audits · separate units');
  add(audits, 'p', 'Matching catalog fields are comparisons, not thousands of negative bug leads. They do not establish runtime correctness. These audits are excluded from scanner rates and gameplay repair counts.');
  for (const audit of evidence.audits) { const item = add(audits, 'p'); link(item, `PR #${audit.pr} · ${audit.id}`, audit.url); item.append(' · ' + audit.scope); }
  const freshness = details(target, 'Source freshness & known gaps');
  add(freshness, 'p', `Repair register observed ${stamp(view.registerAsOf)} at ${short(view.sourceSha)}. Score receipt ${short(publication?.sha)}. Session topology observed ${stamp(policy?.asOf)}. Scanner/review snapshots retain their own pinned revisions above; Refresh public status does not refresh them. New receipts may arrive in the next ordinary publication.`);
  add(freshness, 'p', 'No complete project-wide queue, lifetime repair total or discovery denominator is available. Static audit counts, manual hypotheses and scanner keys are distinct units. Zero in an outcome cell means no recorded classification in this inventory, not proof that no such cases exist.');
  for (const source of evidence.sources) { const row = add(freshness, 'p'); link(row, `${short(source.ref)} · ${source.path}`, source.url); }
}
