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

// wintty.c:298-322. The recorder build leaves TTY_TILES_ESCCODES undefined,
// so the source's print_vt_code macro expands to an empty statement. Keep the
// source function name available for source-shaped callers without writing
// escape sequences to the terminal or changing game state.
export function print_vt_code(_i, _c, _d, _state = game) {
    // The compiled C macro has no output and no state effect.
}

// wintty.c:324-339. USER_SOUNDS and TTY_SOUND_ESCCODES are both disabled in
// the recorder build, so print_vt_soundcode_idx likewise expands to nothing.
export function print_vt_soundcode_idx(_idx, _v, _state = game) {
    // The compiled C macro has no output and no state effect.
}
