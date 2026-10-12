// Recover publication bounds from previously verified pushes, not commit dates.
import { git } from './worker-delivery.mjs';

export function publicationConfirmations(root, state) {
    const pending = Object.values(state.deliveries).filter(delivery => delivery.acceptedAt && !delivery.publishedCommit);
    const published = Object.values(state.deliveries).filter(delivery => delivery.publishedAt)
        .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
    if (!pending.length || !published.length) return [];
    // Read the commit graph once. Reconciliation must not start a Git process
    // for every pair of an old delivery and a later recorded publication.
    const graph = new Map(git(root, 'rev-list', '--parents',
        ...new Set(published.map(delivery => delivery.publishedCommit))).split('\n')
        .map(line => { const [commit, ...parents] = line.split(' '); return [commit, parents]; }));
    const events = [];
    const remaining = new Set(pending);
    for (const proof of published) {
        const ancestors = new Set(), stack = [proof.publishedCommit];
        while (stack.length) {
            const commit = stack.pop();
            if (ancestors.has(commit)) continue;
            ancestors.add(commit);
            stack.push(...(graph.get(commit) ?? []));
        }
        for (const delivery of remaining) {
            if (!ancestors.has(delivery.integration) || delivery.acceptedAt > proof.publishedAt) continue;
            events.push({ id: `publication-confirmed-${delivery.task}-${proof.publishedCommit}`,
                type: 'publication-confirmed', task: delivery.task, commit: proof.publishedCommit,
                knownBy: proof.publishedAt, evidenceTask: proof.task });
            remaining.delete(delivery);
        }
        if (!remaining.size) break;
    }
    return events;
}
