// getpos.c -- Ordinary farlook cursor selection.
// C ref: getpos.c getpos() (771-1167), restricted to the traditional pick
// and Escape paths used by the current whatis slice.

import { TIP_GETPOS } from './const.js';
import { flush_screen } from './display.js';
import { game } from './gstate.js';
import { handle_tip } from './hack.js';
import { nhgetch } from './input.js';
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

export async function getpos(ccp, force, goal, state = game) {
    if (force)
        throw new UnsupportedGetposError('a forced or quick location pick');
    if (state.iflags?.remember_getpos
        || state.iflags?.terrainmode) {
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
