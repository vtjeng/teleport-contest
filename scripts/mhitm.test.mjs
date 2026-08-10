import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DETECT_MONSTERS,
    helpless,
    IN_SIGHT,
    M_ATTK_MISS,
    ROOM,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { mattackm } from '../js/mhitm.js';
import {
    MONSTER_TEMPLATES,
    PM_GIANT_ANT,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_PONY,
} from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';

function attackState(pmidx) {
    const level = new GameMap();
    for (let x = 1; x < 12; ++x) {
        for (let y = 1; y < 9; ++y) level.at(x, y).typ = ROOM;
    }
    const state = {
        gb: { bhitpos: { x: 5, y: 5 } },
        gn: { notonhead: false },
        gs: { skipdrin: true },
        gv: { vis: false },
        level,
        moves: 17,
        u: { ux: 2, uy: 2, uprops: [], uswallow: false, uinwater: false },
        viz_array: Array.from(
            { length: 21 },
            () => Array(80).fill(0),
        ),
    };
    const aggressor = newMonster({
        data: MONSTER_TEMPLATES[pmidx],
        m_lev: 2,
        mcanmove: true,
        mcansee: true,
        mhp: 8,
        mtame: 10,
        mextra: { edog: { hungrytime: 1000 } },
        mx: 5,
        my: 5,
    });
    const defender = newMonster({
        data: MONSTER_TEMPLATES[PM_GIANT_ANT],
        m_lev: 2,
        mcanmove: true,
        mcansee: true,
        mhp: 8,
        mx: 8,
        my: 5,
    });
    place_monster(aggressor, aggressor.mx, aggressor.my, state);
    place_monster(defender, defender.mx, defender.my, state);
    state.level.monlist = aggressor;
    aggressor.nmon = defender;
    state.viz_array[aggressor.my][aggressor.mx] = IN_SIGHT;
    state.viz_array[defender.my][defender.mx] = IN_SIGHT;
    return { aggressor, defender, state };
}

// monst.h:251 is `#define helpless(mon) ((mon)->msleeping || !(mon)->mcanmove)`
// and js/const.js owns it for the eleven call sites that used to spell it out.
// mhitm.c reads it four times, at 310, 322, 582 and 1252, more than any other
// C file, so its unit test lives beside them.
//
// The four rows are the truth table. The pairs cover both encodings the port
// writes: js/monst.js:49 and :53 start a monster at false/false, js/mon.js:972
// wakes one with true, and js/steed.js:743 and :749 write 0 and 1 for the same
// two fields.
test('helpless reads sleep and immobility and nothing else', () => {
    assert.equal(helpless({ msleeping: false, mcanmove: true }), false);
    assert.equal(helpless({ msleeping: true, mcanmove: true }), true);
    assert.equal(helpless({ msleeping: 0, mcanmove: 0 }), true);
    assert.equal(helpless({ msleeping: 1, mcanmove: 1 }), true);
    // mfrozen, mtrapped and meating are separate C terms; a monster carrying
    // all three and neither of the two fields above is not helpless.
    assert.equal(
        helpless({
            msleeping: false,
            mcanmove: true,
            mfrozen: 7,
            mtrapped: true,
            meating: 5,
        }),
        false,
    );
});

for (const pmidx of [PM_KITTEN, PM_LITTLE_DOG, PM_PONY]) {
    test(`mattackm preserves distant physical miss setup for pet ${pmidx}`,
        () => {
            const { aggressor, defender, state } = attackState(pmidx);
            assert.equal(mattackm(aggressor, defender, { state }), M_ATTK_MISS);
            assert.equal(aggressor.mlstmv, state.moves);
            assert.equal(state.gs.skipdrin, false);
            assert.equal(state.gv.vis, true);
            assert.equal(defender.mhp, 8);
        });
}

test('mattackm wakes a sleeping distant defender without a hit draw', () => {
    const { aggressor, defender, state } = attackState(PM_PONY);
    defender.msleeping = true;
    assert.equal(mattackm(aggressor, defender, { state }), M_ATTK_MISS);
    assert.equal(defender.msleeping, false);
    assert.equal(defender.mcanmove, true);
});

test('mattackm sees an action when exactly one combatant is visible', () => {
    const { aggressor, defender, state } = attackState(PM_KITTEN);
    state.viz_array[defender.my][defender.mx] = 0;
    assert.equal(mattackm(aggressor, defender, { state }), M_ATTK_MISS);
    assert.equal(state.gv.vis, true);
});

test('mattackm clears stale action visibility outside hero sight', () => {
    const { aggressor, defender, state } = attackState(PM_LITTLE_DOG);
    state.viz_array[aggressor.my][aggressor.mx] = 0;
    state.viz_array[defender.my][defender.mx] = 0;
    state.u.uprops[DETECT_MONSTERS] = {
        intrinsic: 1,
        extrinsic: 0,
        blocked: 0,
    };
    state.gv.vis = true;
    assert.equal(mattackm(aggressor, defender, { state }), M_ATTK_MISS);
    assert.equal(state.gv.vis, false);
});

test('mattackm refuses excluded combat before setup writes', () => {
    const { aggressor, defender, state } = attackState(PM_PONY);
    defender.mx = 6;
    assert.throws(
        () => mattackm(aggressor, defender, { state }),
        /nonadjacent target/,
    );
    assert.equal(aggressor.mlstmv, 0);
    assert.equal(state.gs.skipdrin, true);
    assert.equal(state.gv.vis, false);
});
