// Bounded display.c:243–246 fix: sym.h DARKROOMSYM depends on the hero level.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cmap_to_glyph, magic_map_background } from '../js/display.js';
import { GLYPH_NOTHING_OFF, GLYPH_OBJ_OFF } from '../js/glyph_offsets.js';
import { IN_SIGHT, ROOM } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { GameDisplay } from '../js/game_display.js';
import { resetGame } from '../js/gstate.js';
import { initialize_symbols_from_options, S_darkroom, S_room, S_stone } from '../js/symbols.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('magic mapping consumes the source DARKROOMSYM rogue-level choice', () => {
    assert.match(source('../nethack-c/upstream/include/sym.h'),
        /#define DARKROOMSYM \(Is_rogue_level\(&u\.uz\) \? S_stone : S_darkroom\)/u);
    assert.match(source('../nethack-c/upstream/src/display.c'),
        /if \(lev->typ == ROOM && glyph == cmap_to_glyph\(S_room\)\)\s*glyph = \(flags\.dark_room && iflags\.use_color\)\s*\? cmap_to_glyph\(DARKROOMSYM\)\s*: GLYPH_NOTHING;/u);
    const js = source('../js/display.js');
    const start = js.indexOf('export function magic_map_background(');
    const body = js.slice(start, js.indexOf('\n}\n', start));
    assert.match(body, /cmap_to_glyph\(\s*isRogueLevelForState\(state\) \? S_stone : S_darkroom, state\)/u);
    assert.ok(body.indexOf('location.remembered_glyph =') < body.indexOf('if (show)'));
    assert.ok(body.indexOf('if (show)') < body.indexOf('update_lastseentyp('));
});

function roomState({ rogue = true, visible = false, waslit = false,
    dark = true, color = true, memory = true } = {}) {
    const state = resetGame();
    state.level = new GameMap();
    state.level.flags.hero_memory = memory;
    state.nhDisplay = new GameDisplay(null);
    // Two distinct legal dungeon positions test the level identity predicate;
    // neither fixture uses the admitted case's actual dungeon depth or square.
    state.u = { ux: 2, uy: 2, uz: { dnum: 0, dlevel: rogue ? 12 : 3 } };
    state.rogue_level = { dnum: 0, dlevel: 12 };
    state.dungeons = [{ flags: {} }];
    state.flags = { dark_room: dark };
    state.iflags = { wc_color: color };
    state.mons = [];
    state.objects = [];
    initialize_symbols_from_options({ flags: {} }, state);
    // An interior lit ROOM outside sight reaches C's correction unless
    // waslit or the explicit IN_SIGHT bit suppresses it.
    const x = 7, y = 4;
    const loc = state.level.at(x, y);
    Object.assign(loc, { typ: ROOM, lit: true, waslit, disp_ch: 'x' });
    state.viz_array = [];
    state.viz_array[y] = [];
    state.viz_array[y][x] = visible ? IN_SIGHT : 0;
    return { state, loc, x, y };
}

for (const [name, options, expected] of [
    ['rogue unseen room', {}, S_stone],
    ['ordinary unseen room', { rogue: false }, S_darkroom],
    ['visible rogue room', { visible: true }, S_room],
    ['previously lit rogue room', { waslit: true }, S_room],
    // C chooses GLYPH_NOTHING when either option in the ternary is false.
    ['dark-room option disabled', { dark: false }, null],
    ['color disabled', { color: false }, null],
]) {
    test(`magic-map room memory: ${name}`, () => {
        const { state, loc, x, y } = roomState(options);
        magic_map_background(x, y, false, state);
        assert.equal(loc.remembered_glyph.glyph,
            expected === null ? GLYPH_NOTHING_OFF : cmap_to_glyph(expected, state));
        assert.equal(loc.disp_ch, 'x', 'show=false keeps the existing screen cell');
        assert.equal(state.level.lastseentyp[x][y], ROOM);
    });
}

test('rogue mapping draws blank terrain while memory-disabled mapping does not store it', () => {
    const { state, loc, x, y } = roomState({ memory: false });
    magic_map_background(x, y, true, state);
    assert.equal(loc.remembered_glyph, undefined);
    assert.equal(loc.disp_ch, ' '); // sym.h S_stone's source map symbol.
    assert.equal(state.level.lastseentyp[x][y], ROOM);
});

test('magic mapping preserves an existing nonterrain memory glyph', () => {
    const { state, loc, x, y } = roomState();
    // The first object glyph is deliberately outside C's unexplored/cmap test.
    loc.remembered_glyph = { glyph: GLYPH_OBJ_OFF };
    magic_map_background(x, y, false, state);
    assert.equal(loc.remembered_glyph.glyph, GLYPH_OBJ_OFF);
});

const { ROGUE_MAPPING_CASES, loadRogueMappingRecipe,
    verifyRogueMappingSegment } = await import('./run-rogue-mapping.mjs');
for (const name of ROGUE_MAPPING_CASES) {
    test(`production magic mapping: ${name}`, async () => {
        await verifyRogueMappingSegment(loadRogueMappingRecipe(name).segments[0]);
    });
}
