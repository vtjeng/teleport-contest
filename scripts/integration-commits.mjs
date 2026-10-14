// Apply every submitted task revision in order, not just its latest correction.
import {isDeepStrictEqual} from 'node:util';
import {deliveryGit, git, readDelivery, replacedCacheDelivery} from './worker-delivery.mjs';

export function integrateTaskCommits(root, state, taskId) {
    const task = state.tasks[taskId];
    const replaced = replacedCacheDelivery(root, state, task), integrated = [];
    for (const sha of task.deliveries) {
        if (sha === replaced) continue;
        const delivery = state.deliveries[sha], packet = readDelivery(delivery);
        if (!isDeepStrictEqual(deliveryGit(root, delivery.base, sha), packet.git))
            throw new Error(`submitted Git metadata changed: ${sha}`);
        const missing = new Set(git(root, 'cherry', 'HEAD', sha, delivery.base)
            .split('\n').filter(row => row.startsWith('+')).map(row => row.slice(2)));
        for (const commit of delivery.commits) if (missing.has(commit)) {
            // Resolving a submitted add over an existing file changes its patch
            // identity. Skip only when every changed path has the exact submitted
            // blob and mode (including deletions); empty metadata still gets picked.
            const parents = packet.git.parents[commit];
            const paths = parents.length === 1 ? git(root, 'diff', '--no-renames', '--name-only', '-z', parents[0], commit)
                .split('\0').filter(Boolean) : [];
            if (paths.length && git(root, '--literal-pathspecs', 'ls-tree', '-rz', 'HEAD', '--', ...paths)
                === git(root, '--literal-pathspecs', 'ls-tree', '-rz', commit, '--', ...paths)) continue;
            // Keep originally empty metadata commits; unexpected empty source
            // patches still stop for inspection rather than being dropped.
            git(root, 'cherry-pick', '--allow-empty', commit);
            integrated.push(commit);
        }
    }
    return integrated;
}
