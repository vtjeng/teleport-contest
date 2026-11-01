import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLD_RES,
    FROMEXPER,
    FROMOUTSIDE,
    POISON_RES,
    STONE_RES,
    W_RINGL,
} from '../js/const.js';
import { give_u_to_m_resistances } from '../js/mondata.js';
import { MR_COLD, MR_POISON, MR_STONE } from '../js/monsters.js';

// A hero property table with every slot empty, shaped like u.uprops[].
function heroWith(props) {
    const uprops = Array.from({ length: 70 }, () => (
        { intrinsic: 0, extrinsic: 0, blocked: 0 }));
    for (const [prop, field, bits] of props) uprops[prop][field] = bits;
    return { u: { uprops } };
}

test('give_u_to_m_resistances copies intrinsic FIRE_RES..STONE_RES bits', () => {
    const state = heroWith([
        // A Valkyrie's level-1 cold resistance (role intrinsic).
        [COLD_RES, 'intrinsic', FROMEXPER],
        // Poison resistance from eating a corpse.
        [POISON_RES, 'intrinsic', FROMOUTSIDE],
        // Stone resistance from a worn ring only: extrinsic, not copied.
        [STONE_RES, 'extrinsic', W_RINGL],
    ]);
    // The monster already resists stoning by itself; the bit must survive.
    const mtmp = { mintrinsics: MR_STONE };

    give_u_to_m_resistances(mtmp, state);
    // prop.h res_to_mr(): COLD_RES 2 -> MR_COLD 0x02, POISON_RES 6 ->
    // MR_POISON 0x20; the extrinsic stone ring adds nothing.
    assert.equal(mtmp.mintrinsics, MR_STONE | MR_COLD | MR_POISON);
});
