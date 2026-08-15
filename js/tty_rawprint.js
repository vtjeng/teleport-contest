// tty_rawprint.js -- Terminal output written before the window system starts,
// and the keypress that dismisses it.
// C refs: win/tty/wintty.c tty_raw_print(), tty_wait_synch() and getret();
// recorder patch 006's nomux_enter_raw_mode(), nomux_raw_putch(),
// nomux_raw_emit() and nomux_get_cursor().

import { game } from './gstate.js';
import { encodeUtf8ByteString } from './hacklib.js';
import { NO_COLOR } from './terminal.js';
import { xwaitforspace } from './tty_message.js';

// C ref: recorder patch 006 nomux_raw_putch().  Bytes below space are dropped
// except the newline that moves to column zero of the next row, and a byte
// past the last row or column advances the column without being stored.
function nomux_raw_putch(display, byte) {
    const raw = display.nomuxRaw;
    if (byte === 0x0A) {
        raw.row += 1;
        raw.col = 0;
        return;
    }
    if (byte < 32) return;
    // nomux_fg_cur is 7 and nomux_attr_cur is 0 until a term_start_color() or
    // term_start_attr() runs, and none has by this point in startup.
    // nomux_capture_screen() writes no SGR sequence for foreground 7, so the
    // cell arrives with the terminal's default colour rather than with grey;
    // NO_COLOR is how js/terminal.js serializes the same absence.  The bounds
    // test nomux_raw_putch() applies before storing is setCell()'s own, so a
    // byte past the last row or column is dropped there and the column still
    // advances.
    display.setCell(raw.col, raw.row, String.fromCharCode(byte), NO_COLOR, 0);
    raw.col += 1;
}

// C ref: win/tty/wintty.c tty_raw_print(), whose puts() the recorder mirrors
// through nomux_raw_emit().  ttyDisplay does not exist before
// tty_init_nhwindows(), so the first call enters raw mode: patch 006's
// nomux_enter_raw_mode() clears the shadow screen and starts its own cursor at
// the top left, because exit_nhwindows()/settty() leave the visible terminal
// on a blank main screen in the endgame case this shares.
export function tty_raw_print(state, str) {
    const display = state?.nhDisplay;
    if (!display) return;

    const raw = display.nomuxRaw;
    if (!raw.active) {
        raw.active = true;
        raw.row = 0;
        raw.col = 0;
        display.clearScreen();
    }
    for (const byte of encodeUtf8ByteString(String(str)))
        nomux_raw_putch(display, byte);
    // puts() appends the newline tty_raw_print() does not write itself.
    nomux_raw_putch(display, 0x0A);
}

// C ref: recorder patch 006 nomux_get_cursor(), which the capture writes at
// every input boundary.  Nothing clears nomux_raw_active, so once raw output
// has been written the recorded cursor is this one for the rest of the
// process even though the shadow screen keeps being repainted normally.
export function nomux_get_cursor(display) {
    const raw = display?.nomuxRaw;
    if (raw?.active) return [raw.col, raw.row];
    return [display?.cursorCol ?? 0, display?.cursorRow ?? 0];
}

// C ref: win/tty/wintty.c getret() (763-781), the UNIX arm.  Its prompt goes
// out through xputs(), which patch 006 does not mirror -- only tty_raw_print()
// and tty_raw_print_bold() reach the shadow screen -- so the prompt is
// invisible to a recording and the wait itself is the whole observable effect.
// iflags.raw_printed, cleared on the way out, has no reader in this port.
async function getret(state) {
    await xwaitforspace(state, ' ');
}

// C ref: win/tty/wintty.c tty_wait_synch() (3623-3647).  This port covers the
// getret() arm, which is the one taken while WIN_MAP is still WIN_ERR; the
// other arm redisplays the map window and cannot be reached before
// tty_init_nhwindows() creates it.
export async function tty_wait_synch(state = game) {
    await getret(state);
}
