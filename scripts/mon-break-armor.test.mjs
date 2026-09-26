import assert from 'node:assert/strict';
import test from 'node:test';

import { GameMap } from '../js/game.js';
import { newcham } from '../js/mon.js';
import * as M from '../js/monsters.js';
import { newMonster } from '../js/monst.js';

function levelConstructionState() {
    const state = {
        level: new GameMap(),
        u: {
            ux: 5,
            uy: 5,
            uz: { dnum: 0, dlevel: 1 },
            uprops: [],
        },
        dungeons: [{
            depth_start: 1,
            ledger_start: 0,
            num_dunlevs: 29,
            entry_lev: 1,
            flags: { hellish: false },
        }],
    };
    M.monst_globals_init(state);
    M.reset_mvitals(state);
    state.in_mklev = true;
    state.youmonst = { data: state.mons[M.PM_HUMAN] };
    return state;
}

test('newcham remains synchronous during level construction without armor effects', () => {
    const state = levelConstructionState();
    const monster = newMonster({
        data: state.mons[M.PM_GIANT_EEL],
        mnum: M.PM_GIANT_EEL,
        cham: M.PM_CHAMELEON,
        mcan: true,
        mcanmove: true,
        mhp: 4,
        mhpmax: 4,
        mx: 4,
        my: 4,
    });
    const target = state.mons[M.PM_SEWER_RAT];

    const result = newcham(monster, target, {
        state,
        random: {
            d: () => 1,
            rn1: () => 1,
            rn2: () => 0,
            rnd: () => 1,
            rne: () => 1,
            rnz: () => 1,
        },
        canSpotMonster: () => false,
        message: () => assert.fail('level construction has no shape message'),
        redrawSquare: () => {},
    });

    assert.equal(result, true);
    assert.equal(monster.data, target);
});
