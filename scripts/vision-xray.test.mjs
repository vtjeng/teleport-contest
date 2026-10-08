import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GameMap } from '../js/game.js';
import { BLINDED, COLNO, COULD_SEE, IN_SIGHT, ROOM, ROWNO, STONE, SVALL, TT_PIT } from '../js/const.js';
import { liveVisionBufferViews, makeVisionBuffers, vision_recalc, vision_reset } from '../js/vision.js';

const source = readFileSync(new URL('../nethack-c/upstream/src/vision.c', import.meta.url), 'utf8');
// An arbitrary interior center keeps the radius 3 Eyes circle away from edges.
const CENTER = 10;
// vision.c circle_data's radius 3 row widths; C includes (dx3,dy1).
const WIDTHS = [3, 3, 2, 1];
function fixture(x = CENTER, y = CENTER) {
    const level = new GameMap();
    // A dark room has COULD_SEE without ordinary lighting. Its border is
    // farther than radius 3, so it cannot clip the circle under test.
    for (let col = 5; col <= 15; ++col)
        for (let row = 5; row <= 15; ++row)
            Object.assign(level.at(col, row), { typ: ROOM, lit: false });
    const state = { level, u: { ux: x, uy: y, uz: { dnum: 0, dlevel: 1 },
        // Eyes grants radius 3; ordinary night vision is radius 1.
        xray_range: 3, nv_range: 1, uprops: {}, uswallow: 0 },
        program_state: {}, context: {}, flags: {}, iflags: {},
        // Planning clones provide this existing canonical buffer pair.
        _visionBuffers: makeVisionBuffers() };
    vision_reset(state);
    state.viz_array = Array.from({ length: ROWNO }, () => new Uint8Array(COLNO));
    return state;
}
function recalc(state, control = 0) {
    vision_recalc(control, { state, redraw() {} });
}

test('x-ray overlay pins the complete C circle and state/update order', () => {
    const circle = source.match(/const coordxy circle_data\[\] = \{([\s\S]*?)\};/u)[1]
        .replace(/\/\*[\s\S]*?\*\//gu, '').match(/\d+/gu).map(Number);
    // circle_start[3] is 6; the next four entries are the source row widths.
    assert.deepEqual(circle.slice(6, 10), WIDTHS);
    assert.match(source, /if \(u\.xray_range >= 0\)[\s\S]*ranges = circle_ptr\(u\.xray_range\)/u);
    assert.match(source, /next_row\[col\] \|= IN_SIGHT;[\s\S]*levl\[col\]\[row\]\.seenv = SVALL;[\s\S]*newsym\(col, row\)/u);
    assert.match(source, /if \(has_night_vision && u\.xray_range < u\.nv_range\)/u);
    const state = fixture();
    const oldArray = state.viz_array;
    const redraws = [];
    const liveBefore = liveVisionBufferViews().map(row => [...row]);
    vision_recalc(0, { state, redraw(x, y) {
        redraws.push({ x, y, beforePublication: state.viz_array === oldArray,
            seenv: state.level.at(x, y).seenv });
    } });
    let count = 0;
    for (let row = 0; row < ROWNO; ++row)
        for (let col = 0; col < COLNO; ++col) {
            const dy = Math.abs(row - CENTER);
            const inside = dy < WIDTHS.length && Math.abs(col - CENTER) <= WIDTHS[dy];
            assert.equal(Boolean(state.viz_array[row][col] & IN_SIGHT), inside);
            if (inside) {
                count++;
                assert.equal(state.level.at(col, row).seenv, SVALL);
            }
        }
    // Summing C's seven row widths gives 37 visible cells.
    assert.equal(count, 37);
    const overlayCalls = redraws.filter(call => call.beforePublication);
    assert.equal(overlayCalls.length, 37);
    assert.ok(overlayCalls.every(call => call.seenv === SVALL));
    assert.ok(redraws.some(call => !call.beforePublication));
    assert.deepEqual(liveVisionBufferViews().map(row => [...row]), liveBefore,
        'a clone uses its own next buffer and does not publish live visibility');
});

test('x-ray sees through walls without granting COULD_SEE and expands row bounds', () => {
    const state = fixture();
    // A wall one square east blocks ordinary LOS to the radius 3 endpoint.
    state.level.at(CENTER + 1, CENTER).typ = STONE;
    vision_reset(state);
    recalc(state);
    const endpoint = CENTER + WIDTHS[0];
    assert.equal(state.viz_array[CENTER][endpoint] & COULD_SEE, 0);
    assert.equal(state.viz_array[CENTER][endpoint] & IN_SIGHT, IN_SIGHT);
    assert.equal(state.level.at(endpoint, CENTER).seenv, SVALL);
    assert.ok(state._viz_rmin[CENTER] <= CENTER - WIDTHS[0]);
    assert.ok(state._viz_rmax[CENTER] >= endpoint);
    // Source pit sight starts with 3x3; x-ray still overlays beyond that square.
    state.u.utrap = 1;
    state.u.utraptype = TT_PIT;
    recalc(state);
    assert.equal(state.viz_array[CENTER][endpoint], IN_SIGHT);
    // Underwater outside the water level suppresses night vision, not x-ray.
    state.u.uinwater = true;
    state.water_level = { dnum: 1, dlevel: 1 };
    recalc(state);
    assert.equal(state.viz_array[CENTER][endpoint] & IN_SIGHT, IN_SIGHT);
});

test('radius zero and the disabled sentinel retain C sight limits', () => {
    const state = fixture();
    state.u.xray_range = 0; // Source range 0 grants only the hero.
    state.u.nv_range = 0; // Equal night range must not add adjacency.
    recalc(state);
    assert.equal(state.viz_array[CENTER][CENTER] & IN_SIGHT, IN_SIGHT);
    assert.equal(state.level.at(CENTER, CENTER).seenv, SVALL);
    assert.equal(state.viz_array[CENTER][CENTER + 1] & IN_SIGHT, 0);
    state.u.xray_range = -1; // Artifact removal disables the overlay.
    state.u.nv_range = 1; // Ordinary adjacency remains available.
    recalc(state);
    assert.equal(state.viz_array[CENTER][CENTER + 1] & IN_SIGHT, IN_SIGHT);
    assert.equal(state.viz_array[CENTER][CENTER + WIDTHS[0]] & IN_SIGHT, 0);
});

test('x-ray clips at map edges and skips Blind, Rogue, swallowed and shutdown arms', () => {
    // C clips columns at1 and79, rows at0 and20; these opposite corners
    // exercise both limits without touching invalid column 0.
    for (const [x, y] of [[1, 0], [COLNO - 1, ROWNO - 1]]) {
        const state = fixture(x, y);
        const calls = [];
        const oldArray = state.viz_array;
        // Only the x-ray arm is scoped; old main-loop column 0 handling is separate.
        vision_recalc(0, { state, redraw(col, row) {
            if (state.viz_array === oldArray) calls.push([col, row]);
        } });
        assert.ok(calls.every(([col, row]) => col >= 1 && col < COLNO && row >= 0 && row < ROWNO));
        assert.equal(state.level.at(x, y).seenv, SVALL);
    }
    for (const mode of ['blind', 'rogue', 'swallowed', 'shutdown']) {
        const state = fixture();
        if (mode === 'blind') state.u.uprops[BLINDED] = { intrinsic: 1 };
        if (mode === 'rogue') state.rogue_level = { ...state.u.uz };
        if (mode === 'swallowed') state.u.uswallow = 1;
        recalc(state, mode === 'shutdown' ? 2 : 0); // Source shutdown control 2.
        assert.equal(state.viz_array[CENTER][CENTER + WIDTHS[0]] & IN_SIGHT, 0, mode);
        assert.equal(state.level.at(CENTER + WIDTHS[0], CENTER).seenv, 0, mode);
    }
});
