// vision.c:548-583 Blind jumps to skip:843-856. This narrow repair does
// not establish completion of Rogue, underwater, x-ray, or notice_all_mons.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BLINDED, COLNO, COULD_SEE, IN_SIGHT, ROOM, ROWNO, SV0, TEMP_LIT, TT_PIT } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { vision_recalc, vision_reset } from '../js/vision.js';

const source = readFileSync(new URL('../nethack-c/upstream/src/vision.c', import.meta.url), 'utf8');
function blindRoom() {
    const level = new GameMap();
    // Arbitrary interior center, with a lit seven-square room: ordinary
    // lighting, night vision and the pit subset would all set IN_SIGHT.
    for (let x = 7; x <= 13; ++x)
        for (let y = 7; y <= 13; ++y)
            Object.assign(level.at(x, y), { typ: ROOM, lit: true, seenv: SV0 });
    const state = { level, u: { ux: 10, uy: 10, uz: { dnum: 0, dlevel: 1 },
        // Blind takes source precedence over every specialized branch below.
        uprops: { [BLINDED]: { intrinsic: 1, extrinsic: 0, blocked: 0 } },
        uinwater: true, utrap: 1, utraptype: TT_PIT, xray_range: 2, nv_range: 2 },
        rogue_level: { dnum: 0, dlevel: 1 }, water_level: { dnum: 1, dlevel: 1 },
        program_state: { panicking: false }, vision_full_recalc: 1 };
    vision_reset(state);
    state.viz_array = Array.from({ length: ROWNO }, () => new Uint8Array(COLNO));
    // Only this nonhero square was IN_SIGHT. The hero was already blind,
    // so it cannot be redrawn by the old-IN_SIGHT clearing loop.
    state.viz_array[10][9] = IN_SIGHT | COULD_SEE;
    state._viz_rmin = new Int16Array(ROWNO).fill(COLNO);
    state._viz_rmax = new Int16Array(ROWNO).fill(0);
    state._viz_rmin[10] = 9;
    state._viz_rmax[10] = 10;
    return state;
}

test('blind vision redraws the hero after clearing old sight and before publishing bounds', () => {
    assert.match(source, /else if \(Blind\)[\s\S]*?goto skip;/u);
    assert.match(source, /skip:[\s\S]*?if \(!program_state\.panicking\)\s*newsym\(u\.ux, u\.uy\);[\s\S]*?gv\.viz_rmin = next_rmin;[\s\S]*?gv\.viz_rmax = next_rmax;/u);
    const state = blindRoom();
    const oldArray = state.viz_array;
    const oldMin = state._viz_rmin;
    const oldMax = state._viz_rmax;
    const redrawn = [];
    vision_recalc(0, { state, redraw(x, y) {
        // C publishes the new visibility bitmap before newsym, and the
        // row-bound pointers after the unconditional hero redraw.
        assert.notEqual(state.viz_array, oldArray);
        assert.equal(state._viz_rmin, oldMin);
        assert.equal(state._viz_rmax, oldMax);
        redrawn.push([x, y]);
    } });
    assert.deepEqual(redrawn, [[9, 10], [10, 10]]);
    assert.notEqual(state._viz_rmin, oldMin);
    assert.notEqual(state._viz_rmax, oldMax);
    assert.equal(state.vision_full_recalc, 0);
    assert.equal(state.viz_array[10][10], COULD_SEE);
    // Beyond pit/underwater adjacency but still in the room: Blind preserves
    // the full COULD_SEE map and skips ordinary/special IN_SIGHT overlays.
    assert.equal(state.viz_array[10][12], COULD_SEE);
    for (const row of state.viz_array)
        for (const cell of row) assert.equal(cell & (IN_SIGHT | TEMP_LIT), 0);
    for (let x = 7; x <= 13; ++x)
        for (let y = 7; y <= 13; ++y) assert.equal(state.level.at(x, y).seenv, SV0);
});

test('panicking suppresses only the blind epilogue hero redraw and still publishes bounds', () => {
    const state = blindRoom();
    state.program_state.panicking = true; // C protects panic-time hero coords.
    const oldMin = state._viz_rmin;
    const oldMax = state._viz_rmax;
    const redrawn = [];
    vision_recalc(0, { state, redraw: (x, y) => { redrawn.push([x, y]); } });
    assert.deepEqual(redrawn, [[9, 10]]); // Previously seen squares still clear.
    assert.notEqual(state._viz_rmin, oldMin);
    assert.notEqual(state._viz_rmax, oldMax);
    assert.equal(state.viz_array[10][10], COULD_SEE);
});
