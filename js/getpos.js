// getpos.c -- Ordinary farlook cursor selection.
// C refs: getpos.c auto_describe(), truncate_to_map(), and getpos(), covering
// default ordinary and fast movement, the traditional pick, and Escape.

import {
    MAXTCHARS,
    COLNO,
    GPCOORDS_NONE,
    MV_RUN,
    MV_RUSH,
    MV_WALK,
    LOOK_ONCE,
    LOOK_QUICK,
    LOOK_TRADITIONAL,
    LOOK_VERBOSE,
    ROWNO,
    TIP_GETPOS,
    VIBRATING_SQUARE,
    quitchars,
} from './const.js';
import {
    createCommandBindingModel,
    keyForCommand,
} from './command_bindings.js';
import { movecmd } from './cmd.js';
import {
    back_to_glyph,
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
import { Invocation_lev } from './dungeon.js';

export {
    LOOK_ONCE,
    LOOK_QUICK,
    LOOK_TRADITIONAL,
    LOOK_VERBOSE,
};

export class UnsupportedGetposError extends Error {
    constructor(reason) {
        super(`unsupported getpos: ${reason}`);
        this.name = 'UnsupportedGetposError';
        this.reason = reason;
    }
}

function cursorAt(x, y, state) {
    // WIN_MAP uses level coordinates. The TTY window begins below the message
    // row and map column one is terminal column zero.
    state.nhDisplay?.setCursor(x - 1, y + 1);
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
            await ttyPline(
                description.firstmatch
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
    if (state.iflags?.remember_getpos
        || state.iflags?.getloc_moveskip
        || state.iflags?.autodescribe === false
        || (state.iflags?.getpos_coords
            && state.iflags.getpos_coords !== GPCOORDS_NONE)) {
        throw new UnsupportedGetposError('non-default location settings');
    }

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
