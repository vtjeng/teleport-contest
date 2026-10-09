// Read-only coordination and dashboard lists derived from the worker ledger.
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
