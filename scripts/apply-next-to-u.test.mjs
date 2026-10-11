import assert from 'node:assert/strict';
import test from 'node:test';

import { get_iter_mons_async } from '../js/mon.js';

test('get_iter_mons_async awaits callbacks in cached-next source order',
    async () => {
    // mon.c:4544-4555 saves nmon before calling bfunc, skips dead and off-map
    // monsters, and returns the first monster whose callback answers TRUE.
    const dead = { mhp: 0, nmon: null };
    const offMap = { mhp: 4, mstate: 1, nmon: null };
    const first = { mhp: 4, nmon: null };
    const match = { mhp: 4, nmon: null };
    const later = { mhp: 4, nmon: null };
    dead.nmon = offMap;
    offMap.nmon = first;
    first.nmon = match;
    match.nmon = later;
    const state = { level: { monlist: dead } };
    const visited = [];

    const result = await get_iter_mons_async(async (monster) => {
        visited.push(monster);
        await Promise.resolve();
        if (monster === first) {
            // A callback may unlink its current node after the iterator has
            // cached the next C nmon pointer.
            first.nmon = null;
            return false;
        }
        return monster === match;
    }, state);

    assert.equal(result, match);
    assert.deepEqual(visited, [first, match]);
});
