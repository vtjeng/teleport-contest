import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_SUGGEST,
    W_RINGL,
} from '../js/const.js';
import { remove_ok } from '../js/do_wear.js';
import { game } from '../js/gstate.js';
import { ARMOR_CLASS, RING_CLASS, RIN_REGENERATION } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import {
    TAKEOFF_KEY,
    WAIT,
    loadTakeOffRecipe,
} from './run-take-off-armor.mjs';

test('remove_ok matches equip_ok for the R command source filter', async () => {
    const segment = loadTakeOffRecipe().segments.find(
        ({ moves }) => moves === `${WAIT}${TAKEOFF_KEY}${WAIT}`,
    );
    assert.ok(segment);
    await runSegment({ ...segment, moves: WAIT });

    const ring = {
        oclass: RING_CLASS,
        otyp: RIN_REGENERATION,
        owornmask: W_RINGL,
        cursed: 0,
    };
    assert.equal(await remove_ok(ring, game), GETOBJ_SUGGEST);
    assert.equal(await remove_ok({ ...ring, owornmask: 0 }, game),
        GETOBJ_EXCLUDE_INACCESS);
    assert.equal(await remove_ok({ ...ring, oclass: ARMOR_CLASS }, game),
        GETOBJ_DOWNPLAY);
    assert.equal(await remove_ok({ ...ring, oclass: 'weapon' }, game),
        GETOBJ_EXCLUDE);
    assert.equal(await remove_ok(null, game), GETOBJ_EXCLUDE);
});
