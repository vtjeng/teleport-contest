import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    COULD_SEE,
    DOOR,
    D_CLOSED,
    FROMOUTSIDE,
    HWALL,
    LS_OBJECT,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MINVENT,
    ROOM,
    SEE_INVIS,
    TEMP_LIT,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { light_globals_init } from '../js/light.js';
import { BOULDER, TALLOW_CANDLE } from '../js/objects.js';
import {
    add_rect_to_reg,
    add_region,
    create_region,
} from '../js/region.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import {
    initialize_symbols_from_options,
    S_cloud,
    S_hcdoor,
    S_upstair,
} from '../js/symbols.js';
import { begin_burn, timeout_globals_init } from '../js/timeout.js';
import {
    cansee,
    clear_path,
    couldsee,
    init_vision_globals,
    vision_recalc,
    vision_reset,
} from '../js/vision.js';

function darkRoomState() {
    const state = resetGame();
    state.level = new GameMap();
    // This open rectangle keeps the test away from map boundaries while
    // leaving every square dark so only night vision or the candle reveals it.
    for (let x = 2; x <= 20; ++x) {
        for (let y = 2; y <= 15; ++y)
            state.level.at(x, y).typ = ROOM;
    }
    state.u = { ux: 5, uy: 7 };
    state.moves = 1;
    initialize_symbols_from_options({ flags: {} }, state);
    timeout_globals_init(state);
    light_globals_init(state);
    init_vision_globals();
    return state;
}

function floorCandle(state, x, y) {
    const candle = {
        otyp: TALLOW_CANDLE,
        // One ordinary candle produces the source minimum radius of two.
        quan: 1,
        age: 200,
        spe: 1,
        where: OBJ_FLOOR,
        ox: x,
        oy: y,
        lamplit: false,
        timed: 0,
    };
    begin_burn(candle, false, { state });
    assert.equal(state.gl.light_base.type, LS_OBJECT);
    return candle;
}

test('a floor candle projects the source circle into initial vision', () => {
    const state = darkRoomState();
    floorCandle(state, 10, 7);

    vision_reset();
    vision_recalc(0);

    // Radius two uses vision.c's source circle offsets [2, 2, 1].
    assert.ok(state.viz_array[7][8] & TEMP_LIT);
    assert.ok(state.viz_array[7][12] & TEMP_LIT);
    assert.ok(state.viz_array[6][8] & TEMP_LIT);
    assert.ok(state.viz_array[5][9] & TEMP_LIT);
    assert.equal(state.viz_array[5][8] & TEMP_LIT, 0);
    assert.equal(state.viz_array[7][13] & TEMP_LIT, 0);

    assert.equal(cansee(8, 7), true);
    assert.equal(cansee(12, 7), true);
    assert.equal(cansee(13, 7), false);
    assert.equal(state.level.at(12, 7).disp_ch, '.');
});

test('a blocking wall stops candle light along clear_path', () => {
    const state = darkRoomState();
    floorCandle(state, 9, 5);
    // The target at (7,5) is visible diagonally from the hero at (5,7), but
    // this wall is the intervening point on the candle's horizontal ray.
    state.level.at(8, 5).typ = HWALL;

    vision_reset();
    assert.equal(clear_path(9, 5, 7, 5), 0);
    assert.equal(clear_path(9, 5, 8, 5), 1);
    vision_recalc(0);

    assert.ok(
        state.viz_array[5][7] & COULD_SEE,
        'hero has line of sight to target',
    );
    assert.equal(state.viz_array[5][7] & TEMP_LIT, 0);
    assert.equal(cansee(7, 5), false);
    assert.equal(state.level.at(7, 5).disp_ch, ' ');
});

test('a floor boulder blocks initial line of sight', () => {
    const state = darkRoomState();
    state.u.ux = 10;
    state.u.uy = 10;
    state.level.objects[12][10] = { otyp: BOULDER };

    vision_reset();

    assert.equal(clear_path(10, 10, 14, 10), 0);
    assert.equal(clear_path(10, 10, 12, 10), 1);
});

test('a visible gas region blocks initial line of sight', () => {
    const state = darkRoomState();
    state.u.ux = 10;
    state.u.uy = 10;
    const cloud = create_region();
    add_rect_to_reg(cloud, { lx: 12, ly: 10, hx: 12, hy: 10 });
    cloud.visible = true;
    cloud.glyph = S_cloud;
    add_region(cloud, state);

    vision_reset();

    assert.equal(clear_path(10, 10, 14, 10), 0);
    assert.equal(clear_path(10, 10, 12, 10), 1);
});

test('visible light-blocking mimic appearances obstruct initial vision', () => {
    const state = darkRoomState();
    state.u.ux = 10;
    state.u.uy = 10;
    const mimic = {
        minvis: false,
        m_ap_type: M_AP_FURNITURE,
        mappearance: S_hcdoor,
    };
    state.level.monsters[12][10] = mimic;

    vision_reset();
    assert.equal(clear_path(10, 10, 14, 10), 0);
    assert.equal(clear_path(10, 10, 12, 10), 1);

    mimic.mappearance = S_upstair;
    vision_reset();
    assert.equal(clear_path(10, 10, 14, 10), 1);

    mimic.m_ap_type = M_AP_OBJECT;
    mimic.mappearance = BOULDER;
    vision_reset();
    assert.equal(clear_path(10, 10, 14, 10), 0);

    mimic.minvis = true;
    vision_reset();
    assert.equal(clear_path(10, 10, 14, 10), 1);
    state.u.uprops = [];
    state.u.uprops[SEE_INVIS] = { intrinsic: 1, extrinsic: 0 };
    vision_reset();
    assert.equal(clear_path(10, 10, 14, 10), 0);
});

test('blind vision retains monster line of sight without hero IN_SIGHT', () => {
    const state = darkRoomState();
    state.u.uprops = [];
    state.u.uprops[BLINDED] = {
        intrinsic: FROMOUTSIDE,
        extrinsic: 0,
        blocked: 0,
    };
    floorCandle(state, 10, 7);

    vision_reset();
    vision_recalc(0);

    assert.equal(couldsee(10, 7), true);
    assert.equal(cansee(state.u.ux, state.u.uy), false);
    assert.equal(cansee(10, 7), false);
    assert.equal(state.viz_array[7][10] & TEMP_LIT, 0);
});

test('vision refresh follows a moved floor light source without PRNG work', () => {
    const state = darkRoomState();
    // The arbitrary fresh seed makes any accidental core draw observable.
    initRng(0x1a2b3c);
    enableRngLog();
    const candle = floorCandle(state, 10, 7);

    vision_reset();
    vision_recalc(0);
    assert.equal(cansee(12, 7), true);

    candle.ox = 15;
    candle.oy = 7;
    vision_recalc(0);

    assert.deepEqual(
        [state.gl.light_base.x, state.gl.light_base.y],
        [15, 7],
    );
    assert.equal(cansee(12, 7), false);
    assert.equal(cansee(13, 7), true);
    assert.ok(state.viz_array[7][17] & TEMP_LIT);
    assert.deepEqual(getRngLog(), []);
});

test('contained and buried lights hide while carried lights follow owners', () => {
    const state = darkRoomState();
    const candle = floorCandle(state, 10, 7);
    const source = state.gl.light_base;

    vision_reset();
    vision_recalc(0);
    assert.ok(source.flags & 0x1);
    assert.ok(state.viz_array[7][10] & TEMP_LIT);

    candle.where = OBJ_CONTAINED;
    candle.ocontainer = { where: OBJ_FLOOR, ox: 10, oy: 7 };
    vision_recalc(0);
    assert.equal(source.flags & 0x1, 0);
    assert.equal(state.viz_array[7][10] & TEMP_LIT, 0);
    assert.equal(cansee(10, 7), false);

    candle.where = OBJ_BURIED;
    candle.ocontainer = null;
    vision_recalc(0);
    assert.equal(source.flags & 0x1, 0);
    assert.equal(state.viz_array[7][10] & TEMP_LIT, 0);

    candle.where = OBJ_INVENT;
    state.u.ux = 6;
    vision_recalc(0);
    assert.deepEqual([source.x, source.y], [6, 7]);
    assert.ok(source.flags & 0x1);
    assert.ok(state.viz_array[7][8] & TEMP_LIT);

    const carrier = { mx: 14, my: 7 };
    candle.where = OBJ_MINVENT;
    candle.ocarry = carrier;
    vision_recalc(0);
    assert.deepEqual([source.x, source.y], [14, 7]);
    assert.ok(source.flags & 0x1);
    assert.ok(state.viz_array[7][14] & TEMP_LIT);
    carrier.mx = 15;
    carrier.my = 8;
    vision_recalc(0);
    assert.deepEqual([source.x, source.y], [15, 8]);
    assert.ok(state.viz_array[8][15] & TEMP_LIT);
});

test('clear_path checks asymmetric and tie rays in every quadrant', () => {
    const state = darkRoomState();
    const start = [10, 10];
    const cases = [
        { target: [15, 7], blocker: [12, 9] },
        { target: [5, 7], blocker: [8, 9] },
        { target: [5, 13], blocker: [8, 11] },
        { target: [15, 13], blocker: [12, 11] },
        { target: [14, 6], blocker: [12, 8] },
        { target: [6, 6], blocker: [8, 8] },
        { target: [6, 14], blocker: [8, 12] },
        { target: [14, 14], blocker: [12, 12] },
    ];

    for (const { target, blocker } of cases) {
        state.level.at(...target).typ = HWALL;
        vision_reset();
        assert.equal(
            clear_path(...start, ...target),
            1,
            `endpoint ${target} must be skipped`,
        );
        state.level.at(...target).typ = ROOM;
        state.level.at(...blocker).typ = HWALL;
        vision_reset();
        assert.equal(
            clear_path(...start, ...target),
            0,
            `intervening blocker ${blocker} must stop ${target}`,
        );
        state.level.at(...blocker).typ = ROOM;
    }
});

test('generated closed doors block sight through their shared flags field', () => {
    const state = darkRoomState();
    state.u.ux = 10;
    state.u.uy = 10;

    const interveningDoor = state.level.at(12, 10);
    interveningDoor.typ = DOOR;
    interveningDoor.flags = D_CLOSED;
    interveningDoor.doormask = 0;
    vision_reset();
    assert.equal(clear_path(10, 10, 14, 10), 0);
    interveningDoor.typ = ROOM;
    interveningDoor.flags = 0;

    // A one-cell opening between two opaque wall runs exercises Algorithm C's
    // shallow-angle boundary handling.  Treating this closed door as clear
    // makes the gap disappear from COULD_SEE even though either wall face is
    // visible.  mklev stores rm.doormask in the shared rm.flags field.
    for (let x = 2; x <= 20; ++x)
        state.level.at(x, 9).typ = HWALL;
    const door = state.level.at(18, 9);
    door.typ = DOOR;
    door.flags = D_CLOSED;
    door.doormask = 0;

    vision_reset();
    vision_recalc(0);

    assert.ok(state.viz_array[9][17] & COULD_SEE);
    assert.ok(state.viz_array[9][18] & COULD_SEE);
    assert.ok(state.viz_array[9][19] & COULD_SEE);
});

test('becoming blind redraws cells which were previously in sight', () => {
    const state = darkRoomState();
    floorCandle(state, 10, 7);
    state.u.uprops = [];
    state.u.uprops[BLINDED] = {
        intrinsic: 0,
        extrinsic: 0,
        blocked: 0,
    };

    vision_reset();
    vision_recalc(0);
    const location = state.level.at(10, 7);
    assert.equal(cansee(10, 7), true);
    assert.equal(location.remembered_glyph.ch, '.');
    // Model a transient visible overlay.  The blind transition must invoke
    // newsym() for the old IN_SIGHT cell and restore its remembered terrain.
    location.disp_ch = 'X';
    state.u.uprops[BLINDED].intrinsic = FROMOUTSIDE;

    vision_recalc(0);

    assert.equal(cansee(10, 7), false);
    assert.equal(location.disp_ch, '.');
});

test('opaque walls and doors require light on their hero-facing side', () => {
    for (const blocker of [
        { typ: HWALL, doormask: 0 },
        { typ: DOOR, doormask: D_CLOSED },
    ]) {
        const farState = darkRoomState();
        Object.assign(farState.level.at(8, 7), blocker);
        floorCandle(farState, 10, 7);
        vision_reset();
        vision_recalc(0);
        assert.ok(farState.viz_array[7][8] & TEMP_LIT);
        assert.equal(farState.viz_array[7][7] & TEMP_LIT, 0);
        assert.equal(cansee(8, 7), false);

        const facingState = darkRoomState();
        Object.assign(facingState.level.at(8, 7), blocker);
        floorCandle(facingState, 7, 7);
        vision_reset();
        vision_recalc(0);
        assert.ok(facingState.viz_array[7][7] & TEMP_LIT);
        assert.equal(cansee(8, 7), true);
    }
});
