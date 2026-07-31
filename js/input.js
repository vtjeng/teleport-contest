// input.js — Keystroke input handling.

import { KEY_ESC } from './const.js';
import { game } from './gstate.js';
import { KEY_BINDINGS } from './terminal.js';

// C ref: tty_nhgetch — read one key.
// In replay mode, reads from the input queue.
// In browser mode, waits for a real keypress.
export async function nhgetch(state = game) {
    // Fire the capture hook before reading the next key
    const hook = state._preNhgetchHook;
    if (hook) await hook();

    // C ref: win/tty/wintty.c tty_nhgetch().  The recorder marker is
    // emitted before WIN_STOP is cleared, then every actual key wait makes
    // later messages visible again.  Keep this after the capture hook so an
    // Escape-dismissed More boundary suppresses messages through precisely
    // the next recorded input boundary.
    state._ttyMessageStopped = false;

    // Replay and browser input share the display-owned queue.
    const display = state?.nhDisplay;
    if (display?.readKey) {
        const key = await display.readKey({ bindings: KEY_BINDINGS.VI_KEYS });
        // C ref: win/tty/wintty.c tty_nhgetch():4093-4098. The window port,
        // not its callers, maps NUL to ESC "since nethack doesn't expect
        // NUL", so every reader above it -- readchar(), tty_yn_function(),
        // the '#' prompt reader -- sees the substituted ESC. Without it
        // getdir() reads a raw 0, which quitchars[] does not hold, and
        // refuses a keystroke C cancels on.
        //
        // The EOF arm beside it, which also substitutes ESC and sets
        // iflags.term_gone, has nothing to fire on: readKey() resolves with a
        // key code or waits, and represents no end of input.
        return key === 0 ? KEY_ESC : key;
    }

    throw new Error('Input queue empty - test may be missing keystrokes');
}
