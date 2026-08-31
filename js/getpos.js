// getpos.c -- Ordinary farlook cursor selection.
// C refs: getpos.c auto_describe(), truncate_to_map(), and getpos(), covering
// default ordinary and fast movement, the traditional pick, and Escape.

import {
    COLNO,
    GPCOORDS_NONE,
    MV_RUN,
    MV_RUSH,
    MV_WALK,
    ROWNO,
    TIP_GETPOS,
} from './const.js';
import { movecmd } from './cmd.js';
import { flush_screen } from './display.js';
import { game } from './gstate.js';
import { handle_tip } from './hack.js';
import { nhgetch } from './input.js';
import { do_screen_description } from './pager.js';
import { clearTtyMessageWindow, ttyPline } from './tty_message.js';

export const LOOK_TRADITIONAL = 0;

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
    try {
        const description = do_screen_description(
            { x: cx, y: cy }, true, 0, state,
        );
        if (description.found)
            await ttyPline(description.firstmatch, state);
    } catch (e) {
        if (e.name !== 'UnsupportedWhatisError') throw e;
    }
    await flush_screen(0);
    cursorAt(cx, cy, state);
}

export async function getpos(ccp, force, goal, state = game) {
    // C ref: force=TRUE keeps the loop running on unrecognized keys
    // instead of exiting. For valid session input the behavior is identical.
    if (state.iflags?.remember_getpos
        || state.iflags?.terrainmode
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
            }

            const key = (await nhgetch(state)) & 0xFF;
            if (key === 0x1B) {
                ccp.x = ccp.y = -10;
                result = -1;
                break;
            }
            if (key === '.'.charCodeAt(0)) {
                ccp.x = cx;
                ccp.y = cy;
                result = LOOK_TRADITIONAL;
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
                await auto_describe(cx, cy, state);
                continue;
            }
            // C ref: getpos.c:1039-1141. Unrecognized keys that are
            // quitchars (" \r\n") exit when force is false; all other
            // unrecognized keys print an error. In both cases force=true
            // falls through to `goto nxtc`, ignoring the key.
            if (force) continue;
            if (key === 0x20 || key === 0x0D || key === 0x0A) {
                ccp.x = -1;
                ccp.y = 0;
                result = LOOK_TRADITIONAL;
                break;
            }
            throw new UnsupportedGetposError(
                `key ${JSON.stringify(String.fromCharCode(key))}`,
            );
        }
    } finally {
        clearTtyMessageWindow(state);
        state.gg.getposx = 0;
        state.gg.getposy = 0;
        state.u.dx = savedDirection.dx;
        state.u.dy = savedDirection.dy;
        state.u.dz = savedDirection.dz;
        cursorAt(state.u.ux, state.u.uy, state);
    }
    return result;
}
