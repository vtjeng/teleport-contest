// windowsUp(state) puts a test's game state where C is once allmain.c
// init_sound_disp_gamewindows() has returned: WIN_MESSAGE exists, it has had
// its first display, and iflags.window_inited is TRUE. A fixture that only
// sets the flag describes a state C never reaches, in which pline() goes to
// a message window that getlin, the yes/no prompt and ^P then find missing.
//
// This is the only place under scripts/ that may write a true
// iflags.window_inited; scripts/window-inited.test.mjs enforces that, and
// checks that the state made here equals the one js/jsmain.js makes with
// tty_create_nhwindow(NHW_MESSAGE) and displayPendingTtyMessageWindow().
// The helper is synchronous, unlike that display, so that a fixture builder
// need not become async to use it.
import { NHW_MESSAGE } from '../../js/const.js';
import { GameDisplay } from '../../js/game_display.js';
import { messageWindow } from '../../js/tty_message.js';
import { tty_create_nhwindow } from '../../js/wintty.js';

// Returns `state`, so a fixture can wrap the literal that builds it. Call it
// once the fixture's final iflags object is in place: a later
// `state.iflags = {...}` drops the flag. A message window the fixture has
// already created is kept.
export function windowsUp(state) {
    state.iflags ??= {};
    // C's iflags starts zeroed (js/flag.js zero_instance_flags()), and
    // tty_create_nhwindow() raises a zero msg_history to 20 (wintty.c:889).
    // A fixture that builds iflags by hand has no msg_history at all.
    state.iflags.msg_history ??= 0;
    if (!messageWindow(state)) {
        // tty_create_nhwindow() reads the terminal size for every window
        // type, though NHW_MESSAGE does not use it. A fixture with no
        // terminal borrows one for the call only, so that its messages still
        // take the paths a state without nhDisplay takes.
        state.wintty ??= {};
        tty_create_nhwindow(NHW_MESSAGE, state.nhDisplay ? state
            : Object.create(state, { nhDisplay: { value: new GameDisplay(null) } }));
    }
    // wintty.c:1882-1883 and 1949, tty_display_nhwindow(WIN_MESSAGE)'s first
    // call: the inactive window raises the flag, and every display leaves the
    // window active.
    messageWindow(state).active = true;
    state.iflags.window_inited = true;
    return state;
}
