// input.js — Keystroke input handling.

import { KEY_ESC, WIN_STOP } from './const.js';
import { game } from './gstate.js';
import {
    checkQueuedOutput, isTerminated, neverSettles, recordTerminationViolation,
} from './rng.js';
import {
    messageWindow,
    TOPLINE_NEED_MORE,
    TOPLINE_NON_EMPTY,
} from './tty_message.js';
import { KEY_BINDINGS } from './terminal.js';

// C ref: tty_nhgetch — read one key.
// In replay mode, reads from the input queue.
// In browser mode, waits for a real keypress.
// C ref: wintty.c tty_nh_poskey(), the key read.
export async function nhgetch(state = game) {
    // After nh_terminate() no key is read and no boundary is captured: a
    // capture would duplicate the final screen and shift every later
    // segment's screens. Only a chain some caller discarded can get here; it
    // stops for good (js/rng.js, "Segment termination").
    if (isTerminated()) {
        recordTerminationViolation('nhgetch',
            'nhgetch() called after the segment terminated');
        await neverSettles();
    }
    // C ref: windows.c hup_nhgetch() and hup_nh_poskey(). After a hangup
    // the window procedures answer ESC without reading a key, so the
    // recorder's tty_nhgetch() input boundary does not happen either.
    if (state?.nhDisplay?.windowprocsHup) return KEY_ESC;
    // C has printed every line it raised before it reads a key (js/rng.js,
    // "Queued output").
    if (state === game) checkQueuedOutput('key', 'a key read');
    // Fire the capture hook before reading the next key
    const hook = state._preNhgetchHook;
    if (hook) await hook();

    // C ref: win/tty/wintty.c tty_nhgetch():4065-4066.  The recorder marker
    // is emitted before C clears the message window's WIN_STOP, so every
    // actual key wait makes later messages visible again. Keep this after
    // the capture hook so an Escape-dismissed More boundary suppresses
    // messages through precisely the next recorded input boundary. Like C,
    // skip it when the message window does not exist yet.
    const messageWin = messageWindow(state);
    if (messageWin) messageWin.flags &= ~WIN_STOP;

    // C's tty_nhgetch() services a pending SIGWINCH here. Neither the
    // recorder's fixed pty nor the 80x24 browser terminal is ever resized,
    // so the port has no resize_tty().

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
        // C ref: wintty.c:4099-4101. The user pressed a key, so they saw the
        // topline; demote NEED_MORE to NON_EMPTY so later plines do not
        // re-prompt for a message already acknowledged.
        if (display.toplin === TOPLINE_NEED_MORE)
            display.toplin = TOPLINE_NON_EMPTY;
        return key === 0 ? KEY_ESC : key;
    }

    throw new Error('Input queue empty - test may be missing keystrokes');
}
