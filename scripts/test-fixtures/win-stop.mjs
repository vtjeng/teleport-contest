// Test access to the message window's WIN_STOP bit, which wintty.h keeps in
// wins[WIN_MESSAGE]->flags and js/tty_message.js messageWindow() returns.
import { WIN_STOP } from '../../js/const.js';
import { messageWindow } from '../../js/tty_message.js';

// Whether Escape at an earlier --More-- has left later messages suppressed.
export function winStop(state) {
    return Boolean(messageWindow(state)?.flags & WIN_STOP);
}

// Set or clear WIN_STOP. Setting it needs a message window, as in C, where
// only more() sets the bit; clearing it without one changes nothing.
export function setWinStop(state, stopped) {
    const cw = messageWindow(state);
    if (stopped) {
        if (!cw) throw new Error('WIN_STOP needs a message window');
        cw.flags |= WIN_STOP;
    } else if (cw) {
        cw.flags &= ~WIN_STOP;
    }
}
