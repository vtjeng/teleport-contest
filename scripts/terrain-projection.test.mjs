import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ANTI_MAGIC, COLNO, IN_SIGHT, M_AP_FURNITURE, POOL, ROOM, ROWNO, SVALL,
    TER_FULL, TER_MAP, TER_MON, TER_OBJ, TER_TRP } from '../js/const.js';
import { reveal_terrain_getglyph } from '../js/detect.js';
import { cmap_to_glyph, GLYPH_INVISIBLE, objnum_to_glyph, trap_to_glyph } from '../js/display.js';
import { GLYPH_MON_MALE_OFF, GLYPH_UNEXPLORED_OFF } from '../js/glyph_offsets.js';
import { DIAMOND } from '../js/objects.js';
import { create_region } from '../js/region.js';
import { S_cloud, S_corr, S_darkroom, S_fountain, S_litcorr, S_room, S_stone } from '../js/symbols.js';

const C = readFileSync(new URL('../nethack-c/upstream/src/detect.c', import.meta.url), 'utf8');
const JS_SOURCE = readFileSync(new URL('../js/detect.js', import.meta.url), 'utf8');
const CONFIG = readFileSync(new URL('../nethack-c/upstream/include/config.h', import.meta.url), 'utf8');
function fixture() {
    // One interior remembered room square; C reads the same coordinate in
    // every layer. ANTI_MAGIC provides a known trap under the object overlay.
    const cell = { typ: ROOM, seenv: SVALL,
        remembered_glyph: { glyph: cmap_to_glyph(S_room) },
        disp_glyph: { glyph: objnum_to_glyph(DIAMOND) } };
    const state = { u: { ux: 10, uy: 10, uinwater: 0 },
        level: { flags: { hero_memory: true }, regions: [],
            monsters: Array.from({ length: COLNO }, () => Array(ROWNO).fill(null)),
            traps: [{ tx: 10, ty: 10, ttyp: ANTI_MAGIC, tseen: true }],
            lastseentyp: { 10: { 10: ROOM } }, at: () => cell } };
    return { cell, state, glyph: (subset, swallowed = false) =>
        reveal_terrain_getglyph(10, 10, swallowed,
            cmap_to_glyph(S_stone), subset, state) };
}
test('terrain subsets preserve objects and uncover known traps in C order', () => {
    const { cell, state, glyph } = fixture();
    const trap = trap_to_glyph(state.level.traps[0], state);
    assert.equal(glyph(TER_MAP), cmap_to_glyph(S_room));
    assert.equal(glyph(TER_MAP | TER_TRP), trap);
    assert.equal(glyph(TER_MAP | TER_TRP | TER_OBJ), objnum_to_glyph(DIAMOND));
    // C treats invisible-monster markers as replaceable even with keep_objs.
    cell.disp_glyph.glyph = GLYPH_INVISIBLE;
    assert.equal(glyph(TER_MAP | TER_TRP | TER_OBJ), trap);
    // Pool coverage suppresses the trap substitution unless underwater.
    cell.typ = POOL;
    assert.equal(glyph(TER_MAP | TER_TRP), cmap_to_glyph(S_room));
    state.u.uinwater = 1;
    assert.equal(glyph(TER_MAP | TER_TRP), trap);
});
test('full projection restores seenv and normalizes C room/corridor glyphs', () => {
    const { cell, glyph } = fixture();
    cell.seenv = 3; // A partial visibility mask must survive TER_FULL.
    assert.equal(glyph(TER_MAP | TER_FULL), cmap_to_glyph(S_room));
    assert.equal(cell.seenv, 3);
    for (const [from, to] of [[S_darkroom, S_room], [S_litcorr, S_corr]]) {
        cell.disp_glyph.glyph = cmap_to_glyph(from);
        assert.equal(glyph(TER_MAP | TER_OBJ), cmap_to_glyph(to));
    }
});
test('monster projection preserves or strips the live glyph per TER_MON', () => {
    const { cell, glyph } = fixture();
    cell.disp_glyph.glyph = GLYPH_MON_MALE_OFF; // First ordinary monster glyph.
    assert.equal(glyph(TER_MAP | TER_OBJ), cmap_to_glyph(S_room));
    assert.equal(glyph(TER_MAP | TER_OBJ | TER_MON), GLYPH_MON_MALE_OFF);
});
test('visible region precedence matches C trap and unexplored arms', () => {
    const { cell, state, glyph } = fixture();
    const region = create_region([{ lx: 10, ly: 10, hx: 10, hy: 10 }]);
    region.visible = true;
    region.glyph = cmap_to_glyph(S_cloud);
    state.level.regions.push(region);
    cell.disp_glyph.glyph = GLYPH_MON_MALE_OFF;
    assert.equal(glyph(TER_MAP | TER_TRP), trap_to_glyph(state.level.traps[0], state));
    state.level.traps.length = 0;
    assert.equal(glyph(TER_MAP | TER_TRP), region.glyph);
    cell.seenv = 0;
    assert.equal(glyph(TER_MAP), GLYPH_UNEXPLORED_OFF);
});
test('remembered furniture mimic takes precedence over current terrain', () => {
    const { cell, state, glyph } = fixture();
    state.level.lastseentyp[10][10] = POOL;
    state.level.monsters[10][10] = { m_ap_type: M_AP_FURNITURE,
        mappearance: S_fountain, mhp: 1 };
    assert.equal(glyph(TER_MAP), cmap_to_glyph(S_fountain));
    assert.equal(cell.typ, ROOM);
});
test('without hero memory only in-sight topology replaces the object overlay', () => {
    const { cell, state, glyph } = fixture();
    state.level.flags.hero_memory = false;
    // C cansee() reads [y][x]; this interior square starts outside sight.
    state.viz_array = Array.from({ length: ROWNO }, () => Array(COLNO).fill(0));
    assert.equal(glyph(TER_MAP), cmap_to_glyph(S_stone));
    state.viz_array[10][10] = IN_SIGHT;
    assert.equal(glyph(TER_MAP), cmap_to_glyph(S_room));
    assert.equal(cell.seenv, SVALL, 'projection does not store the temporary visibility mask');
});
test('remembered topology copy restores the live cell after projection', () => {
    const { cell, state, glyph } = fixture();
    // POOL is remembered beneath an object, while the actual square is ROOM.
    state.level.lastseentyp[10][10] = POOL;
    const saved = structuredClone(cell);
    assert.notEqual(glyph(TER_MAP), cmap_to_glyph(S_room));
    assert.deepEqual(cell, saved);
});
test('whole projection pair and inactive dump_map preserve source traversal', () => {
    assert.match(CONFIG, /\/\* #define DUMPLOG \*\//u);
    assert.match(C, /#ifdef DUMPLOG\s+void\s+dump_map\(void\)/u);
    assert.match(C, /for \(y = 0; y < ROWNO; y\+\+\)[\s\S]*for \(x = 1; x < COLNO; x\+\+\)/u);
    assert.match(JS_SOURCE, /export function dump_map[\s\S]*for \(let y = 0; y < ROWNO; \+\+y\)[\s\S]*for \(let x = 1; x < COLNO; \+\+x\)/u);
    assert.match(JS_SOURCE, /if \(skippedRows\) note_unported\('windows\.c putstr'\)/u);
    assert.match(JS_SOURCE, /if \(unconstrain_map\(state\)\) \{\s*await docrt/u);
    assert.match(JS_SOURCE, /await browse_map\(whichSubset \| TER_MAP, 'anything of interest', state\)/u);
    assert.doesNotMatch(JS_SOURCE, /terrain projection subset is not ported|disoriented terrain projection/u);
});

test('projection impairment uses the exact youprop.h intrinsic macros', () => {
    const props = readFileSync(new URL('../nethack-c/upstream/include/youprop.h', import.meta.url), 'utf8');
    assert.match(props, /#define Stunned HStun/u);
    assert.match(props, /#define Confusion HConfusion/u);
    assert.match(props, /#define Hallucination \(HHallucination && !Halluc_resistance\)/u);
    const implementation = JS_SOURCE.slice(JS_SOURCE.indexOf('export async function reveal_terrain('),
        JS_SOURCE.indexOf('function glyphIsTrap('));
    assert.match(implementation, /properties\[HALLUC\]\?\.intrinsic/u);
    assert.match(implementation, /properties\[HALLUC_RES\]\?\.extrinsic/u);
    assert.match(implementation, /properties\[STUNNED\]\?\.intrinsic/u);
    assert.match(implementation, /properties\[CONFUSION\]\?\.intrinsic/u);
    assert.doesNotMatch(implementation, /propertyActiveUnblocked|hallucinating\(state\)/u);
});
