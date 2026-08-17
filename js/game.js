// game.js — Core game data structures.
// C ref: rm.h struct rm, dungeon.h, you.h

import { COLNO, ROWNO, STONE } from './const.js';
import { NO_COLOR } from './terminal.js';

// A single map cell. Mirrors C's struct rm.
export function makeLocation() {
    return {
        typ: STONE,      // terrain type (STONE, ROOM, CORR, DOOR, etc.)
        roomno: 0,        // room number (0 = not in a room)
        lit: false,        // is this cell lit?
        waslit: false,     // was this cell lit last time we checked?
        flags: 0,          // door flags, wall flags, etc.
        doormask: 0,       // door state (D_NODOOR, D_CLOSED, etc.)
        seenv: 0,          // which angles the hero has seen this wall from
        horizontal: false, // is this a horizontal wall?
        edge: false,       // is this at the edge of the map?
        wall_info: 0,      // wall flags (W_NONDIGGABLE, etc.)
        disp_ch: ' ',      // current display character
        disp_color: NO_COLOR,
        disp_decgfx: false,
        disp_attr: 0,
        // UTF-8 and IBM symbol sets have distinct recorder-wire and browser
        // representations under recorder patch 006.
        disp_browser_ch: null,
        disp_browser_color: null,
        disp_browser_attr: null,
        gnew: 0,           // dirty flag for flush_glyph_buf
        glyph_symidx: -1,  // S_* symbol index
        // C ref: rm.h struct rm's `glyph`. js/display.js
        // remembered_glyph_from_presentation() builds it, and it holds one of
        // two shapes because one layer has converted to what C stores and the
        // rest have not. An object square holds `{glyph}` alone: C's own
        // levl[x][y].glyph number, re-resolved by js/display.js
        // map_glyphinfo() at every draw. Every other layer holds a drawn
        // presentation, resolved under the option values in force when the
        // square was recorded, plus the canonical marks a presentation cannot
        // carry -- `cmap`, `trapType`, `a11yIdentity`, `a11ySubject`.
        // js/display.js remembered_glyph_presentation() is the seam that tells
        // the two apart; `undefined` means the hero remembers nothing here.
        remembered_glyph: undefined,
    };
}

function makeCoordinateGrid(makeCell) {
    const grid = [];
    for (let x = 0; x < COLNO; x++) {
        grid[x] = [];
        for (let y = 0; y < ROWNO; y++)
            grid[x][y] = makeCell();
    }
    return grid;
}

// The dungeon level map. C ref: struct level.
export class GameMap {
    constructor() {
        this.locations = makeCoordinateGrid(makeLocation);
        this.rooms = [];
        this.nroom = 0;
        this.doors = [];
        this.doorindex = 0;
        // C ref: rm.h struct level. Floor objects have both a per-square pile
        // chain (`objects[x][y]`) and a level-wide `objlist` chain.
        this.objects = makeCoordinateGrid(() => null);
        this.objlist = null;
        this.buriedobjlist = null;
        // C ref: rm.h struct level. Monsters are indexed by coordinate;
        // their nmon links separately form the level-wide monlist chain.
        this.monsters = makeCoordinateGrid(() => null);
        this.monlist = null;
        this.traps = [];
        // C ref: region.c gr.regions[]/svn.n_regions. A new level owns a
        // fresh active-region list; visible gas clouds are not terrain.
        this.regions = [];
        this.flags = {
            nfountains: 0,
            nsinks: 0,
            hero_memory: true,
            is_maze_lev: false,
        };
    }

    at(x, y) {
        if (x < 0 || x >= COLNO || y < 0 || y >= ROWNO) return null;
        return this.locations[x]?.[y] || null;
    }
}
