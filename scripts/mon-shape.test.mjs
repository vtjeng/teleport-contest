import assert from 'node:assert/strict';
import test from 'node:test';

import { NON_PM } from '../js/const.js';
import { GameMap } from '../js/game.js';
import {
    alloc_itermonarr,
    get_iter_mons_xy,
    iter_mons,
    normal_shape,
    restartcham,
} from '../js/mon.js';
import * as M from '../js/monsters.js';
import { newMonster } from '../js/monst.js';

function monsterState() {
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
    return state;
}

function monster(state, pmidx, overrides = {}) {
    return newMonster({
        data: state.mons[pmidx],
        mnum: pmidx,
        mhp: 4,
        mhpmax: 4,
        mcanmove: true,
        ...overrides,
    });
}

test('iter_mons visits only living on-map monsters and caches nmon', () => {
    const state = monsterState();
    const live = monster(state, M.PM_SEWER_RAT, { m_id: 3 });
    const offmap = monster(state, M.PM_SEWER_RAT, {
        m_id: 2,
        mstate: 4,
        nmon: live,
    });
    const dead = monster(state, M.PM_SEWER_RAT, {
        m_id: 1,
        mhp: 0,
        nmon: offmap,
    });
    state.level.monlist = dead;

    const visited = [];
    iter_mons((candidate) => {
        visited.push(candidate.m_id);
        candidate.nmon = null;
    }, state);

    assert.deepEqual(visited, [3]);
});

test('get_iter_mons_xy passes coordinates and returns the first match', () => {
    const state = monsterState();
    const second = monster(state, M.PM_SEWER_RAT, { m_id: 2 });
    const first = monster(state, M.PM_SEWER_RAT, { m_id: 1, nmon: second });
    state.level.monlist = first;

    const seen = [];
    assert.equal(
        get_iter_mons_xy((candidate, x, y) => {
            seen.push([candidate.m_id, x, y]);
            return candidate.m_id === 2;
        }, 17, 19, state),
        second,
    );
    assert.deepEqual(seen, [[1, 17, 19], [2, 17, 19]]);
});

test('normal_shape restores a chameleon and preserves cancellation', () => {
    const state = monsterState();
    const chameleon = monster(state, M.PM_CHAMELEON);
    const shifted = monster(state, M.PM_DOG, {
        cham: M.PM_CHAMELEON,
        mcan: true,
        mx: 4,
        my: 4,
    });

    normal_shape(shifted, state, {
        random: {
            d: () => 1,
            rn1: () => 1,
            rn2: () => 0,
            rnd: () => 1,
            rne: () => 1,
            rnz: () => 1,
        },
    });

    assert.equal(shifted.data, chameleon.data);
    assert.equal(shifted.cham, M.NON_PM);
    assert.equal(shifted.mcan, 1);
});

test('restartcham re-enables shape changes for living monsters', () => {
    const state = monsterState();
    const shifted = monster(state, M.PM_DOG, { cham: M.PM_CHAMELEON });
    state.level.monlist = shifted;

    restartcham(state);

    assert.equal(shifted.cham, NON_PM);
});

test('alloc_itermonarr accepts C release and growth requests', () => {
    alloc_itermonarr(64);
    alloc_itermonarr(0);
    alloc_itermonarr(1);
});
