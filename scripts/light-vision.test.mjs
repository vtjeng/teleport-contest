import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HWALL,
    LS_OBJECT,
    OBJ_FLOOR,
    ROOM,
    TEMP_LIT,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { light_globals_init } from '../js/light.js';
import { TALLOW_CANDLE } from '../js/objects.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { initialize_symbols_from_options } from '../js/symbols.js';
import { begin_burn, timeout_globals_init } from '../js/timeout.js';
import {
    cansee,
    clear_path,
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

    assert.ok(state.viz_array[5][7] & 0x1, 'hero has line of sight to target');
    assert.equal(state.viz_array[5][7] & TEMP_LIT, 0);
    assert.equal(cansee(7, 5), false);
    assert.equal(state.level.at(7, 5).disp_ch, ' ');
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
