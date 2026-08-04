import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
    defender.mconf = true;
    defender.mcanmove = false;
    assert.equal(mattackm(aggressor, defender, { state }), M_ATTK_MISS);
    assert.equal(defender.msleeping, false);
    assert.equal(defender.mcanmove, false);
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
