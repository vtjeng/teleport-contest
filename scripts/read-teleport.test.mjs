import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SCR_TELEPORTATION } from '../js/objects.js';
import { loadReadTeleportRecipe } from './run-read-teleport.mjs';

function inventorySnapshot(state = game) {
    const objects = [];
    for (let obj = state.invent; obj; obj = obj.nobj) objects.push(obj);
    return objects;
}

test('ordinary uncursed teleportation scroll relocates and is consumed',
    async () => {
    const replay = await runSegment(loadReadTeleportRecipe().segments[0]);

    assert.equal(game.u.ux, 57);
    assert.equal(game.u.uy, 15);
    assert.equal(
        game._pending_message,
        'You materialize in a different location!',
    );
    assert.equal(game.u.uconduct.literate, 1);
    assert.equal(
        inventorySnapshot().some((obj) => obj.otyp === SCR_TELEPORTATION),
        false,
    );

    // C's safe_teleds() tries three rejected candidates before (57, 15).
    // The first draw is seffects()'s Wisdom exercise, followed by each
    // rnd(COLNO - 1), rn2(ROWNO) candidate pair.
    const rng = replay.getRngLog();
    const effect = rng.findIndex((value, index) => (
        value === 'rn2(19)=10'
        && rng.slice(index, index + 9).join('|')
            === 'rn2(19)=10|rnd(79)=11|rn2(21)=12|rnd(79)=11|rn2(21)=2'
                + '|rnd(79)=79|rn2(21)=17|rnd(79)=57|rn2(21)=15'
    ));
    assert.notEqual(effect, -1);
});
