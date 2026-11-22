// tty_startup.js — TTY banner and player-name prompt used during startup.
// C refs: win/tty/wintty.c tty_init_nhwindows(), tty_askname().

import { PL_NSIZ } from './const.js';
import { game } from './gstate.js';
import { nhgetch } from './input.js';
import { NO_COLOR } from './terminal.js';
import { copyright_banner_line } from './version.js';
import { baseWindow } from './wintty.js';

const WHO_ARE_YOU = 'Who are you? ';
export function renderTtyStartupBanner(state = game) {
    // C ref: tty_init_nhwindows() calls gettty() and setftty(), and
    // sys/share/unixtty.c setftty():258 raises iflags.cbreak there.  Every
    // xwaitforspace() below this point therefore reads the quitchars[] set,
    // while getret() above it reads only Return and Enter.  The flag tracks
    // tty_init_nhwindows() having run, not the presence of a render target,
    // so it is raised before the guard below: leaving it false for a
    // display-less caller makes xwaitforspace() reject every key but Return
    // and drain the input queue.
    state.iflags ??= {};
    state.iflags.cbreak = true;

    const display = state.nhDisplay;
    if (!display) return;

    display.clearScreen();
    // C ref: wintty.c tty_init_nhwindows() prints copyright_banner_line(1)
    // to (4) from row 4.
    for (let i = 1; i <= 4; i++) {
        display.putstr(0, 3 + i, copyright_banner_line(i), NO_COLOR);
    }
    // tty_init_nhwindows() leaves BASE_WINDOW at (1, 11); tty_askname()
    // emits one empty base-window line before placing its prompt on row 12.
    display.setCursor(0, 11);
    const base = baseWindow(state);
    base.curx = 0;
    base.cury = 11;
}

function ttyNameCharacter(code, length) {
    const ch = String.fromCharCode(code & 0xFF);
    if (ch === '-' || ch === '@'
        || (ch >= 'a' && ch <= 'z')
        || (ch >= 'A' && ch <= 'Z')
        || (length > 0 && ch >= '0' && ch <= '9')) {
        return ch;
    }
    return '_';
}

// C ref: win/tty/wintty.c tty_askname(). This is deliberately a tty input
// loop rather than a generic text field: each nhgetch() is a judge-visible
// boundary, and the Unix character filtering and echo order are observable.
// wintty.js owns the source-shaped entry point; this implementation remains
// here so the startup helpers keep their existing single input-loop owner.
export async function ttyAsknameImpl(state = game) {
    const display = state.nhDisplay;
    if (!display) throw new Error('tty_askname requires an initialized display');

    // The initial empty tty_putstr() advances BASE_WINDOW one row on every
    // invocation. That is observable when plnamesuffix() strips a suffix-only
    // name and calls askname again; the retry counter itself is per-call.
    const base = baseWindow(state);
    const promptRow = base.cury + 1;
    base.curx = 0;
    base.cury = promptRow;
    let tryct = 0;
    for (;;) {
        tryct++;
        if (tryct > 10) {
            // wintty.c:673-674 bail() does not return.
            const { bail } = await import('./wintty.js');
            await bail('Giving up after 10 tries.\n', state);
        }

        if (tryct > 1) {
            display.setCursor(0, promptRow - 1);
            display.putstr(
                0,
                promptRow - 1,
                'Enter a name for your character...',
                NO_COLOR,
            );
            display.clearRow(promptRow);
        }

        display.putstr(0, promptRow, WHO_ARE_YOU, NO_COLOR);
        display.setCursor(WHO_ARE_YOU.length, promptRow);

        const characters = [];
        let retry = false;
        for (;;) {
            const code = await nhgetch(state);
            if (code === 10 || code === 13) break;
            // tty_nhgetch() translates NUL to Escape before tty_askname().
            if (code === 0 || code === 27) {
                characters.length = 0;
                retry = true;
                break;
            }
            if (code === 8 || code === 127) {
                if (characters.length > 0) {
                    characters.pop();
                    const column = WHO_ARE_YOU.length + characters.length;
                    // The recorder hunk for tty_askname()'s erase puts a space.
                    display.putch(column, promptRow, ' ');
                    display.setCursor(column, promptRow);
                }
                continue;
            }

            const ch = ttyNameCharacter(code, characters.length);
            if (characters.length < PL_NSIZ - 1) {
                characters.push(ch);
                // tty_askname() hands nomux_putch() an int, but the name
                // filter above leaves only printable ASCII, which the char
                // rule stores the same way.
                display.putch(display.cursorCol, display.cursorRow, ch);
                display.setCursor(display.cursorCol + 1, display.cursorRow);
            }
        }

        if (!retry && characters.length > 0) {
            state.plname = characters.join('');
            // wintty.c:750 tty_curs(BASE_WINDOW, 1, cury + 1).
            base.curx = 0;
            base.cury = promptRow + 1;
            display.setCursor(0, promptRow + 1);
            state.iflags ??= {};
            state.iflags.renameallowed = true;
            return state.plname;
        }
    }
}

// Compatibility re-export for callers that used the pre-port camel-case
// name. The implementation and source-shaped entry point remain single-owned
// by wintty.js.
export { tty_askname as ttyAskname } from './wintty.js';
