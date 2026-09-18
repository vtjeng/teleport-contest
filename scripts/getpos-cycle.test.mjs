import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    GLOC_DOOR,
    GFILTER_NONE,
    ROOM,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import {
    cmap_to_glyph,
    glyph_at,
} from '../js/display.js';
import {
    cmp_coord_distu,
    gloc_filter_classify_glyph,
    gloc_filter_floodfill_matcharea,
    gather_locs,
    gather_locs_interesting,
    known_vibrating_square_at,
} from '../js/getpos.js';
import {
    S_hwall,
    S_hodoor,
    S_room,
    S_vodoor,
    S_water,
} from '../js/symbols.js';

const C_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/getpos.c', import.meta.url), 'utf8',
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
    state._getposFilterMatchGlyph = room;
    state.level.at(5, 5).typ = ROOM;
    assert.equal(gloc_filter_floodfill_matcharea(5, 5, state), true);
    state.level.at(5, 5).seenv = 0;
    assert.equal(gloc_filter_floodfill_matcharea(5, 5, state), false);
    assert.equal(known_vibrating_square_at(5, 5, state), false);
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
});
