import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    HALLUC,
    HALLUC_RES,
    IN_SIGHT,
    MAX_TYPE,
    OBJ_FLOOR,
    ROOM,
    ROOMOFFSET,
    STAIRS,
} from '../js/const.js';
import { newgame_pre_mklev } from '../js/allmain.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import { u_on_newpos } from '../js/dungeon.js';
import { mklev, u_on_upstairs } from '../js/mklev.js';
import { monst_globals_init } from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { objects_globals_init, ROCK } from '../js/objects.js';
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

// dungeon.c u_on_newpos()'s same-level arm, `if (!Blind && !Hallucination
// && !u.uswallow) see_nearby_objects()`. Each case below switches on exactly
// one of the three and reads the answer off the nearby object's dknown flag.
//
// A rock is deliberately not one of display.h obj_is_generic()'s three
// classes, so see_nearby_objects() observes it without also calling newsym(),
// which would need the whole symbol set behind it.
function sameLevelState() {
    const state = initializedState();
    state.u.uz0 = { ...state.u.uz };
    state.u.uprops = [];
    state.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    state.u.uprops[HALLUC] = { intrinsic: 0, extrinsic: 0 };
    state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
    state.u.uswallow = false;
    objects_globals_init(state);
    // A zero choice keeps the description shuffle in source order; observe
    // only reads oc_encountered, so the choice merely keeps setup fixed.
    init_objects(state, () => 0);
    state.viz_array = Array.from(
        { length: 21 }, // ROWNO
        () => new Array(80).fill(IN_SIGHT), // COLNO
    );
    // One square north of where each case moves the hero, so distu() is 1.
    const rock = {
        otyp: ROCK,
        oclass: state.objects[ROCK].oc_class,
        dknown: false,
        where: OBJ_FLOOR,
        ox: 14,
        oy: 7,
        nexthere: null,
    };
    state.level.at(14, 7).typ = ROOM;
    state.level.objects[14][7] = rock;
    return { state, rock };
}

test('u_on_newpos observes nearby objects on an unimpaired same-level step',
    () => {
        const { state, rock } = sameLevelState();
        u_on_newpos(14, 8, state);
        assert.equal(rock.dknown, true);

        // youprop.h:103 applies !BBlinded to internal and external blindness
        // alike, so an artifact that blocks the property leaves the hero
        // seeing however the timeout stands.
        const blocked = sameLevelState();
        blocked.state.u.uprops[BLINDED] = {
            intrinsic: 1, extrinsic: 0, blocked: 1,
        };
        u_on_newpos(14, 8, blocked.state);
        assert.equal(blocked.rock.dknown, true);

        // youprop.h:120 suppresses hallucination under either resistance.
        for (const resistance of ['intrinsic', 'extrinsic']) {
            const resistant = sameLevelState();
            resistant.state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
            resistant.state.u.uprops[HALLUC_RES][resistance] = 1;
            u_on_newpos(14, 8, resistant.state);
            assert.equal(resistant.rock.dknown, true, resistance);
        }
    });

test('u_on_newpos observes nothing while blind, hallucinating or swallowed',
    () => {
        // youprop.h:103 reads both halves of blindness, so either alone stops
        // the scan.
        for (const source of ['intrinsic', 'extrinsic']) {
            const blind = sameLevelState();
            blind.state.u.uprops[BLINDED][source] = 1;
            u_on_newpos(14, 8, blind.state);
            assert.equal(blind.rock.dknown, false, source);
        }

        // youprop.h:116 makes hallucination an intrinsic timeout only.
        const halluc = sameLevelState();
        halluc.state.u.uprops[HALLUC].intrinsic = 1;
        u_on_newpos(14, 8, halluc.state);
        assert.equal(halluc.rock.dknown, false);

        const swallowed = sameLevelState();
        swallowed.state.u.uswallow = true;
        u_on_newpos(14, 8, swallowed.state);
        assert.equal(swallowed.rock.dknown, false);
    });

test('u_on_newpos observes nothing when the hero changes level', () => {
    const { state, rock } = sameLevelState();
    // The level-change arm at dungeon.c:1589 excludes the else entirely, so
    // an arrival maps its own square and observes no neighbour.
    state.u.uz0 = { dnum: 0, dlevel: 0 };
    u_on_newpos(14, 8, state);
    assert.equal(rock.dknown, false);
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
