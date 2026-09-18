// getpos.c -- Ordinary farlook cursor selection.
// C refs: getpos.c auto_describe(), truncate_to_map(), and getpos(), covering
// default ordinary and fast movement, the traditional pick, and Escape.

import {
    MAXTCHARS,
    COLNO,
    GFILTER_NONE,
    GFILTER_VIEW,
    GFILTER_AREA,
    GPCOORDS_NONE,
    GPCOORDS_MAP,
    GPCOORDS_COMPASS,
    GPCOORDS_COMFULL,
    GPCOORDS_SCREEN,
    GLOC_DOOR,
    GLOC_EXPLORE,
    GLOC_INTERESTING,
    GLOC_MONS,
    GLOC_OBJS,
    GLOC_VALID,
    NUM_GLOCS,
    MV_RUN,
    MV_RUSH,
    MV_WALK,
    NHW_MAP,
    PICK_ONE,
    LOOK_ONCE,
    LOOK_QUICK,
    LOOK_TRADITIONAL,
    LOOK_VERBOSE,
    ROWNO,
    IS_DOOR,
    isok,
    TER_DETECT,
    TER_MAP,
    TER_MON,
    TER_OBJ,
    TIP_GETPOS,
    VIBRATING_SQUARE,
    quitchars,
} from './const.js';
import {
    createCommandBindingModel,
    keyForCommand,
} from './command_bindings.js';
import { directionname, movecmd, redraw_cmd, xytodir } from './cmd.js';
import {
    back_to_glyph,
    docrt,
    flush_screen,
    glyph_at,
    glyph_is_cmap,
    glyph_is_monster,
    glyph_is_object,
    glyph_to_obj,
    glyph_to_cmap,
    newsym,
} from './display.js';
import {
    GLYPH_MON_MALE_OFF,
    GLYPH_MON_FEM_OFF,
    GLYPH_NOTHING_OFF,
    GLYPH_UNEXPLORED_OFF,
} from './glyph_offsets.js';
import { game } from './gstate.js';
import { handle_tip, is_valid_travelpt } from './hack.js';
import { visctrl } from './hacklib.js';
import { nhgetch } from './input.js';
import { an } from './objnam.js';
import { do_screen_description } from './pager.js';
import { cansee } from './vision.js';
import { BOULDER, ROCK } from './objects.js';
import { PM_LONG_WORM_TAIL } from './monsters.js';
import {
    cmap_symbol_byte,
    MAXPCHARS,
    S_arrow_trap,
    S_corr,
    S_bars,
    S_darkroom,
    S_engrcorr,
    S_engroom,
    S_hcdoor,
    S_hcdbridge,
    S_hodbridge,
    S_hodoor,
    S_litcorr,
    S_ice,
    S_air,
    S_cloud,
    S_lava,
    S_lavawall,
    S_ndoor,
    S_pool,
    S_room,
    S_stone,
    S_upstair,
    S_fountain,
    S_tree,
    S_trwall,
    S_vcdbridge,
    S_vcdoor,
    S_vodbridge,
    S_vodoor,
    S_water,
} from './symbols.js';
import { DEFAULT_PRIMARY_SYMBOLS, SYM_OFF_P } from './symbol_data.js';
import { clearTtyMessageWindow, ttyPline } from './tty_message.js';
import { displayTtyMenuTextWindow } from './tty_menu.js';
import { Invocation_lev } from './dungeon.js';
import { tty_create_nhwindow, tty_curs } from './wintty.js';
import { select_menu } from './windows.js';

// C ref: getpos.c dxdy_to_dist_descr() (557-590).  This is shared by the
// status window's held-by-monster line and the farlook helpers; keep the
// source owner here rather than duplicating the compass formatting in a
// caller.
export function dxdy_to_dist_descr(dx, dy, fulldir = true) {
    if (!dx && !dy) return 'here';
    const dir = xytodir(dx, dy);
    if (dir !== -1) return directionname(dir);
    const dirnames = [
        ['n', 'north'], ['s', 'south'], ['w', 'west'], ['e', 'east'],
    ];
    let result = '';
    if (dy) {
        const clipped = Math.min(Math.abs(dy), 9999);
        result += `${clipped}${dirnames[dy > 0 ? 1 : 0][fulldir ? 1 : 0]}`;
        if (dx) result += ',';
    }
    if (dx) {
        const clipped = Math.min(Math.abs(dx), 9999);
        result += `${clipped}${dirnames[dx > 0 ? 3 : 2][fulldir ? 1 : 0]}`;
    }
    return result;
}

export {
    LOOK_ONCE,
    LOOK_QUICK,
    LOOK_TRADITIONAL,
    LOOK_VERBOSE,
};

// C ref: getpos.c gloc_descr[][] and gloc_filtertxt[] (117-134). These are
// kept beside the help functions because the source uses the same indexed
// tables for every line in the popup.
const GLOC_DESCR = Object.freeze([
    ['any monsters', 'monster', 'next/previous monster', 'monsters'],
    ['any items', 'item', 'next/previous object', 'objects'],
    ['any doors', 'door', 'next/previous door or doorway',
        'doors or doorways'],
    ['any unexplored areas', 'unexplored area', 'unexplored location',
        'locations next to unexplored locations'],
    ['anything interesting', 'interesting thing', 'anything interesting',
        'anything interesting'],
    ['any valid locations', 'valid location', 'valid location',
        'valid locations'],
]);
const GLOC_FILTERTXT = Object.freeze([
    '', ' in view', ' in this area',
]);
const GETPOS_WHAT_IS_A_LOCATION = 'a monster, object or location';

function cursorAt(x, y, state) {
    // getpos.c calls curs(WIN_MAP, x, y); wintty.c owns the map offset,
    // clipping, window cursor bookkeeping, and terminal movement.
    const wt = state.wintty ?? (state.wintty = {});
    if (!Number.isInteger(wt.WIN_MAP) || !wt.wins?.[wt.WIN_MAP]) {
        wt.WIN_MAP = tty_create_nhwindow(NHW_MAP, state);
        wt.wins[wt.WIN_MAP].active = true;
    }
    tty_curs(wt.WIN_MAP, x, y, state);
}

// C refs: getpos.c getpos_sethilite() (41-63),
// selvar.c selection_force_newsyms() (802-810), and display.c newsym_force()
// (1863-1871).  The jump caller installs getpos_getvalid before entering
// getpos().  C marks every valid square dirty when that callback changes, so
// the first flush prints those cells and leaves the tty cursor immediately
// after the last one in display.c's row-major flush order.  The browser owns a
// complete grid rather than a gbuf range, so retain the same final cursor as a
// pending map position while still using newsym() for each forced glyph.
// C ref: getpos.c getpos_getvalids_selection() (102-115).  The selection
// object itself is temporary; callers only need the coordinates it contains
// while they force the corresponding map glyphs.
export async function getpos_getvalids_selection(valid, state = game) {
    if (typeof valid !== 'function') return [];
    const selected = [];
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            if (!await valid(x, y, state)) continue;
            selected.push({ x, y });
        }
    }
    return selected;
}

async function forceGetposSelectionRedraw(state) {
    const valid = state.getpos_getvalid;
    if (typeof valid !== 'function' || !state.level?.at) return null;

    const selected = await getpos_getvalids_selection(valid, state);
    for (const { x, y } of selected) {
        newsym(x, y);
        // newsym_force() calls newsym() and then sets gnew even when the
        // glyph itself did not change.  JS newsym() uses the live game
        // object, which is the state passed to production getpos().
        const location = state.level.at(x, y);
        if (location) location.gnew = 1;
    }

    // flush_glyph_buffer() visits rows first and columns second, unlike the
    // selection construction loop above.  tty_print_glyph() advances one
    // column after tty_curs(), hence x + 1 below when the cursor is restored.
    let last = null;
    for (const position of selected) {
        if (!last || position.y > last.y
            || (position.y === last.y && position.x > last.x))
            last = position;
    }
    return last;
}

function sign(value) {
    return value < 0 ? -1 : value > 0 ? 1 : 0;
}

// C ref: getpos.c getpos() (1126-1132). cmd_from_func() resolves the current
// bindings for the four cardinal movement handlers, while gc.Cmd.spkeys[]
// supplies the active traditional-pick key.
function unknownDirectionNote(state) {
    state.commandBindings ??= createCommandBindingModel(state);
    const directions = ['movewest', 'movesouth', 'movenorth', 'moveeast'];
    const keys = directions.map((command) => (
        keyForCommand(state.commandBindings, command)
    ));
    const pick = state.commandBindings.specialKeys?.['getpos.pick'] ?? 0;
    return `use '${visctrl(keys[0])}', '${visctrl(keys[1])}', `
        + `'${visctrl(keys[2])}', '${visctrl(keys[3])}' or '${visctrl(pick)}'`;
}

// C ref: getpos.c pick_chars_def[] (773-780, 830-836). The four bindings are
// read when getpos() starts, so configured keys take effect without changing
// the cursor loop. strchr() returns the first matching entry, which preserves
// C's traditional-pick precedence when two special keys share one byte.
const PICK_CHAR_RESULTS = Object.freeze([
    ['getpos.pick', LOOK_TRADITIONAL],
    ['getpos.pick.quick', LOOK_QUICK],
    ['getpos.pick.once', LOOK_ONCE],
    ['getpos.pick.verbose', LOOK_VERBOSE],
]);

function pickResultForKey(key, state) {
    state.commandBindings ??= createCommandBindingModel(state);
    for (const [command, result] of PICK_CHAR_RESULTS) {
        if (state.commandBindings.specialKeys?.[command] === key)
            return result;
    }
    return null;
}

// C ref: getpos.c mMoOdDxX_def[] (781-795). Keep the source order because
// each pair's index selects one GLOC_* family and its case controls forward
// versus reverse cycling.
const LOCATION_CYCLE_KEYS = Object.freeze([
    ['getpos.mon.next', GLOC_MONS, false],
    ['getpos.mon.prev', GLOC_MONS, true],
    ['getpos.obj.next', GLOC_OBJS, false],
    ['getpos.obj.prev', GLOC_OBJS, true],
    ['getpos.door.next', GLOC_DOOR, false],
    ['getpos.door.prev', GLOC_DOOR, true],
    ['getpos.unexplored.next', GLOC_EXPLORE, false],
    ['getpos.unexplored.prev', GLOC_EXPLORE, true],
    ['getpos.all.next', GLOC_INTERESTING, false],
    ['getpos.all.prev', GLOC_INTERESTING, true],
    ['getpos.valid.next', GLOC_VALID, false],
    ['getpos.valid.prev', GLOC_VALID, true],
]);

function locationCycleForKey(key, state) {
    state.commandBindings ??= createCommandBindingModel(state);
    for (let index = 0; index < LOCATION_CYCLE_KEYS.length; ++index) {
        const [name, gloc, reverse] = LOCATION_CYCLE_KEYS[index];
        if (state.commandBindings.specialKeys?.[name] === key)
            return { index, gloc, reverse };
    }
    return null;
}

function getposCommandText(command, state) {
    state.commandBindings ??= createCommandBindingModel(state);
    return visctrl(keyForCommand(state.commandBindings, command));
}

function getposSpecialKeyText(name, state) {
    state.commandBindings ??= createCommandBindingModel(state);
    return visctrl(state.commandBindings.specialKeys?.[name] ?? 0);
}

// C ref: getpos.c getpos_help_keyxhelp() (137-161). The explore wording and
// menu-specific filter shortening are source-ordered because they affect the
// popup's line wrapping and therefore its terminal geometry.
function getpos_help_keyxhelp(tmpwin, k1, k2, gloc, state = game) {
    let moveCursorTo = 'move the cursor to ';
    let filterText = GLOC_FILTERTXT[state.iflags?.getloc_filter
        ?? GFILTER_NONE] ?? '';
    if (gloc === GLOC_EXPLORE) {
        moveCursorTo = 'move the cursor next to an ';
        if (state.iflags?.getloc_usemenu)
            filterText = filterText.replace('this area', 'area');
    }
    const useMenu = Boolean(state.iflags?.getloc_usemenu);
    const description = GLOC_DESCR[gloc]?.[2 + Number(useMenu)] ?? '';
    const line = `Use '${k1}'/'${k2}' to ${useMenu ? 'get a menu of '
        : moveCursorTo}${description}${filterText}.`;
    tmpwin.push(line);
}

// C ref: getpos.c getpos_refresh() (750-766). The JavaScript TTY menu helper
// restores a partial popup at dismissal; docrt() then performs C's full map
// refresh before getpos() puts the targeting cursor back.
async function getpos_refresh(state = game) {
    // docrt() owns the module-level game, which is the production state passed
    // through cmd.js. The state parameter keeps this helper's source-shaped
    // caller signature explicit for focused getpos tests.
    if (state !== game)
        throw new Error('getpos_refresh requires the module-level game');
    await docrt();
}

// C ref: getpos.c getpos_help() (165-307). NHW_MENU text consumes the next
// Space, Return, or Escape through dmore(), then getpos_refresh() is called by
// getpos() so the targeting cursor and map remain visible.
async function getpos_help(force, goal, state = game) {
    const fastMoveMode = ['8 units at a time', 'skipping same glyphs'];
    const terrainmode = state.iflags?.terrainmode ?? 0;
    const lines = [];

    lines.push(
        `Use '${getposCommandText('movewest', state)}', `
        + `'${getposCommandText('movesouth', state)}', `
        + `'${getposCommandText('movenorth', state)}', `
        + `'${getposCommandText('moveeast', state)}' to move the cursor to `
        + `${goal}.`,
    );
    lines.push(
        `Use '${getposCommandText('runwest', state)}', `
        + `'${getposCommandText('runsouth', state)}', `
        + `'${getposCommandText('runnorth', state)}', `
        + `'${getposCommandText('runeast', state)}' to fast-move the cursor, `
        + `${fastMoveMode[Number(Boolean(state.iflags?.getloc_moveskip))]}.`,
    );
    lines.push(
        `(or prefix normal move with '${getposCommandText('run', state)}' `
        + `or '${getposCommandText('rush', state)}' to fast-move)`,
    );
    lines.push("Or enter a background symbol (ex. '<').");
    lines.push(
        `Use '${getposSpecialKeyText('getpos.self', state)}' to move the cursor `
        + 'on yourself.',
    );

    if (!terrainmode || (terrainmode & TER_MON) !== 0) {
        getpos_help_keyxhelp(
            lines,
            getposSpecialKeyText('getpos.mon.next', state),
            getposSpecialKeyText('getpos.mon.prev', state),
            GLOC_MONS,
            state,
        );
    }
    if (goal !== 'a monster'
        && (!terrainmode || (terrainmode & TER_OBJ) !== 0)) {
        getpos_help_keyxhelp(
            lines,
            getposSpecialKeyText('getpos.obj.next', state),
            getposSpecialKeyText('getpos.obj.prev', state),
            GLOC_OBJS,
            state,
        );
    }
    if (goal !== 'a monster'
        && (!terrainmode || (terrainmode & TER_MAP) !== 0)) {
        getpos_help_keyxhelp(
            lines,
            getposSpecialKeyText('getpos.door.next', state),
            getposSpecialKeyText('getpos.door.prev', state),
            GLOC_DOOR,
            state,
        );
        getpos_help_keyxhelp(
            lines,
            getposSpecialKeyText('getpos.unexplored.next', state),
            getposSpecialKeyText('getpos.unexplored.prev', state),
            GLOC_EXPLORE,
            state,
        );
        getpos_help_keyxhelp(
            lines,
            getposSpecialKeyText('getpos.all.next', state),
            getposSpecialKeyText('getpos.all.prev', state),
            GLOC_INTERESTING,
            state,
        );
    }
    lines.push(
        `Use '${getposSpecialKeyText('getpos.moveskip', state)}' to change `
        + `fast-move mode to ${fastMoveMode[Number(!Boolean(
            state.iflags?.getloc_moveskip,
        ))]}.`,
    );
    if (!terrainmode || (terrainmode & TER_DETECT) === 0) {
        lines.push(
            `Use '${getposSpecialKeyText('getpos.menu', state)}' to toggle menu `
            + 'listing for possible targets.',
        );
        lines.push(
            `Use '${getposSpecialKeyText('getpos.filter', state)}' to change the `
            + 'mode of limiting possible targets.',
        );
    }
    if (!terrainmode) {
        if (state.getpos_getvalid) {
            lines.push(
                `Use '${getposSpecialKeyText('getpos.valid.next', state)}' or `
                + `'${getposSpecialKeyText('getpos.valid.prev', state)}' to move `
                + 'to valid locations.',
            );
        }
        if (state.getpos_hilitefunc) {
            lines.push(
                `Use '${getposSpecialKeyText('getpos.valid', state)}' to `
                + 'toggle marking of valid locations.',
            );
        }
        lines.push(
            `Use '${getposSpecialKeyText('getpos.autodescribe', state)}' to `
            + 'toggle automatic description.',
        );

        // C compares this pointer with pager.c's static string, so use the
        // same value for the JavaScript pager caller.
        const doingWhatIs = goal === GETPOS_WHAT_IS_A_LOCATION;
        const pick = doingWhatIs
            ? `'${getposSpecialKeyText('getpos.pick', state)}' or `
                + `'${getposSpecialKeyText('getpos.pick.quick', state)}' or `
                + `'${getposSpecialKeyText('getpos.pick.once', state)}' or `
                + `'${getposSpecialKeyText('getpos.pick.verbose', state)}'`
            : `'${getposSpecialKeyText('getpos.pick', state)}'`;
        lines.push(`Type a ${pick} when you are at the right place.`);
        if (doingWhatIs) {
            lines.push(
                `  '${getposSpecialKeyText('getpos.pick.verbose', state)}' `
                + 'describe current spot, show \'more info\', move to '
                + 'another spot.',
            );
            lines.push(
                `  '${getposSpecialKeyText('getpos.pick', state)}' describe `
                + `current spot,${state.flags?.help && !force
                    ? " prompt if 'more info'," : ''} move to another spot;`,
            );
            lines.push(
                `  '${getposSpecialKeyText('getpos.pick.quick', state)}' `
                + 'describe current spot, move to another spot;',
            );
            lines.push(
                `  '${getposSpecialKeyText('getpos.pick.once', state)}' `
                + 'describe current spot, stop looking at things;',
            );
        }
    }
    if (!force) lines.push("Type Space or Escape when you're done.");
    lines.push('');
    await displayTtyMenuTextWindow(state, lines);
}

// C ref: getpos.c truncate_to_map() (729-748). JavaScript returns the two
// pointer results as one coordinate while preserving C's update order.
export function truncate_to_map(cx, cy, dx, dy) {
    if (cx + dx < 1) {
        dy -= sign(dy) * (1 - (cx + dx));
        dx = 1 - cx;
    } else if (cx + dx > COLNO - 1) {
        dy += sign(dy) * ((COLNO - 1) - (cx + dx));
        dx = (COLNO - 1) - cx;
    }
    if (cy + dy < 0) {
        dx -= sign(dx) * (0 - (cy + dy));
        dy = -cy;
    } else if (cy + dy > ROWNO - 1) {
        dx += sign(dx) * ((ROWNO - 1) - (cy + dy));
        dy = (ROWNO - 1) - cy;
    }
    return { x: cx + dx, y: cy + dy };
}

// C ref: getpos.c auto_describe() (640-662), under default getpos_coords.
// ttyPline() flushes with the cursor on the hero, so restore the selected map
// coordinate after it writes the source firstmatch text.
async function auto_describe(cx, cy, state) {
    const noTravelPath = state.iflags?.getloc_travelmode
        && !await is_valid_travelpt(cx, cy, state);
    try {
        const description = do_screen_description(
            { x: cx, y: cy }, true, 0, state,
        );
        if (description.found) {
            const invalidTarget = state.iflags?.autodescribe
                && state.getpos_getvalid
                && !await state.getpos_getvalid(cx, cy, state);
            await ttyPline(
                description.firstmatch
                + (invalidTarget ? ' (invalid target)' : '')
                + (noTravelPath ? ' (no travel path)' : ''),
                state,
            );
        }
    } catch (e) {
        if (e.name !== 'UnsupportedWhatisError') throw e;
    }
    cursorAt(cx, cy, state);
    await flush_screen(0);
}

// C ref: getpos.c known_vibrating_square_at() (422-431). A genuine
// vibrating square is discoverable by '~' only at the invocation position;
// this excludes wizard-created fake vibrating traps that cannot occur in a
// normal invocation-level map.
export function known_vibrating_square_at(x, y, state) {
    if (!state.u?.uz || !state.dungeons?.[state.u.uz.dnum]) return false;
    if (!Invocation_lev(state.u?.uz, state)
        || state.inv_pos?.x !== x || state.inv_pos?.y !== y) {
        return false;
    }
    return (state.level?.traps ?? []).some((trap) => (
        trap.tx === x && trap.ty === y
        && trap.ttyp === VIBRATING_SQUARE
        && trap.tseen
    ));
}

// C ref: getpos.c cmp_coord_distu() (312-330). qsort() uses the hero's
// current square as the primary key, then source y/x order as tie breakers.
// The helper is pure; callers pass the state explicitly so planned maps do
// not accidentally sort against the live hero.
export function cmp_coord_distu(a, b, state = game) {
    const distance = (coord) => Math.max(
        Math.abs((state.u?.ux ?? 0) - coord.x),
        Math.abs((state.u?.uy ?? 0) - coord.y),
    );
    const first = distance(a);
    const second = distance(b);
    if (first === second)
        return a.y !== b.y ? a.y - b.y : a.x - b.x;
    return first - second;
}

// C ref: getpos.c gloc_filter_classify_glyph() (343-360). This classifies
// the terrain family used by the same-area flood fill; matching families are
// traversable even when their exact glyph differs by wall angle or lighting.
export function gloc_filter_classify_glyph(glyph) {
    if (!glyph_is_cmap(glyph)) return 0;
    const sym = glyph_to_cmap(glyph);
    if ((sym >= S_room && sym <= S_darkroom)
        || (sym >= S_upstair && sym <= S_fountain)) return 1;
    if (sym >= S_stone && sym <= S_trwall || sym === S_tree) return 2;
    if (sym >= S_corr && sym <= S_litcorr) return 3;
    if (sym === S_pool || sym === S_water) return 4;
    if (sym === S_lava || sym === S_lavawall) return 5;
    return 0;
}

// C ref: getpos.c gloc_filter_floodfill_matcharea() (363-379). The
// selection callback reads remembered terrain and seen state, not the
// transient displayed glyph. `filterMap` is the JS selection equivalent.
export function gloc_filter_floodfill_matcharea(x, y, state = game) {
    if (!isok(x, y)) return false;
    const location = state.level?.at(x, y);
    if (!location?.seenv) return false;
    const glyph = back_to_glyph(x, y, state);
    // C's gg.gloc_filter_floodfill_match_glyph is temporary state shared by
    // selection_floodfill's callback. Keep the same lifetime under gg rather
    // than making a second permanent filter object.
    const matchGlyph = state.gg?.gloc_filter_floodfill_match_glyph;
    return glyph === matchGlyph
        || gloc_filter_classify_glyph(glyph)
            === gloc_filter_classify_glyph(matchGlyph);
}

// C ref: getpos.c gloc_filter_floodfill() (382-390). selection_floodfill()
// uses cardinal neighbors when diagonals is FALSE.
export function gloc_filter_floodfill(x, y, state = game) {
    state.gg ??= {};
    // C's selection_floodfill() always records its valid starting point;
    // matcharea is consulted only for the cardinal neighbors it enqueues.
    state.gg.gloc_filter_map ??= new Set();
    state.gg.gloc_filter_floodfill_match_glyph = back_to_glyph(x, y, state);
    const queue = [{ x, y }];
    const seen = new Set();
    while (queue.length) {
        const point = queue.shift();
        const key = `${point.x},${point.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!isok(point.x, point.y))
            continue;
        const isStart = point.x === x && point.y === y;
        if (isStart || gloc_filter_floodfill_matcharea(point.x, point.y, state)) {
            state.gg.gloc_filter_map.add(key);
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
                queue.push({ x: point.x + dx, y: point.y + dy });
        }
    }
}

// C ref: getpos.c gloc_filter_init() (393-414). Area filtering starts on the
// side of a doorway indicated by the hero's direction; a doorway without a
// direction leaves the allocated selection empty, exactly as C does.
export function gloc_filter_init(state = game) {
    state.gg ??= {};
    delete state.gg.gloc_filter_map;
    delete state.gg.gloc_filter_floodfill_match_glyph;
    if (state.iflags?.getloc_filter !== GFILTER_AREA) return;
    state.gg.gloc_filter_map = new Set();
    const here = state.level?.at(state.u?.ux, state.u?.uy);
    if (here && IS_DOOR(here.typ)) {
        const dx = state.u?.dx ?? 0;
        const dy = state.u?.dy ?? 0;
        if (dx || dy) {
            const x = state.u.ux + dx;
            const y = state.u.uy + dy;
            if (isok(x, y)) gloc_filter_floodfill(x, y, state);
        }
    } else if (isok(state.u?.ux, state.u?.uy)) {
        gloc_filter_floodfill(state.u.ux, state.u.uy, state);
    }
}

// C ref: getpos.c gloc_filter_done() (417-425). The selection is temporary
// for one gather operation.
export function gloc_filter_done(state = game) {
    if (state.gg?.gloc_filter_map) {
        // C selection_free(..., TRUE) releases the temporary selection after
        // every gather pass; dropping the JS Set mirrors that lifetime.
        delete state.gg.gloc_filter_map;
    }
    delete state.gg?.gloc_filter_floodfill_match_glyph;
}

function sameArea(x, y, state) {
    return state.gg?.gloc_filter_map?.has(`${x},${y}`) ?? false;
}

// C ref: getpos.c gather_locs_interesting() (438-508), GLOC_INTERESTING.
// Keep the interest filter beside the getpos owner: callers must inspect the
// stored glyph without naming terrain, since waterbody_name() can consume
// display RNG while a square is only being considered for description.
export function gather_locs_interesting(
    x, y, gloc = GLOC_INTERESTING, state = game,
) {
    if (state.iflags?.getloc_filter === GFILTER_VIEW && !cansee(x, y, state))
        return false;
    if (state.iflags?.getloc_filter === GFILTER_AREA
        && !sameArea(x, y, state)
        && !sameArea(x - 1, y, state)
        && !sameArea(x, y - 1, state)
        && !sameArea(x + 1, y, state)
        && !sameArea(x, y + 1, state)) return false;

    const glyph = glyph_at(x, y, state);
    const sym = glyph_is_cmap(glyph) ? glyph_to_cmap(glyph) : -1;
    const isDoor = [
        S_ndoor, S_vodoor, S_hodoor, S_vcdoor, S_hcdoor,
        S_vodbridge, S_hodbridge, S_vcdbridge, S_hcdbridge,
    ].includes(sym);
    if (gloc === GLOC_MONS) {
        const normalMaleTail = GLYPH_MON_MALE_OFF + PM_LONG_WORM_TAIL;
        const normalFemaleTail = GLYPH_MON_FEM_OFF + PM_LONG_WORM_TAIL;
        return glyph_is_monster(glyph)
            && glyph !== normalMaleTail && glyph !== normalFemaleTail;
    }
    if (gloc === GLOC_OBJS) {
        return glyph_is_object(glyph)
            && glyph_to_obj(glyph) !== BOULDER
            && glyph_to_obj(glyph) !== ROCK;
    }
    if (gloc === GLOC_DOOR) return isDoor;
    if (gloc === GLOC_EXPLORE) {
        if (!glyph_is_cmap(glyph) || glyph === GLYPH_NOTHING_OFF)
            return false;
        if (!(isDoor
            || (sym >= S_room && sym <= S_darkroom)
            || (sym >= S_corr && sym <= S_litcorr))) return false;
        return [
            [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
        ].some(([nx, ny]) => {
            if (!isok(nx, ny)) return false;
            const neighbor = state.level?.at(nx, ny);
            return glyph_at(nx, ny, state) === GLYPH_UNEXPLORED_OFF
                && !neighbor?.seenv;
        });
    }
    if (gloc === GLOC_VALID && state.getpos_getvalid)
        return state.getpos_getvalid(x, y, state);
    if (gloc !== GLOC_INTERESTING && gloc !== GLOC_VALID) return false;
    const excluded = glyph_is_cmap(glyph)
        && (
            (sym >= S_stone && sym <= S_trwall)
            || [
                S_tree, S_bars, S_ice, S_air, S_cloud, S_lava, S_lavawall,
                S_water, S_pool, S_ndoor, S_room, S_darkroom, S_corr, S_litcorr,
            ].includes(sym)
        );
    return isDoor
        || ((!excluded && glyph !== GLYPH_NOTHING_OFF
            && glyph !== GLYPH_UNEXPLORED_OFF)
        || known_vibrating_square_at(x, y, state));
}

// C ref: getpos.c gather_locs() (513-553). The two-pass allocation is
// preserved as a count pass followed by a fill pass; qsort's comparator is
// the source-owned cmp_coord_distu above. The valid-position callback is
// asynchronous in the JS jump owner, so this helper is async while all
// ordinary filters retain their synchronous source contract.
export async function gather_locs(gloc, state = game) {
    gloc_filter_init(state);
    try {
        let count = 0;
        for (let x = 1; x < COLNO; ++x) {
            for (let y = 0; y < ROWNO; ++y) {
                const matchesHero = x === state.u?.ux && y === state.u?.uy;
                const interesting = matchesHero ? false
                    : await gather_locs_interesting(x, y, gloc, state);
                if (matchesHero || interesting) ++count;
            }
        }
        const locations = new Array(count);
        let index = 0;
        for (let x = 1; x < COLNO; ++x) {
            for (let y = 0; y < ROWNO; ++y) {
                const matchesHero = x === state.u?.ux && y === state.u?.uy;
                const interesting = matchesHero ? false
                    : await gather_locs_interesting(x, y, gloc, state);
                if (matchesHero || interesting)
                    locations[index++] = { x, y };
            }
        }
        locations.sort((a, b) => cmp_coord_distu(a, b, state));
        return locations;
    } finally {
        gloc_filter_done(state);
    }
}

// C ref: getpos.c coord_desc() (595-645).  getpos_menu() is a return-valued
// caller of this formatter, so keep the coordinate modes beside its owner
// instead of silently dropping configured map/screen coordinates.
function coord_desc(x, y, state) {
    const mode = state.iflags?.getpos_coords ?? GPCOORDS_NONE;
    if (mode === GPCOORDS_COMPASS || mode === GPCOORDS_COMFULL) {
        const full = mode === GPCOORDS_COMFULL;
        return `(${dxdy_to_dist_descr(
            x - (state.u?.ux ?? 0), y - (state.u?.uy ?? 0), full,
        )})`;
    }
    if (mode === GPCOORDS_MAP) return `<${x},${y}>`;
    if (mode === GPCOORDS_SCREEN)
        return `[${String(y + 2).padStart(2, '0')},${String(x).padStart(2, '0')}]`;
    return '';
}

// C ref: getpos.c getpos_menu() (665-725).  The menu is a real
// return-valued dependency of getpos(): a cancelled menu leaves the cursor
// untouched, while a selected item writes its coordinate through ccp.
export async function getpos_menu(ccp, gloc, state = game) {
    const locations = await gather_locs(gloc, state);
    if (locations.length < 2) {
        await ttyPline(
            `You cannot ${state.iflags?.getloc_filter === GFILTER_VIEW
                ? 'see' : 'detect'} ${GLOC_DESCR[gloc]?.[0] ?? 'that'}.`,
            state,
        );
        return false;
    }

    const items = [];
    for (let index = 1; index < locations.length; ++index) {
        const point = locations[index];
        const description = do_screen_description(point, true, 0, state);
        if (!description?.found) continue;
        const coordinate = coord_desc(point.x, point.y, state);
        items.push({
            label: `${description.firstmatch ?? 'unknown'}${coordinate
                ? ` ${coordinate}` : ''}`,
            value: index,
        });
    }

    const filter = GLOC_FILTERTXT[state.iflags?.getloc_filter ?? GFILTER_NONE]
        ?? '';
    const travel = state.iflags?.getloc_travelmode
        ? ' for travel destination' : '';
    const selected = await select_menu(state, {
        title: `Pick ${an(GLOC_DESCR[gloc]?.[1] ?? 'location')}${filter}${travel}`,
        items,
        how: PICK_ONE,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    });
    if (selected === null || selected === undefined) return false;
    const point = locations[Number(selected)];
    if (!point) return false;
    ccp.x = point.x;
    ccp.y = point.y;
    return true;
}

// C ref: getpos.c getpos() feature-symbol matching (1039-1064). C builds a
// one-based matching[] table from both the compiled defsym and active
// showsym bytes, excluding walls, rooms, corridors, and doors. The table also
// gives '^' the complete trap family and an engraving symbol both engraving
// families.
function featureSymbolMatches(key, state) {
    const matching = Array(MAXPCHARS).fill(0);
    let count = 0;
    for (let sidx = 0; sidx < MAXPCHARS; ++sidx) {
        if ((sidx >= S_stone && sidx <= S_trwall)
            || (sidx >= S_room && sidx <= S_darkroom)
            || (sidx >= S_corr && sidx <= S_litcorr)
            || (sidx >= S_vodoor && sidx <= S_hcdoor)
            || sidx === S_ndoor) {
            continue;
        }
        const compiled = DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_P + sidx];
        const active = cmap_symbol_byte(sidx, state);
        const trapMatch = key === '^'
            && sidx >= S_arrow_trap
            && sidx < S_arrow_trap + MAXTCHARS;
        const engravingMatch = key === cmap_symbol_byte(S_engroom, state)
            && (sidx === S_engroom || sidx === S_engrcorr);
        if (key === compiled || key === active || trapMatch || engravingMatch)
            matching[sidx] = ++count;
    }
    return { matching, count };
}

function matchingCmapGlyph(glyph, matching) {
    return glyph_is_cmap(glyph)
        && matching[glyph_to_cmap(glyph)];
}

// C ref: getpos.c getpos() feature-symbol scan (1066-1116). The scan uses
// current presentation, remembered glyph, a genuine vibrating square, and
// seen terrain in that order, with a lower-right pass followed by an
// upper-left pass.
function findTerrainFeature(key, cx, cy, state) {
    const map = state.level;
    if (!map) return null;
    const { matching, count } = featureSymbolMatches(key, state);
    if (!count) return { found: false, matching: false };

    for (let pass = 0; pass <= 1; ++pass) {
        const loY = pass === 0 ? cy : 0;
        const hiY = pass === 0 ? ROWNO - 1 : cy;
        for (let y = loY; y <= hiY; ++y) {
            const loX = pass === 0 && y === loY ? cx + 1 : 1;
            const hiX = pass === 1 && y === hiY ? cx : COLNO - 1;
            for (let x = loX; x <= hiX; ++x) {
                const location = map.at(x, y);
                if (!location) continue;
                if (matchingCmapGlyph(glyph_at(x, y, state), matching))
                    return { found: true, x, y };
                if (state.level.flags?.hero_memory
                    && !state.iflags?.terrainmode
                    && matchingCmapGlyph(
                        location.remembered_glyph?.glyph, matching,
                    ))
                    return { found: true, x, y };
                if (key === '~' && known_vibrating_square_at(x, y, state))
                    return { found: true, x, y };
                if (location.seenv
                    && matchingCmapGlyph(back_to_glyph(x, y, state), matching))
                    return { found: true, x, y };
            }
        }
    }
    return { found: false, matching: true };
}

export async function getpos(ccp, force, goal, state = game) {
    // C ref: force=TRUE keeps the loop running on unrecognized keys
    // instead of exiting. For valid session input the behavior is identical.
    const savedDirection = {
        dx: state.u.dx,
        dy: state.u.dy,
        dz: state.u.dz,
    };
    const target = goal || 'desired location';
    let cx = ccp.x;
    let cy = ccp.y;
    let showGoalMessage = await handle_tip(TIP_GETPOS, state);
    let messageGiven = true;
    // getpos_sethilite() in C keeps a callback and a three-state mode. The
    // jump caller supplies the callback; the default starts with no visible
    // good-position markers when background highlighting is disabled.
    let hiliteState = state.iflags?.bgcolors ? 2 : 0;
    // Build the active special-key table before reading input, matching C's
    // pick_chars derivation immediately before the prompt starts.
    state.commandBindings ??= createCommandBindingModel(state);
    // C keeps one lazily allocated coordinate array and index per GLOC family
    // for the duration of this getpos() invocation.
    const garr = Array(NUM_GLOCS).fill(null);
    const gidx = Array(NUM_GLOCS).fill(0);

    if (state.flags.verbose)
        await ttyPline("(For instructions type a '?')", state);

    state.gg ??= {};
    state.gg.getposx = cx;
    state.gg.getposy = cy;
    const forcedMapCursor = await forceGetposSelectionRedraw(state);
    cursorAt(cx, cy, state);
    await flush_screen(0);
    if (forcedMapCursor) {
        // tty_print_glyph() leaves the map window one character past the
        // glyph it just printed.  Route that advance through tty_curs() so
        // offx/offy, clipping, and both tty cursor records stay source-shaped.
        cursorAt(forcedMapCursor.x + 1, forcedMapCursor.y, state);
    }

    let result = LOOK_TRADITIONAL;
    try {
        for (;;) {
            if (showGoalMessage) {
                await ttyPline(`Move cursor to ${target}:`, state);
                cursorAt(cx, cy, state);
                await flush_screen(0);
                showGoalMessage = false;
            } else if (state.iflags?.autodescribe && !messageGiven) {
                // C getpos.c checks msg_given at the top of the loop, before
                // reading the next key.  In particular, an ignored key while
                // force=true leaves the cursor in place and lets this pass
                // describe that starting square before the next input.
                await auto_describe(cx, cy, state);
            }

            const key = (await nhgetch(state)) & 0xFF;
            if (state.iflags?.autodescribe)
                messageGiven = false;

            if (key === 0x1B) {
                ccp.x = ccp.y = -10;
                messageGiven = true;
                result = -1;
                break;
            }
            const pickResult = pickResultForKey(key, state);
            if (pickResult !== null) {
                ccp.x = cx;
                ccp.y = cy;
                result = pickResult;
                break;
            }
            let moved = null;
            if (movecmd(key, MV_WALK, state)) {
                moved = truncate_to_map(cx, cy, state.u.dx, state.u.dy);
            } else if (movecmd(key, MV_RUSH, state)
                || movecmd(key, MV_RUN, state)) {
                // The default getloc_moveskip is false, so getpos.c moves
                // exactly eight cells in the selected run direction.
                moved = truncate_to_map(
                    cx, cy, 8 * state.u.dx, 8 * state.u.dy,
                );
            }
            if (moved) {
                cx = moved.x;
                cy = moved.y;
                state.gg.getposx = cx;
                state.gg.getposy = cy;
                clearTtyMessageWindow(state);
                messageGiven = false;
                continue;
            }
            // C ref: getpos.c getpos() help/redraw branch (945-954). A help
            // window is dismissed before getpos_refresh() repaints the map;
            // both paths then restore the targeting prompt and cursor.
            const helpKey = state.commandBindings.specialKeys?.['getpos.help'];
            if (key === helpKey || redraw_cmd(key, state)) {
                if (key === helpKey)
                    await getpos_help(force, target, state);
                await getpos_refresh(state);
                state.gg.getposx = cx;
                state.gg.getposy = cy;
                cursorAt(cx, cy, state);
                showGoalMessage = true;
                await flush_screen(0);
                continue;
            }
            const hiliteKey = state.commandBindings.specialKeys?.['getpos.valid'];
            // C ref: getpos.c getpos(), NHKF_GETPOS_SHOWVALID branch. The
            // key always keeps targeting and restores the goal prompt; the
            // callback only controls the optional valid-square highlights.
            if (key === hiliteKey) {
                if (state.getpos_hilitefunc) {
                    if (hiliteState === 1) {
                        await state.getpos_hilitefunc(false, state);
                        hiliteState = 0;
                    } else if (!state.iflags?.bgcolors) {
                        hiliteState = 1;
                        await state.getpos_hilitefunc(true, state);
                    } else {
                        hiliteState = 0;
                    }
                }
                showGoalMessage = true;
                messageGiven = true;
                state.gg.getposx = cx;
                state.gg.getposy = cy;
                cursorAt(cx, cy, state);
                continue;
            }
            if (key === '#') {
                state.iflags.autodescribe = !state.iflags.autodescribe;
                await ttyPline(
                    `Automatic description is ${state.iflags.autodescribe
                        ? 'on' : 'off'}.`,
                    state,
                );
                if (!state.iflags.autodescribe)
                    showGoalMessage = true;
                messageGiven = true;
                state.gg.getposx = cx;
                state.gg.getposy = cy;
                cursorAt(cx, cy, state);
                continue;
            }
            const cycle = locationCycleForKey(key, state);
            if (cycle) {
                if (state.iflags?.getloc_usemenu) {
                    const menuPoint = { x: cx, y: cy };
                    if (await getpos_menu(menuPoint, cycle.gloc, state)) {
                        cx = menuPoint.x;
                        cy = menuPoint.y;
                        messageGiven = false;
                    }
                    state.gg.getposx = cx;
                    state.gg.getposy = cy;
                    cursorAt(cx, cy, state);
                    await flush_screen(0);
                    continue;
                }
                if (!garr[cycle.gloc]) {
                    garr[cycle.gloc] = await gather_locs(cycle.gloc, state);
                    gidx[cycle.gloc] = 0;
                }
                const locations = garr[cycle.gloc];
                if (locations.length) {
                    if (cycle.reverse) {
                        gidx[cycle.gloc] = (gidx[cycle.gloc] - 1
                            + locations.length) % locations.length;
                    } else {
                        gidx[cycle.gloc] = (gidx[cycle.gloc] + 1)
                            % locations.length;
                    }
                    ({ x: cx, y: cy } = locations[gidx[cycle.gloc]]);
                    state.gg.getposx = cx;
                    state.gg.getposy = cy;
                    cursorAt(cx, cy, state);
                    await flush_screen(0);
                }
                continue;
            }
            // C ref: getpos.c:1039-1116. A non-quitchar can select the next
            // map square whose current, remembered, or seen terrain glyph
            // carries the requested feature symbol. A matching symbol with
            // no visible square receives a feature-specific diagnostic;
            // symbols with no matching terrain fall through to direction
            // handling below.
            if (!quitchars.includes(String.fromCharCode(key))) {
                const feature = findTerrainFeature(key, cx, cy, state);
                if (feature?.found) {
                    cx = feature.x;
                    cy = feature.y;
                    if (messageGiven) clearTtyMessageWindow(state);
                    messageGiven = false;
                    state.gg.getposx = cx;
                    state.gg.getposy = cy;
                    cursorAt(cx, cy, state);
                    await flush_screen(0);
                    continue;
                }
                if (feature?.matching) {
                    await ttyPline(
                        `Can't find dungeon feature '${String.fromCharCode(key)}'.`,
                        state,
                    );
                    messageGiven = true;
                    state.gg.getposx = cx;
                    state.gg.getposy = cy;
                    cursorAt(cx, cy, state);
                    await flush_screen(0);
                    continue;
                }
            }
            // C ref: getpos.c:1126-1141. Force mode prints a diagnostic for
            // an unrecognized non-quitchar, then reaches nxtc and keeps
            // targeting. Preserve the existing non-force exit flow below.
            if (force) {
                if (!quitchars.includes(String.fromCharCode(key))) {
                    await ttyPline(
                        `Unknown direction: '${visctrl(String.fromCharCode(key))}' `
                        + `(${unknownDirectionNote(state)}).`,
                        state,
                    );
                    messageGiven = true;
                }
                state.gg.getposx = cx;
                state.gg.getposy = cy;
                cursorAt(cx, cy, state);
                // C's nxtc label flushes the newly printed diagnostic before
                // the next getpos input boundary captures the screen.
                await flush_screen(0);
                continue;
            }
            if (key === 0x20 || key === 0x0D || key === 0x0A) {
                await ttyPline('Done.', state);
                messageGiven = false;
                ccp.x = -1;
                ccp.y = 0;
                result = LOOK_TRADITIONAL;
                break;
            }
            await ttyPline(
                `Unknown direction: '${visctrl(String.fromCharCode(key))}' `
                + '(aborted).',
                state,
            );
            messageGiven = true;
            state.gg.getposx = cx;
            state.gg.getposy = cy;
            cursorAt(cx, cy, state);
        }
    } finally {
        if (hiliteState === 1 && state.getpos_hilitefunc)
            await state.getpos_hilitefunc(false, state);
        if (messageGiven)
            clearTtyMessageWindow(state);
        state.gg.getposx = 0;
        state.gg.getposy = 0;
        state.u.dx = savedDirection.dx;
        state.u.dy = savedDirection.dy;
        state.u.dz = savedDirection.dz;
    }
    return result;
}
