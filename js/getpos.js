// getpos.c -- Ordinary farlook cursor selection.
// C refs: getpos.c auto_describe(), truncate_to_map(), and getpos(), covering
// default ordinary and fast movement, the traditional pick, and Escape.

import {
    MAXTCHARS,
    COLNO,
    GFILTER_NONE,
    GLOC_DOOR,
    GLOC_EXPLORE,
    GLOC_INTERESTING,
    GLOC_MONS,
    GLOC_OBJS,
    MV_RUN,
    MV_RUSH,
    MV_WALK,
    NHW_MAP,
    LOOK_ONCE,
    LOOK_QUICK,
    LOOK_TRADITIONAL,
    LOOK_VERBOSE,
    ROWNO,
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
import { movecmd, redraw_cmd } from './cmd.js';
import {
    back_to_glyph,
    docrt,
    flush_screen,
    glyph_at,
    glyph_is_cmap,
    glyph_to_cmap,
} from './display.js';
import { game } from './gstate.js';
import { handle_tip, is_valid_travelpt } from './hack.js';
import { visctrl } from './hacklib.js';
import { nhgetch } from './input.js';
import { do_screen_description } from './pager.js';
import {
    cmap_symbol_byte,
    MAXPCHARS,
    S_arrow_trap,
    S_corr,
    S_darkroom,
    S_engrcorr,
    S_engroom,
    S_hcdoor,
    S_litcorr,
    S_ndoor,
    S_room,
    S_stone,
    S_trwall,
    S_vodoor,
} from './symbols.js';
import { DEFAULT_PRIMARY_SYMBOLS, SYM_OFF_P } from './symbol_data.js';
import { clearTtyMessageWindow, ttyPline } from './tty_message.js';
import { displayTtyMenuTextWindow } from './tty_menu.js';
import { Invocation_lev } from './dungeon.js';
import { tty_create_nhwindow, tty_curs } from './wintty.js';

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
    await flush_screen(0);
    cursorAt(cx, cy, state);
}

// C ref: getpos.c known_vibrating_square_at() (422-431). A genuine
// vibrating square is discoverable by '~' only at the invocation position;
// this excludes wizard-created fake vibrating traps that cannot occur in a
// normal invocation-level map.
function known_vibrating_square_at(x, y, state) {
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

    if (state.flags.verbose)
        await ttyPline("(For instructions type a '?')", state);

    state.gg ??= {};
    state.gg.getposx = cx;
    state.gg.getposy = cy;
    await flush_screen(0);
    cursorAt(cx, cy, state);

    let result = LOOK_TRADITIONAL;
    try {
        for (;;) {
            if (showGoalMessage) {
                await ttyPline(`Move cursor to ${target}:`, state);
                await flush_screen(0);
                cursorAt(cx, cy, state);
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
            if (state.getpos_hilitefunc && key === hiliteKey) {
                if (hiliteState === 1) {
                    await state.getpos_hilitefunc(false, state);
                    hiliteState = 0;
                } else if (!state.iflags?.bgcolors) {
                    hiliteState = 1;
                    await state.getpos_hilitefunc(true, state);
                } else {
                    hiliteState = 0;
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
