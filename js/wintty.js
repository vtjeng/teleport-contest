// wintty.js -- The live tty window initialization used by startup.
// C ref: win/tty/wintty.c tty_create_nhwindow().

import { MAX_MSG_HISTORY, NHW_MESSAGE } from './const.js';
import { game } from './gstate.js';

// This ports tty_create_nhwindow()'s NHW_MESSAGE history-size normalization.
// The WinDesc allocation and its message rows are outside this slice; the
// running game calls this at the same lifecycle point to apply the side effect
// on iflags.msg_history before player selection.
export function tty_create_nhwindow(type, state = game) {
    if (type !== NHW_MESSAGE) {
        throw new Error(
            'tty_create_nhwindow() only ports the NHW_MESSAGE startup branch',
        );
    }
    if (state.iflags.msg_history < 20) state.iflags.msg_history = 20;
    else if (state.iflags.msg_history > MAX_MSG_HISTORY) {
        state.iflags.msg_history = MAX_MSG_HISTORY;
    }
}
