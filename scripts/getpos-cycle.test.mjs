import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    GLOC_DOOR,
    GLOC_INTERESTING,
    GLOC_MONS,
    GFILTER_NONE,
    GFILTER_AREA,
    GPCOORDS_NONE,
    GPCOORDS_COMPASS,
    GPCOORDS_COMFULL,
    GPCOORDS_MAP,
    GPCOORDS_SCREEN,
    ROOM,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import {
    GLYPH_MON_MALE_OFF,
    GLYPH_PET_MALE_OFF,
} from '../js/glyph_offsets.js';
import {
    cmap_to_glyph,
    glyph_at,
} from '../js/display.js';
import {
    cmp_coord_distu,
    gloc_filter_classify_glyph,
    gloc_filter_init,
    gloc_filter_done,
    gloc_filter_floodfill_matcharea,
    gather_locs,
    gather_locs_interesting,
    known_vibrating_square_at,
    coord_desc,
} from '../js/getpos.js';
import {
    S_hwall,
    S_hodoor,
    S_room,
    S_stone,
    S_vodoor,
    S_water,
} from '../js/symbols.js';

const C_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/getpos.c', import.meta.url), 'utf8',
);
const SELVAR_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/selvar.c', import.meta.url), 'utf8',
);

function initializedState() {
    const state = {
        u: { ux: 5, uy: 5, dx: 1, dy: 0 },
        iflags: { getloc_filter: GFILTER_NONE },
        level: new GameMap(),
        inv_pos: null,
        dungeons: {},
    };
    for (let x = 1; x < 80; ++x) {
        for (let y = 0; y < 21; ++y) {
            const location = state.level.at(x, y);
            location.seenv = 1;
            location.disp_glyph = { glyph: cmap_to_glyph(S_room, state) };
        }
    }
    return state;
}

test('cmp_coord_distu preserves C distance and y/x tie order', () => {
    const state = { u: { ux: 5, uy: 5 } };
    const coordinates = [
        { x: 7, y: 5 },
        { x: 3, y: 5 },
        { x: 5, y: 7 },
        { x: 5, y: 3 },
    ];
    coordinates.sort((a, b) => cmp_coord_distu(a, b, state));
    assert.deepEqual(coordinates, [
        { x: 5, y: 3 },
        { x: 3, y: 5 },
        { x: 7, y: 5 },
        { x: 5, y: 7 },
    ]);
});

test('getpos pure glyph helpers preserve C classes and seen matching', () => {
    const state = initializedState();
    const room = cmap_to_glyph(S_room, state);
    const wall = cmap_to_glyph(S_hwall, state);
    const water = cmap_to_glyph(S_water, state);
    assert.equal(gloc_filter_classify_glyph(room), 1);
    assert.equal(gloc_filter_classify_glyph(wall), 2);
    assert.equal(gloc_filter_classify_glyph(water), 4);
    state.gg = { gloc_filter_floodfill_match_glyph: room };
    state.level.at(5, 5).typ = ROOM;
    assert.equal(gloc_filter_floodfill_matcharea(5, 5, state), true);
    state.level.at(5, 5).seenv = 0;
    assert.equal(gloc_filter_floodfill_matcharea(5, 5, state), false);
    assert.equal(known_vibrating_square_at(5, 5, state), false);
});

test('selection floodfill keeps its valid start before match checks', () => {
    const state = initializedState();
    state.iflags.getloc_filter = GFILTER_AREA;
    state.level.at(5, 5).seenv = 0;
    gloc_filter_init(state);
    assert.equal(state.gg.gloc_filter_map.has('5,5'), true);
    const matchGlyph = state.gg.gloc_filter_floodfill_match_glyph;
    gloc_filter_done(state);
    assert.equal(state.gg.gloc_filter_map, null);
    assert.equal(state.gg.gloc_filter_floodfill_match_glyph, matchGlyph);
});

test('filter initialization reuses area state and leaves non-area state untouched', () => {
    const state = initializedState();
    const map = new Set(['old']);
    state.gg = {
        gloc_filter_map: map,
        gloc_filter_floodfill_match_glyph: 12345,
    };
    gloc_filter_init(state);
    assert.equal(state.gg.gloc_filter_map, map);
    assert.deepEqual([...map], ['old']);
    assert.equal(state.gg.gloc_filter_floodfill_match_glyph, 12345);
    state.level.at(5, 5).typ = ROOM;
    state.iflags.getloc_filter = GFILTER_AREA;
    gloc_filter_init(state);
    assert.equal(state.gg.gloc_filter_map, map);
    assert.equal(state.gg.gloc_filter_floodfill_match_glyph,
        cmap_to_glyph(S_room, state));
});

test('coord_desc formats every source coordinate mode', () => {
    const source = C_SOURCE.slice(
        C_SOURCE.indexOf('coord_desc(coordxy'),
        C_SOURCE.indexOf(
            'RESTORE_WARNING_FORMAT_NONLITERAL',
            C_SOURCE.indexOf('coord_desc(coordxy'),
        ),
    );
    assert.match(source, /case GPCOORDS_COMFULL:/);
    assert.match(source, /case GPCOORDS_COMPASS:/);
    assert.match(source, /case GPCOORDS_MAP:/);
    assert.match(source, /case GPCOORDS_SCREEN:/);
    const state = { u: { ux: 5, uy: 5 }, iflags: {} };
    state.iflags.getpos_coords = GPCOORDS_NONE;
    assert.equal(coord_desc(7, 5, state), '');
    state.iflags.getpos_coords = GPCOORDS_COMPASS;
    assert.equal(coord_desc(7, 5, state), '(2e)');
    state.iflags.getpos_coords = GPCOORDS_COMFULL;
    assert.equal(coord_desc(7, 5, state), '(2east)');
    state.iflags.getpos_coords = GPCOORDS_MAP;
    assert.equal(coord_desc(7, 5, state), '<7,5>');
    state.iflags.getpos_coords = GPCOORDS_SCREEN;
    assert.equal(coord_desc(7, 5, state), '[07,07]');
});

test('gather_locs short-circuits the hero callback and uses literal tail glyphs', async () => {
    const state = initializedState();
    let callbackCalls = 0;
    state.getpos_getvalid = async () => {
        callbackCalls += 1;
        return false;
    };
    await gather_locs(5, state);
    assert.equal(callbackCalls, 2 * (79 * 21 - 1));

    const normalTail = GLYPH_MON_MALE_OFF + 330;
    const petTail = GLYPH_PET_MALE_OFF + 330;
    state.level.at(4, 5).disp_glyph = { glyph: normalTail };
    state.level.at(6, 5).disp_glyph = { glyph: petTail };
    assert.equal(gather_locs_interesting(4, 5, GLOC_MONS, state), false);
    assert.equal(gather_locs_interesting(6, 5, GLOC_MONS, state), true);
});

test('interesting locations exclude the complete C wall range including stone', () => {
    const state = initializedState();
    state.level.at(6, 5).disp_glyph = { glyph: cmap_to_glyph(S_stone, state) };
    assert.equal(gather_locs_interesting(6, 5, GLOC_INTERESTING, state), false);
});

test('gather_locs includes the hero and sorts door locations', async () => {
    const state = initializedState();
    state.level.at(3, 5).disp_glyph = {
        glyph: cmap_to_glyph(S_vodoor, state),
    };
    state.level.at(7, 5).disp_glyph = {
        glyph: cmap_to_glyph(S_hodoor, state),
    };
    const locations = await gather_locs(GLOC_DOOR, state);
    assert.deepEqual(locations.slice(0, 3), [
        { x: 5, y: 5 },
        { x: 3, y: 5 },
        { x: 7, y: 5 },
    ]);
    assert.equal(gather_locs_interesting(3, 5, GLOC_DOOR, state), true);
    assert.equal(glyph_at(3, 5, state), cmap_to_glyph(S_vodoor, state));
});

test('getpos source defines the twelve location-cycle bindings and wrap', () => {
    const keyTable = C_SOURCE.slice(
        C_SOURCE.indexOf('static const int mMoOdDxX_def[]'),
        C_SOURCE.indexOf('char mMoOdDxX[13]'),
    );
    assert.match(keyTable, /NHKF_GETPOS_DOOR_NEXT/);
    assert.match(keyTable, /NHKF_GETPOS_DOOR_PREV/);
    const branchStart = C_SOURCE.indexOf(
        '} else if ((cp = strchr(mMoOdDxX, c))',
    );
    const branch = C_SOURCE.slice(branchStart, branchStart + 2200);
    assert.match(branch, /gidx\[gloc\] = \(gidx\[gloc\] \+ 1\)/);
    assert.match(branch, /if \(--gidx\[gloc\] < 0\)/);
    const floodfill = SELVAR_SOURCE.slice(
        SELVAR_SOURCE.indexOf('selection_floodfill('),
        SELVAR_SOURCE.indexOf('/* McIlroy'),
    );
    assert.match(floodfill, /selection_setpoint\(x, y, ov, 1\)/);
    assert.match(floodfill, /SEL_FLOOD_CHKDIR/);
    assert.match(C_SOURCE, /getpos_menu\(coord \*ccp, int gloc\)/);
    assert.match(C_SOURCE, /pick_cnt = select_menu\(tmpwin, PICK_ONE/);
});
