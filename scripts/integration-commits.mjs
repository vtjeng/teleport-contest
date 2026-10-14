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
            git(root, 'cherry-pick', commit);
            integrated.push(commit);
        }
    }
    return integrated;
}
