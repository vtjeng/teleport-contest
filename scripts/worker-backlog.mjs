// Read-only coordination and dashboard lists derived from the worker ledger.
export function acceptedMain(state) {
    const latest = Object.values(state.deliveries).filter(delivery => delivery.acceptedAt)
        .sort((a, b) => (a.publishedAt ?? a.acceptedAt).localeCompare(b.publishedAt ?? b.acceptedAt)).at(-1);
    return latest ? { task: latest.task, commit: latest.publishedCommit ?? latest.integration,
        checkpoint: latest.supplementalCheckpoint ?? latest.checkpoint, acceptedAt: latest.acceptedAt } : null;
}

export function acceptedDependency(state, sha) {
    const delivery = state.deliveries[sha];
    if (!delivery) return false;
    // Accepting a correction accepts the task, not its failed original result.
    const latest = state.tasks[delivery.task]?.deliveries.at(-1);
    return Boolean(delivery.acceptedAt || state.deliveries[latest]?.acceptedAt);
}

export function pendingMainWork(state, admittedBatches = []) {
    const backlog = { deliveries: [], preparedBatches: [], parkedTasks: [] };
    for (const task of Object.values(state.tasks)) {
        const delivery = state.deliveries[task.deliveries.at(-1)];
        const batch = task.reservations?.find(key => key.startsWith('challenge-batch:'))?.split(':')[1];
        const row = { task: task.id, worker: task.worker, goal: task.goal ?? null,
            kind: task.kind, status: task.status, delivery: delivery?.delivery ?? null,
            since: delivery?.readyAt ?? task.assignedAt,
            blockedBy: [...new Set((delivery?.dependencies ?? [])
                .filter(sha => !acceptedDependency(state, sha))
                .map(sha => state.deliveries[sha]?.task ?? sha))] };
        if (task.status === 'parked') {
            backlog.parkedTasks.push({ ...row, since: task.parkedAt,
                reason: task.reason ?? 'No parking reason recorded.' });
        } else if (task.kind === 'challenge-preparation' && delivery?.acceptedAt) {
            if (!admittedBatches.includes(batch)) backlog.preparedBatches.push({ ...row,
                batch, since: delivery.acceptedAt, status: 'awaiting-admission' });
        } else if (['ready', 'integrating', 'validated', 'changes-required'].includes(task.status)) {
            backlog.deliveries.push(row);
        }
    }
    for (const row of backlog.deliveries) row.unblocks = backlog.deliveries
        .filter(other => other.status === 'ready' && other.blockedBy.length === 1
            && other.blockedBy[0] === row.task).length;
    const oldest = (a, b) => a.since.localeCompare(b.since);
    backlog.deliveries.sort(oldest);
    backlog.parkedTasks.sort(oldest);
    backlog.preparedBatches.sort((a, b) => a.batch.localeCompare(b.batch, 'en', { numeric: true }));
    return backlog;
}

// Saved measurements describe mismatch debt; reservations describe what workers
// can start. Neither a submitted delivery nor a parked cause is new worker work.
// Groups are candidates: workers still check callers and shared-state contracts.
export function workerWork(state, queue = null) {
    const tasks = Object.values(state.tasks);
    const workers = Object.values(state.workers ?? {}).filter(w => w.handle && w.worker !== 'Prep');
    const work = { status: 'unknown', implementationWorkers: workers.length,
        idleWorkers: workers.filter(w => w.turn === 'idle'
            && !tasks.some(t => t.worker === w.worker && t.status === 'working')).map(w => w.worker),
        mismatchingSessions: null, candidateGroups: null, investigations: [], sourceTasks: [], unavailable: [] };
    if (!queue || queue.mode !== 'work' || !Array.isArray(queue.sessions)) return work;
    if (queue.selectionBlocked || queue.blockers?.length) {
        return { ...work, status: 'blocked', blockers: queue.blockers ?? [] };
    }
    const sessions = [...new Map(queue.sessions.map(entry => [entry.session, entry])).values()];
    work.status = 'available';
    work.mismatchingSessions = sessions.length;
    for (const entry of sessions) {
        const parked = tasks.filter(t => t.status === 'parked'
            && (t.seed === entry.session || t.reservations?.includes(`session:${entry.session}`)));
        if (parked.length) {
            work.unavailable.push({ session: entry.session, status: 'parked-needs-recheck',
                blockedBy: parked.map(t => t.id), reason: parked.map(t => t.reason).filter(Boolean).join('; ') });
            continue;
        }
        const source = entry.investigation?.status === 'complete' ? entry.investigation.result?.source : null;
        const reservations = source?.file?.endsWith('.lua') ? [`source:${source.file}`]
            : source?.file?.endsWith('.c') && Array.isArray(source.functions)
                ? [...new Set(source.functions.flatMap(fn => {
                    const name = typeof fn === 'string' ? fn.match(/^[A-Za-z_]\w*/)?.[0] : null;
                    return name ? [`source:${source.file}:${name}`] : [];
                }))] : [];
        const blockedBy = [...new Set([`session:${entry.session}`, ...reservations]
            .flatMap(key => state.reservations?.[key]?.tasks ?? []))];
        if (blockedBy.length) {
            work.unavailable.push({ session: entry.session, status: 'reserved', blockedBy });
        } else if (!reservations.length) {
            work.investigations.push(entry.session);
        } else {
            // Merge overlapping scopes, including a case joining two existing groups.
            const shared = work.sourceTasks.filter(group => group.reservations.some(key => reservations.includes(key)));
            const group = { sessions: [...shared.flatMap(g => g.sessions), entry.session],
                reservations: [...new Set([...shared.flatMap(g => g.reservations), ...reservations])] };
            if (shared.length) {
                const first = work.sourceTasks.indexOf(shared[0]);
                work.sourceTasks = work.sourceTasks.filter(g => !shared.includes(g));
                work.sourceTasks.splice(first, 0, group);
            } else work.sourceTasks.push(group);
        }
    }
    work.candidateGroups = work.investigations.length + work.sourceTasks.length;
    return work;
}

// This guards saved queue reuse against admission or a newer recorded result.
// It does not certify source independence or replace checkpoint validation.
export function savedQueueIssues(queue, admittedBatches, scoreRows) {
    if (queue?.mode !== 'work' || !Array.isArray(queue.sessions)) return ['Use a saved combined work queue.'];
    const batches = queue.synthetic?.batches ?? [];
    const ids = batches.map(batch => batch.batch);
    const issues = [];
    if (ids.length !== admittedBatches.length || new Set(ids).size !== ids.length
        || admittedBatches.some(id => !ids.includes(id))) issues.push('Saved queue does not cover the admitted batches.');
    const latest = new Map(scoreRows.filter(row => row.event === 'challenge')
        .map(row => [row.challenge_manifest_sha256, row]));
    for (const batch of batches) {
        const row = latest.get(batch.manifestSha256);
        if (batch.status !== 'complete' || !row || !batch.evaluationPath || !batch.evaluationCommit
            || batch.evaluationPath !== row.challenge_evaluation || batch.evaluationCommit !== row.sha)
            issues.push(`${batch.batch}: saved queue does not match the latest recorded evaluation.`);
    }
    return issues;
}
