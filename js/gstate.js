// gstate.js — Global game state reference.
// All game modules import `game` from here.

import { initial_instance_globals, initial_state_held_globals } from './decl.js';
import { zero_flag, zero_instance_flags } from './flag.js';
import { zero_sinfo } from './program_state.js';
import { NO_COLOR } from './terminal.js';

function initialGameState() {
    const globals = initial_instance_globals();
    return {
        // C decl.c decl_globals_init() copies g_init_a ... g_init_z into
        // ga ... gz once per process and saves none of them, so each segment,
        // restored or not, starts every member from decl.c's value: mostly
        // zero, but -1 for gp.polearm_range_min and WIN_ERR for
        // gc.cached_pickinv_win. js/decl.js is generated from decl.h and
        // decl.c and holds the integer, boolean and enumeration members the
        // port keeps in these groups; scripts/instance-globals.test.mjs
        // fails when js/ replaces a group, tests whether such a member
        // exists, or gives a missing one another default.
        ...globals,
        // C decl.c starts gg.gbuf[][] zeroed once per process; js/display.js
        // glyph_buffer_at() owns it. No level holds it, so a level change
        // leaves it alone until docrt()'s cls().
        gg: { ...globals.gg, gbuf: initialGbuf() },
        // The tty map window's cells on the terminal and patch 006's shadow
        // copy of them, js/display.js tty_map_cell_at() and nomux_cell_at().
        // A new process starts with a blank terminal.
        tty_map_cells: initialTtyMapCells(),
        nomux_map: initialNomuxMap(),
        // The scalar members the port reads directly off the state, such as
        // state.multi for gm.multi and state.hero_seq for gh.hero_seq, from
        // the same initializers: gi.item_action_in_progress FALSE, gt.twohits
        // 0, gh.hero_seq 1L << 3, gl.lastinvnr 51.
        ...initial_state_held_globals(),
        // C decl.c:init_svn initializes the saved NHUUID buffer to zero.
        // Native get_nhuuid() is inactive in the reference recorder build.
        svn: { nhuuid: '' },
        // C decl.c:482 and 568 start gl.lregions empty (gn.num_lregions 0).
        // levregion_add() fills it while a special level loads and mkmaze.c
        // fixup_special() empties it; a restored game starts with it empty,
        // since savelev() does not store it, so sp_lev.c flip_level() finds
        // no region to flip there.
        lregions: [],
        // C decl.c:682 starts gs.smeq[MAXNROFROOMS + 1] zeroed (DUMMY) once
        // per process. sp_lev.c create_room() and extralev.c write a new
        // room's entry and mklev.c join() merges them; nothing else resets
        // it, and savelev() does not store it, so a level's fixed des.room()
        // rooms inherit the values the previous level left and a restored
        // game starts from zeros. The length is MAXNROFROOMS + 1 from
        // js/const.js, which imports this file; scripts/smeq-lifetime.test.mjs
        // checks it.
        smeq: new Array(41).fill(0),
        // C rect.c:20-22 holds n_rects, rect_cnt and rect[] as file statics,
        // zero and null once per process. mklev.c clear_level_structures()
        // calls init_rect() before each new level and save.c
        // freedynamicdata() calls free_rect(); savelev() stores none of
        // them, so a restored game starts with no rectangles and
        // rect.c rnd_rect() returns null until a level is made.
        n_rects: 0,
        rect_cnt: 0,
        nhrect: null,
        gb: initialGb(),
        // C zero-initializes program_state (hack.h struct sinfo, decl.c) once
        // per process and never saves it, so every member reads as 0 until
        // the code that owns it writes it, and each segment, restored or
        // not, starts from zero. js/program_state.js is generated from
        // hack.h; scripts/program-state.test.mjs fails when js/ replaces the
        // object, tests whether a member exists, defaults a missing one to
        // something other than 0, or names a member hack.h does not declare.
        program_state: zero_sinfo(),
        // C zero-initializes iflags (flag.h struct instance_flags, decl.c)
        // once per process and saves none of it. options.c
        // initoptions_init() then sets a few members; js/jsmain.js installs
        // that result, built in js/options.js defaultResult() from the same
        // zero struct. scripts/iflags-state.test.mjs fails when js/ tests
        // whether a member exists, defaults a missing one to something other
        // than zero, or names a member flag.h does not declare.
        iflags: zero_instance_flags(),
        // C zero-initializes flags (flag.h struct flag, decl.c) once per
        // process; options.c initoptions_init() and the boolean options'
        // compiled-in values then set most of it, and js/jsmain.js installs
        // that result, built in js/options.js defaultResult() from the same
        // zero struct. Unlike iflags, flags is saved: restore.c
        // restgamestate() reads the whole struct from the save file.
        // scripts/flags-state.test.mjs fails when js/ tests whether a member
        // exists, defaults a missing one to something other than zero, or
        // names a member flag.h does not declare.
        flags: zero_flag(),
    };
}

// C decl.c:219 starts gb.bhitpos at { 0, 0 } once per process, and
// savelev()/savegamestate() do not store it, so each segment starts from zero
// too. Like C's struct, the object is never replaced: code writes its .x and
// .y and saves it with a spread copy. scripts/bhitpos-access.test.mjs checks
// both rules and that js/ never guards, defaults or deletes it. Test states
// built by hand take their gb from here as well.
export function initialGb() {
    return { ...initial_instance_globals().gb, bhitpos: { x: 0, y: 0 } };
}

// The three per-square display grids, indexed [y][x] like C's
// gg.gbuf[ROWNO][COLNO]. js/const.js, which imports this file, defines both;
// scripts/check-c-constants.test.mjs checks these copies against the C values.
const ROWNO = 21;
const COLNO = 80;

function mapGrid(makeCell) {
    return Array.from({ length: ROWNO },
        () => Array.from({ length: COLNO }, makeCell));
}

// display.c gbuf_entry. A null glyphinfo is nul_gbuf, which C's
// clear_glyph_buffer() copies in: GLYPH_UNEXPLORED drawn as a blank.
export function initialGbuf() {
    return mapGrid(() => ({ gnew: 0, glyphinfo: null }));
}

export function initialTtyMapCells() {
    return mapGrid(() => ({
        ch: ' ',
        color: NO_COLOR,
        decgfx: false,
        attr: 0,
        browser_ch: null,
        browser_color: null,
        browser_attr: null,
    }));
}

// `ch` stays undefined until the first flush, cls() or docorner() reaches
// the cell; js/display.js show_glyph_cell() tells that from a blank (null).
export function initialNomuxMap() {
    return mapGrid(() => ({
        ch: undefined,
        color: NO_COLOR,
        decgfx: false,
        attr: 0,
    }));
}

export let game = initialGameState();

// C ref: decl.c program_state_init(): initialGameState() creates program_state
// from the generated zero_sinfo().
export function resetGame() {
    game = initialGameState();
    return game;
}

// js/youprop.js reports a property macro given the game state in place of the
// hero, or the reverse, through recordArgumentMisuse(). What happens to a
// report depends on the entry point. By default it is recorded and the caller
// carries on, so a path no test reached cannot stop a game the judge drives:
// runSegment(), and the browser play path that its playability runner
// (frozen/playability_runner.mjs) drives through NethackGame and
// moveloop_core() directly. runSegment() reports what was recorded to the
// local scorers, which fail that game. runSegmentStrict(), which every local
// replay tool uses, and the unit suite (scripts/strict-argument-misuses.mjs,
// preloaded by scripts/run-test-suite.mjs) select throwing instead, so a
// report fails there at the line that made it.
let recordingArgumentMisuses = true;
// One entry per distinct message, in first-use order: { kind, detail, count }.
// `kind` is 'youpropArgument' for js/youprop.js and 'byteText' for
// js/hacklib.js textBytes() given decoded text.
const misuseLog = new Map();

// Select recording (true) or throwing (false); returns the previous mode.
// Recording is the default; see the comment above.
export function setArgumentMisuseRecording(record) {
    const previous = recordingArgumentMisuses;
    recordingArgumentMisuses = Boolean(record);
    return previous;
}

// The uses recorded since the last reset, as { kind, detail, count }.
export function recordedArgumentMisuses() {
    return [...misuseLog.values()].map((use) => ({ ...use }));
}

export function resetArgumentMisuses() {
    misuseLog.clear();
}

// When throwing is selected, throw makeError(detail); otherwise record one
// use of `kind`, so that runSegment() reports it, and return so that the
// caller can carry on.
export function recordArgumentMisuse(kind, detail, makeError) {
    if (!recordingArgumentMisuses) throw makeError(detail);
    const use = misuseLog.get(detail);
    if (use) use.count++;
    else misuseLog.set(detail, { kind, detail, count: 1 });
}
