// Pure, browser-compatible task-cohort metrics. No gameplay or packet I/O.
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const timestamp = value => {
    const result = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(result)) throw new Error('Exploration yield requires a valid timestamp');
    return result;
};
const iso = value => new Date(timestamp(value)).toISOString();

/** Merge current ledger identities with optional, digest-bound retrospective audit facts.
 * Unreviewed future receipts remain visible with unknown usability/classification.
 * The caller loads the sanitized audit JSON; this module never reads private files.
 */
export function buildExplorationYieldPayload(ledger, {asOf, auditIndex = {}, minBatch = 91} = {}) {
    const events = ledger?.events ?? [];
    const cutoff = timestamp(asOf ?? events.at(-1)?.at ?? Date.now());
    const audits = auditIndex.packets ?? {};
    const kinds = new Map(Object.values(audits).map(row => [row.taskId, row.kind]));
    const tasks = new Map();
    let mainSupportAssignments = 0, rejectedAuditBindings = 0;
    for (const event of events) {
        if (timestamp(event.at) > cutoff) continue;
        if (event.type === 'queue-enqueue') {
            const task = event.assignment;
            if (task?.type !== 'exploration') continue;
            if (task.producer === 'Main') {mainSupportAssignments++; continue;}
            const batch = /^v([1-9]\d*)$/u.exec(task.batch ?? '');
            if (task.producer !== 'Prep' || !batch || Number(batch[1]) < minBatch) continue;
            tasks.set(task.id, {id: task.id, batch: task.batch, claimedAt: null, closedAt: null,
                terminal: null, outcome: null, packetDigest: null,
                kind: kinds.get(task.id) ?? ((task.targetTask || task.evidenceContract?.targetTask) ? 'follow-up' : 'discovery')});
        }
        const task = tasks.get(event.task);
        if (!task) continue;
        if (event.type === 'queue-claim') {
            task.claimedAt ??= iso(event.at);
            task.closedAt = null; task.terminal = null; task.outcome = null; task.packetDigest = null;
        } else if (['queue-result', 'queue-block'].includes(event.type)) {
            task.closedAt = iso(event.at);
            task.terminal = event.type === 'queue-result' ? 'result' : 'block';
            task.outcome = event.outcome ?? null;
            const stem = String(event.packet ?? '').split('/').at(-1)?.replace(/\.json$/u, '');
            task.packetDigest = digest(event.digest) ? event.digest : digest(stem) ? stem : null;
        }
    }
    const records = [...tasks.values()].map(task => {
        const candidate = audits[task.packetDigest];
        const audit = candidate?.taskId === task.id ? candidate : null;
        if (candidate && !audit) rejectedAuditBindings++;
        return {...task, usable: audit?.usable ?? 'unknown', classification: audit?.classification ?? 'unknown',
            usableBasis: audit?.usableBasis ?? 'No packet-level usability audit available.',
            qualifyingSessionIds: [], bugFamilyIds: [],
            evidence: task.packetDigest ? [{kind: 'packet', digest: task.packetDigest}] : [{kind: 'ledger'}]};
    });
    const byId = new Map(records.map(row => [row.id, row]));
    for (const session of auditIndex.sessions ?? []) {
        const record = byId.get(session.taskId);
        if (!record?.closedAt || timestamp(session.admittedAt) > cutoff) continue;
        record.qualifyingSessionIds.push(session.id);
        if (session.bugFamilyId) record.bugFamilyIds.push(session.bugFamilyId);
    }
    const markers = (auditIndex.markers ?? []).filter(marker => timestamp(marker.at) <= cutoff)
        .map(marker => ({...marker, at: iso(marker.at)}));
    return {schemaVersion: 1, asOf: iso(cutoff), records, markers,
        coverage: {...auditIndex.coverage, ledgerStart: events[0]?.at ?? null,
            discoveryFromBatch: `v${minBatch}`, physicalCAttempts: null, usableSessionCount: null,
            mainSupportAssignments, linkedAssignments: records.filter(row => row.kind !== 'discovery').length,
            preclaimAssignments: records.filter(row => !row.claimedAt).length, rejectedAuditBindings,
            auditAsOf: auditIndex.asOf ?? null,
            notes: [...(auditIndex.coverage?.notes ?? []),
                'Denominator: closed independently assigned Prep discovery tasks; Main support, linked follow-ups and unclaimed retirements are excluded.',
                'Usability counts tasks reporting usable C/replay/comparison evidence, not physical sessions or recorder invocations.',
                'Qualified sessions are attributed retrospectively to original discovery closure; admission may occur later or in another batch.',
                'Task elapsed time is not active compute time. Empty sample buckets have no yield estimate.']}};
}

/** UTC-aligned buckets, selected range inclusive. taskYield is sessions per 100 closed tasks. */
export function aggregateExplorationYield(payload, {bucketMs = 3600000, start, end} = {}) {
    // Keep this function self-contained: the static dashboard embeds toString().
    const timestamp = value => {
        const result = typeof value === 'number' ? value : Date.parse(value);
        if (!Number.isFinite(result)) throw new Error('Exploration yield requires a valid timestamp');
        return result;
    };
    const blank = () => ({claimedTasks: 0, closedTasks: 0, usableYes: 0, usableNo: 0,
        usableUnknown: 0, qualifyingSessions: 0, distinctFamilies: 0, taskYield: null});
    if (!Number.isFinite(bucketMs) || bucketMs <= 0) throw new Error('A positive bucket duration is required');
    const asOf = timestamp(payload.asOf);
    const records = (payload.records ?? []).filter(row => row.kind === 'discovery' && row.claimedAt)
        .sort((a, b) => (a.closedAt ? timestamp(a.closedAt) : Infinity) - (b.closedAt ? timestamp(b.closedAt) : Infinity));
    const times = records.flatMap(row => [row.claimedAt, row.closedAt].filter(Boolean).map(timestamp))
        .filter(time => time <= asOf);
    end = timestamp(end ?? asOf);
    start = timestamp(start ?? (times.length ? Math.min(...times) : end - bucketMs));
    if (end < start) throw new Error('Range end precedes its start');
    const origin = Math.floor(start / bucketMs) * bucketMs;
    const count = Math.floor((end - origin) / bucketMs) + 1;
    if (count > 10000) throw new Error('Exploration yield range has too many buckets');
    const buckets = Array.from({length: count}, (_, index) => ({start: origin + index * bucketMs,
        end: Math.min(end, origin + (index + 1) * bucketMs), ...blank(), classifications: {}}));
    const totals = {...blank(), classifications: {}};
    const seenSessions = buckets.map(() => new Set()), seenFamilies = buckets.map(() => new Set());
    const allSessions = new Set(), allFamilies = new Set(), seenTasks = new Set();
    const priorSessions = new Set(), priorFamilies = new Set();
    const inside = time => time >= start && time <= end && time <= asOf;
    for (const record of records) {
        if (seenTasks.has(record.id)) continue;
        seenTasks.add(record.id);
        const claimed = timestamp(record.claimedAt);
        if (inside(claimed)) {buckets[Math.floor((claimed - origin) / bucketMs)].claimedTasks++; totals.claimedTasks++;}
        if (!record.closedAt) continue;
        const closed = timestamp(record.closedAt);
        if (closed > asOf) continue;
        const newSessions = [...new Set(record.qualifyingSessionIds ?? [])].filter(id => !priorSessions.has(id));
        newSessions.forEach(id => priorSessions.add(id));
        const newFamilies = newSessions.length ? [...new Set(record.bugFamilyIds ?? [])]
            .filter(id => !priorFamilies.has(id)) : [];
        newFamilies.forEach(id => priorFamilies.add(id));
        if (!inside(closed)) continue;
        const index = Math.floor((closed - origin) / bucketMs), bucket = buckets[index];
        const usability = record.usable === 'yes' ? 'usableYes' : record.usable === 'no' ? 'usableNo' : 'usableUnknown';
        const classification = record.classification ?? 'unknown';
        for (const value of [bucket, totals]) {
            value.closedTasks++; value[usability]++;
            value.classifications[classification] = (value.classifications[classification] ?? 0) + 1;
        }
        for (const id of newSessions) {seenSessions[index].add(id); allSessions.add(id);}
        for (const id of newFamilies) {seenFamilies[index].add(id); allFamilies.add(id);}
    }
    function finish(row, sessions, families) {
        row.qualifyingSessions = sessions.size; row.distinctFamilies = families.size;
        row.taskYield = row.closedTasks ? 100 * row.qualifyingSessions / row.closedTasks : null;
    }
    buckets.forEach((bucket, index) => finish(bucket, seenSessions[index], seenFamilies[index]));
    finish(totals, allSessions, allFamilies);
    return {schemaVersion: 1, asOf, range: {start, end, bucketMs}, buckets, totals,
        markers: (payload.markers ?? []).map(marker => ({...marker, at: timestamp(marker.at)}))
            .filter(marker => inside(marker.at)), coverage: payload.coverage ?? {}};
}
