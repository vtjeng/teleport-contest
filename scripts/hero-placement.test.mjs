import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MAX_TYPE,
    ROOM,
    ROOMOFFSET,
    STAIRS,
} from '../js/const.js';
import { newgame_pre_mklev } from '../js/allmain.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import { mklev, u_on_newpos, u_on_upstairs } from '../js/mklev.js';
import { monst_globals_init } from '../js/monsters.js';
import { objects_globals_init } from '../js/objects.js';
import {
    enableRngLog,
    getRngLog,
    initRng,
} from '../js/rng.js';
import { move_update } from '../js/rooms.js';
import {
    str2align,
    str2gend,
    str2race,
    str2role,
} from '../js/roles.js';
import { timeout_globals_init } from '../js/timeout.js';

function initializedState() {
    const state = resetGame();
    state.level = new GameMap();
    state.u = {
        ux: 0,
        uy: 0,
        ux0: 0,
        uy0: 0,
        uz: { dnum: 0, dlevel: 1 },
        uz0: { dnum: 0, dlevel: 0 },
        uundetected: true,
        usteed: null,
    };
    state.iflags = {};
    state.stairs = null;
    return state;
}

test('u_on_newpos records the first position and terrain on a new level', () => {
    const state = initializedState();
    const steed = { mx: 1, my: 1 };
    state.u.usteed = steed;
    state.level.at(14, 8).typ = STAIRS;

    u_on_newpos(14, 8, state);

    assert.deepEqual([state.u.ux, state.u.uy], [14, 8]);
    assert.deepEqual([state.u.ux0, state.u.uy0], [14, 8]);
    assert.equal(state.u.uundetected, false);
    assert.deepEqual([steed.mx, steed.my], [14, 8]);
    assert.equal(state.level.lastseentyp[14][8], STAIRS);
    assert.equal(state.iflags.terrain_typ, MAX_TYPE);
});

test('u_on_newpos keeps the prior position bookkeeping on the same level', () => {
    const state = initializedState();
    state.u.uz0 = { ...state.u.uz };
    state.u.ux0 = 4;
    state.u.uy0 = 3;
    state.iflags.terrain_typ = 17;

    u_on_newpos(14, 8, state);

    assert.deepEqual([state.u.ux, state.u.uy], [14, 8]);
    assert.deepEqual([state.u.ux0, state.u.uy0], [4, 3]);
    assert.equal(state.level.lastseentyp, undefined);
    assert.equal(state.iflags.terrain_typ, 17);
});

test('u_on_newpos rejects coordinates outside the playable map', () => {
    const state = initializedState();
    assert.throws(
        () => u_on_newpos(0, 8, state),
        /hero location is off map/,
    );
});

test('u_on_upstairs selects the first upward stair without drawing PRNG', () => {
    const state = initializedState();
    // No initRng(): any accidental draw would fail before this assertion.
    state.stairs = {
        sx: 21,
        sy: 9,
        up: 1,
        tolev: { dnum: 4, dlevel: 5 },
        next: {
            sx: 7,
            sy: 4,
            up: false,
            tolev: { dnum: 0, dlevel: 2 },
            next: null,
        },
    };

    u_on_upstairs();

    assert.deepEqual([state.u.ux, state.u.uy], [21, 9]);
});

test('u_on_upstairs does not mistake a downward special stair for upward', () => {
    const state = initializedState();
    state.stairs = {
        sx: 21,
        sy: 9,
        up: false,
        tolev: { dnum: 4, dlevel: 5 },
        next: null,
    };
    // For this fixed stream, one isolated ROOM is missed by all 200 random
    // attempts, reaching the source's deterministic fallback.
    state.level.at(4, 4).typ = ROOM;
    initRng(0x51a1);
    enableRngLog();

    u_on_upstairs();

    assert.deepEqual([state.u.ux, state.u.uy], [4, 4]);
    // Every failed attempt draws x and y once; fallback itself draws nothing.
    assert.equal(getRngLog().length, 400);
});

async function generateNewGameLevel(seed) {
    resetGame();
    objects_globals_init(game);
    monst_globals_init(game);
    timeout_globals_init(game);
    initRng(seed);
    game.fixedDatetime = '20400314015926';
    game.recorderIsDst = false;
    game.moves = 0;
    game.plname = 'PlacementTest';
    game.flags = {
        initrole: str2role('Tourist'),
        initrace: str2race('human'),
        initgend: str2gend('female'),
        initalign: str2align('neutral'),
        female: true,
        bones: true,
    };
    game.iflags = {};
    game.u = { uroleplay: {} };
    game.context = { move: 0 };
    newgame_pre_mklev(game);
    await mklev();
    return game;
}

test('generated first levels place and register the hero in the branch-stair room', async () => {
    const seeds = [
        101, // Small seed exercises leading zero bytes in ISAAC64 input.
        0x10203040, // Mixed bytes exercise a substantially different layout.
        0x7fffffed, // Large positive seed exercises the upper signed range.
    ];

    for (const seed of seeds) {
        const state = await generateNewGameLevel(seed);
        const upward = (() => {
            for (let stair = state.stairs; stair; stair = stair.next)
                if (Boolean(stair.up)) return stair;
            return null;
        })();
        assert.ok(upward, `seed ${seed} did not generate the level-one branch stair`);

        u_on_upstairs();
        move_update(false, state);

        assert.deepEqual(
            [state.u.ux, state.u.uy],
            [upward.sx, upward.sy],
            `seed ${seed}`,
        );
        const roomno = state.level.at(state.u.ux, state.u.uy).roomno;
        assert.ok(roomno >= ROOMOFFSET, `seed ${seed} stair is not in a room`);
        assert.equal(state.u.urooms[0], roomno, `seed ${seed}`);
        assert.equal(state.u.uentered[0], roomno, `seed ${seed}`);
        assert.equal(state.u.ushops[0], 0, `seed ${seed}`);
    }
});
