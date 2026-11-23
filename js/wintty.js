// wintty.js -- The live tty window and cursor state used by startup and play.
// C refs: win/tty/wintty.c tty_create_nhwindow(), tty_curs().

import {
    COLNO,
    MAXWIN,
    MAX_MSG_HISTORY,
    NHW_BASE,
    NHW_MAP,
    NHW_MESSAGE,
    NHW_MENU,
    NHW_STATUS,
    NHW_TEXT,
    ROWNO,
    WIN_ERR,
} from './const.js';
import { redraw_map, status_initialize } from './display.js';
import { nh_terminate } from './end.js';
import { game } from './gstate.js';
import {
    displayPendingTtyMessageWindow,
    eraseTtyMessageWindow,
    TOPLINE_EMPTY,
    TOPLINE_NEED_MORE,
} from './tty_message.js';
import {
    renderTtyStartupBanner,
    ttyAsknameImpl,
} from './tty_startup.js';
import { NO_COLOR } from './terminal.js';
import { note_unported } from './unported.js';
import { tty_raw_print } from './tty_rawprint.js';

const MAX_STATUS_ROWS = 3;

function statusRows(state) {
    return (state.iflags?.wc2_statuslines ?? 0) <= 2
        ? 2 : MAX_STATUS_ROWS;
}

function startupState(argcp, argv, state) {
    // The C entry point receives argc/argv pointers.  Direct JS callers pass
    // the state as the first argument, so accept that shape without changing
    // the source-shaped three-argument call used by jsmain.js.
    if (state === game && argcp && typeof argcp === 'object'
        && !Array.isArray(argcp) && argv == null) {
        return argcp;
    }
    return state;
}

// C ref: win/tty/termcap.c term_startup(). The GameDisplay already owns the
// terminal dimensions, which C returns through the wid and hgt pointers and
// tty_init_nhwindows() copies into ttyDisplay->cols and rows, so nothing is
// returned.
export function term_startup(state = game) {
    const { cols: wid, rows: hgt } = state.nhDisplay;
    // termcap.c:318 init_hilite() stores tgetnum("Co") (termcap.c:944); the
    // recorder's TERM is xterm-256color, whose Co is 256. The escape strings
    // it builds are the GameDisplay's colours.
    state.iflags.colorcount = 256;
    // termcap.c tty_startup() (CLIPPING).
    if (wid < COLNO || hgt < ROWNO + 3) setclipped(state);
}

// C ref: win/tty/wintty.c tty_create_nhwindow() (850-957). Each arm sets
// offx, offy, rows, cols, maxrow and maxcol as its C arm does.
export function tty_create_nhwindow(type, state = game) {
    const wt = winttyState(state);
    const { rows, cols } = state.nhDisplay;
    wt.wins ??= [];
    let id = wt.wins.findIndex((window) => window == null);
    if (id < 0) id = wt.wins.length;
    if (id >= MAXWIN) {
        throw new Error('No window slots!');
    }

    const window = {
        type,
        flags: 0,
        active: false,
        curx: 0,
        cury: 0,
        offx: 0,
        offy: 0,
        rows: 0,
        cols: 0,
        maxrow: 0,
        maxcol: 0,
        data: null,
        datlen: null,
    };
    if (type === NHW_BASE) {
        window.rows = rows;
        window.cols = cols;
        window.maxrow = 0;
    } else if (type === NHW_MESSAGE) {
        const history = state.iflags?.msg_history;
        state.iflags ??= {};
        state.iflags.msg_history = Math.min(
            MAX_MSG_HISTORY,
            Math.max(20, history),
        );
        window.rows = state.iflags.msg_history;
        // wintty.c allocates rows slots, then uses maxrow as the next history
        // slot (zero for an empty ring).
        window.maxrow = 0;
        // "1 line long, very wide": C sets maxcol and cols to 0. Its only
        // reader of this window's cols is tty_curs()'s DEBUG bounds check,
        // which complains about every window type except NHW_MESSAGE.
        window.cols = window.maxcol = 0;
        window.data = Array(window.rows).fill(null);
        window.datlen = Array(window.rows).fill(0);
        wt.messageWindow = id;
    } else if (type === NHW_MAP) {
        // wintty.c:914-924.  The map is unbuffered; display.js owns its
        // glyph grid, while this descriptor retains the source coordinates.
        window.offy = 1;
        window.rows = ROWNO;
        window.cols = COLNO;
    } else if (type === NHW_MENU || type === NHW_TEXT) {
        window.rows = 0;
        window.cols = cols;
        window.offx = 0;
        window.offy = 0;
    } else if (type === NHW_STATUS) {
        throw new Error(
            'tty_create_nhwindow() only ports the NHW_MESSAGE and NHW_MAP startup branches',
        );
    } else {
        throw new Error(`Tried to create window type ${type}\n`);
    }
    wt.wins[id] = window;
    return id;
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

// state.wintty holds the tty port's window state: wintty.c's window table
// wins[], its BASE_WINDOW id and its CLIPPING variables clipping, clipx, clipy,
// clipxmax and clipymax, and decl.c's WIN_MAP and WIN_MESSAGE ids
// (messageWindow).  The JavaScript runner creates a fresh game object
// for each segment, as a new C process starts with fresh globals.
//
// C's struct DisplayDesc *ttyDisplay (wintty.h) is state.nhDisplay, the
// GameDisplay: rows and cols are its terminal size, curx and cury its
// cursorCol and cursorRow, and toplin, inmore, inread, intr, dismiss_more
// and rawprint (nomuxRaw.rawprint) are fields on it.  termcap.c's LI and CO
// are the same terminal size.  scripts/wintty.test.mjs rejects any other field on
// state.wintty.
function winttyState(state) {
    state.wintty ??= {};
    return state.wintty;
}

// wins[BASE_WINDOW].  Its cury is the row tty_putstr(BASE_WINDOW) writes
// next; the port keeps no other copy of it.  C moves that row with every
// tty_curs(BASE_WINDOW, ...).  The port updates it only where a later
// base-window write reads it: tty_init_nhwindows()'s banner, tty_askname(),
// tty_putstr(BASE_WINDOW), erase_tty_screen() through tty_clear_nhwindow()
// of the map or base window, docorner()'s role-selection menu repair, and
// topl.c addtopl() (the pick-for-you prompt precedes role_init()'s
// tty_askname()).  The other tty_curs(BASE_WINDOW) callers, such as topl.c
// more() and topl_putsym() and docorner() during play, are not modeled
// because no base-window write follows them.
export function baseWindow(state = game) {
    const wt = state.wintty;
    const cw = wt?.wins?.[wt.BASE_WINDOW];
    if (!cw) throw new Error('BASE_WINDOW does not exist');
    return cw;
}

function windowAt(wt, id) {
    if (id === WIN_ERR) return null;
    return wt.wins?.[id] ?? null;
}

// C ref: win/tty/wintty.c tty_curs() (2058-2161).  The browser terminal has
// one visible movement primitive, so cmov()/nocmov() and their termcap branch
// selection converge on setCursor(); the source bookkeeping and map clipping
// happen before that movement and retain the same early return.
export function tty_curs(window, x, y, state = game, _env = {}) {
    // HANGUPHANDLING's HUPSKIP() runs before the window lookup and terminal
    // selection.  The recorder has no signal transport, but a pending
    // hangup still makes this entry point a no-op as in the C build.
    if (state.program_state?.done_hup) return;

    const wt = winttyState(state);
    const cw = windowAt(wt, window);
    if (window === WIN_ERR || !cw) {
        throw new Error('tty_curs() received an invalid window');
    }

    // ttyDisplay->curx and cury are the display's cursor.  C also sets
    // ttyDisplay->lastwin, which nothing reads.
    const display = state.nhDisplay;
    const oldx = display.cursorCol;
    const oldy = display.cursorRow;

    // C coordinates are 1-based columns within a window and 0-based rows.
    // `curx` is deliberately stored one column behind the caller's x.
    cw.curx = x - 1;
    cw.cury = y;

    let targetX = x - 1 + (cw.offx ?? 0);
    let targetY = y + (cw.offy ?? 0);
    if (wt.clipping && window === wt.WIN_MAP) {
        targetX -= wt.clipx ?? 0;
        targetY -= wt.clipy ?? 0;
    }

    if (targetY === oldy && targetX === oldx) return;

    // end_glyphout() only terminates a pending glyph-output run in the C
    // terminal backend.  The JS grid applies glyph graphics and color per
    // cell, so there is no buffered stream to close at this boundary.

    display.setCursor(targetX, targetY);
}

// C ref: wintty.c tty_suspend_nhwindows() (784-790).  term_curs_set(1) only
// changes cursor visibility, which the recorder does not capture.  settty()
// (sys/share/unixtty.c 233-248) calls term_end_screen(), whose
// term_clear_screen() patch 006 mirrors by clearing the shadow screen, and
// then raw-prints a non-null farewell; the terminal-mode ioctls have no
// browser counterpart.  The null case's tty_raw_print("") runs while
// ttyDisplay is still alive.  Patch 006 nomux_raw_emit() drops an empty
// string at that point unless raw mode is already active, where it ends the
// current raw line; C still counts the call in ttyDisplay->rawprint.
// After a hangup, settty() skips term_end_screen() because WINDOWPORT(tty)
// no longer holds; here the hangup-frozen GameDisplay ignores the clear.
export function tty_suspend_nhwindows(str, state = game) {
    const display = state.nhDisplay;
    term_clear_screen(state);
    if (str) {
        tty_raw_print(state, str);
    } else if (state.program_state?.done_hup) {
        // tty_raw_print("") returns at its HUPSKIP() before counting.
    } else if (display?.nomuxRaw?.active) {
        tty_raw_print(state, '');
    } else if (display?.nomuxRaw) {
        display.nomuxRaw.rawprint = (display.nomuxRaw.rawprint ?? 0) + 1;
    }
}

// C ref: wintty.c tty_exit_nhwindows() (810-845).  After the farewell, C
// frees every tty window and the pickinv cache and shuts the terminal down;
// only raw output follows, so the observable result is the cleared or
// farewell screen and window_inited, which tty_display_nhwindow() set when it
// first showed WIN_MESSAGE (wintty.c:1883).
export function tty_exit_nhwindows(str, state = game) {
    tty_suspend_nhwindows(str, state);
    if (state.nhDisplay) state.nhDisplay.ttyDisplayFreed = true;
    state.iflags ??= {};
    state.iflags.window_inited = false;
}

// wintty.c:342-349.  The C path removes lock files, tears down tty windows,
// and exits the process through nh_terminate(), which does not return here
// either.
export async function bail(mesg, state = game) {
    // C files.c clearlocks() deletes the lock and level files (files.c:
    // 733-750) and prints nothing; the recorder deletes them itself before
    // the next segment (scripts/record-session.mjs:555-556 clearLockFiles()).
    tty_exit_nhwindows(mesg, state);
    await nh_terminate(state);
}

// wintty.c:471-490.  CLIPPING is enabled by config.h.  tty_cliparound()'s
// redraw_map(TRUE) is left to the caller's next flush: _buildScreenOutput()
// repaints every map row of the clip window from the cells' displayed glyphs.
export function newclipping(x, y, state = game) {
    const wt = winttyState(state);
    const { rows, cols } = state.nhDisplay;
    if (cols < COLNO || rows < 1 + ROWNO + statusRows(state)) {
        setclipped(state); /* sets clipping=TRUE */
        if (x) tty_cliparound(x, y, state);
    } else {
        wt.clipping = false;
        wt.clipx = 0;
        wt.clipy = 0;
    }
}

// C ref: win/tty/wintty.c setclipped() (3808-3815).  wt.clipping, clipx,
// clipy, clipxmax and clipymax are C's file-scope clipping state; they are
// terminal state, so a new process (the next segment) starts unclipped.
// display.js mapViewport() reads them to place the map's rows.
export function setclipped(state = game) {
    const wt = winttyState(state);
    const display = state.nhDisplay;
    wt.clipping = true;
    wt.clipx = 0;
    wt.clipy = 0;
    wt.clipxmax = display.cols;
    wt.clipymax = display.rows - 1 - statusRows(state);
}

// C ref: win/tty/wintty.c tty_cliparound() (3817-3843), without its closing
// redraw_map(TRUE): it returns true where C makes that call, and the async
// cliparound() below makes it.  A synchronous caller leaves the redraw to its
// next flush, which repaints every map row of the moved clip window.
export function tty_cliparound(x, y, state = game) {
    const wt = winttyState(state);
    const display = state.nhDisplay;
    const oldx = wt.clipx;
    const oldy = wt.clipy;
    if (!wt.clipping) return false;
    const co = display.cols;
    const height = display.rows - 1 - statusRows(state);
    if (x < wt.clipx + 5) {
        wt.clipx = Math.max(0, x - 20);
        wt.clipxmax = wt.clipx + co;
    } else if (x > wt.clipxmax - 5) {
        wt.clipxmax = Math.min(COLNO, wt.clipxmax + 20);
        wt.clipx = wt.clipxmax - co;
    }
    if (y < wt.clipy + 2) {
        wt.clipy = Math.max(0, y - Math.trunc((wt.clipymax - wt.clipy) / 2));
        wt.clipymax = wt.clipy + height;
    } else if (y > wt.clipymax - 2) {
        wt.clipymax = Math.min(ROWNO,
            wt.clipymax + Math.trunc((wt.clipymax - wt.clipy) / 2));
        wt.clipy = wt.clipymax - height;
    }
    return wt.clipx !== oldx || wt.clipy !== oldy;
}

// C's cliparound() window-port call (winprocs.h) from an async caller:
// tty_cliparound() with its redraw_map(TRUE) ("ask the core to resend the map
// window's data").
export async function cliparound(x, y, state = game) {
    if (tty_cliparound(x, y, state)) await redraw_map(true);
}

// C ref: wintty.c tty_display_nhwindow() (1855-1891), its NHW_MAP arm with
// `blocking` TRUE: display_nhwindow(WIN_MAP, TRUE). end_glyphout() has no JS
// state. An occupied topline is promoted to TOPLINE_NEED_MORE, and the message
// window is then displayed, which waits at --More-- unless WIN_STOP is set.
// The NHW_MESSAGE arm is tty_message.js displayPendingTtyMessageWindow(); the
// nonblocking NHW_MAP arm is open-coded where it occurs (allmain.js and
// tty_rawprint.js tty_wait_synch()).
export async function tty_display_nhwindow_map_blocking(state = game) {
    if (state.nhDisplay && state.nhDisplay.toplin !== TOPLINE_EMPTY)
        state.nhDisplay.toplin = TOPLINE_NEED_MORE;
    await displayPendingTtyMessageWindow(state);
}

// C ref: wintty.c tty_clear_nhwindow() NHW_MAP arm (1074-1088): set
// disp.botlx and erase the whole terminal with term_clear_screen(), whose
// erase_tty_screen() leaves BASE_WINDOW's cursor on row 0. dungeon.c
// init_dungeons() calls it once the windows exist, which is what erases the
// startup banner before mklev()'s first prompt.
export function tty_clear_map_window(state = game) {
    state.disp ??= {};
    state.disp.botlx = true;
    term_clear_screen(state);
}

// C ref: wintty.c tty_clear_nhwindow() NHW_BASE arm (1079-1090) and its
// closing reset (1108): term_clear_screen() erases the terminal, and
// erase_tty_screen() leaves BASE_WINDOW's cursor at its first row.
// restore.c restore_menu() calls it on BASE_WINDOW before and after its menu.
export function tty_clear_base_window(state = game) {
    term_clear_screen(state);
}

// C ref: wintty.c tty_putstr() NHW_BASE arm with attribute 0, for a line
// shorter than the terminal: the text goes on the window's current row from
// its left edge, the terminal cursor stays after it, and the row advances.
// The wrap at the last column is not ported; no caller passes so long a line.
export function tty_putstr_base(str, state = game) {
    const display = state.nhDisplay;
    if (!display?.grid) return;
    const base = baseWindow(state);
    const row = base.cury;
    display.putstr(0, row, str, NO_COLOR);
    display.setCursor(str.length, row);
    base.curx = 0;
    ++base.cury;
}

// The tty status window's own state, which wintty.c keeps in file statics
// and in wins[WIN_STATUS]. state._ttyStatus holds:
//
// - `data`: cw->data[row], the characters tty_putstatusfield() last stored.
//   check_fields() compares a sent value with it, and render_status() reads
//   it to decide which indent columns need a space. Only
//   tty_putstatusfield() and tty_clear_nhwindow() write it.
// - `screen`: the terminal's status rows, as {ch, color, attr, owner} cells
//   or null for a blank. tty_putstatusfield() writes a cell here together
//   with `data`; cl_end() erases cells here alone, whether render_status()'s
//   own (5251-5256), docorner()'s, or a screen clear's. `owner` is the
//   port's highlight owner of the cell, which C does not keep.
// - `before`: tty_status[BEFORE][], keyed by field, as {x, y, lth, style}
//   with C's one-based x. tty_status_init() empties it.
// - `finalx`: finalx[row][BEFORE]. Nothing resets it (wintty.c:1070 is
//   commented out), so it survives a rebuilt status window.
// - `dirty`: the fields whose tty_status[NOW][].dirty is set, which
//   tty_status_update() sets and render_status() clears.
//
// All three rows exist whatever 'statuslines' is; row index is C's status
// row, and screen row display.rows - StatusRows() + row.
function blankStatusRow() {
    return {
        data: new Array(COLNO).fill(' '),
        screen: new Array(COLNO).fill(null),
    };
}

export function tty_status_state(state = game) {
    if (!state._ttyStatus) {
        const rows = Array.from({ length: MAX_STATUS_ROWS }, blankStatusRow);
        state._ttyStatus = {
            data: rows.map((row) => row.data),
            screen: rows.map((row) => row.screen),
            before: new Map(),
            finalx: new Array(MAX_STATUS_ROWS).fill(0),
            dirty: new Set(),
        };
    }
    return state._ttyStatus;
}

// The terminal row status row `row` is drawn on.
function statusScreenRow(row, state) {
    return state.nhDisplay.rows - statusRows(state) + row;
}

// A map glyph or raw print over a status cell (display.js _screenOverlay())
// lasts until wintty.c writes or erases that cell.
function dropStatusOverlay(state, screenRow, column) {
    state._screenOverlay?.delete(`${screenRow}:${column}`);
}

// C ref: termcap.c cl_end() on a status row: erase the terminal from
// zero-based `column` to the end of the row. cw->data keeps its characters.
// `row` is the status window's row.
export function tty_status_cl_end(row, column, state = game) {
    const tty = tty_status_state(state);
    if (row < 0 || row >= MAX_STATUS_ROWS) return;
    for (let c = Math.max(0, column); c < COLNO; ++c)
        tty.screen[row][c] = null;
    if (state._screenOverlay && state.nhDisplay) {
        const screenRow = statusScreenRow(row, state);
        for (const [key, cell] of state._screenOverlay)
            if (cell.row === screenRow && cell.column >= column)
                state._screenOverlay.delete(key);
    }
}

// cl_end() at terminal row `screenRow`, when that row belongs to the status
// window; docorner() and the window repairs erase by terminal row.
export function tty_status_cl_end_screen_row(screenRow, column, state = game) {
    if (!state.nhDisplay) return;
    const row = screenRow - (state.nhDisplay.rows - statusRows(state));
    if (row >= 0 && row < statusRows(state))
        tty_status_cl_end(row, column, state);
}

// C ref: termcap.c term_clear_screen() (667-679) with recorder patch 006's
// nomux_clear_screen(), and wintty.c erase_tty_screen() (2036-2055), which it
// calls.  This is the port's only whole-terminal erase: every C caller of
// term_clear_screen(), and of tty_clear_nhwindow() on the map or base
// window, comes here.  scripts/term-clear-screen.test.mjs fails when another
// function calls display.clearScreen().
//
// xputs(CL), home() and nomux_clear_screen() are display.clearScreen().  They
// run after a hangup too; the hangup-frozen GameDisplay ignores the call.
// `screen`, the port's record of the terminal's status rows, goes blank
// with the terminal.
export function term_clear_screen(state = game) {
    const display = state.nhDisplay;
    if (!display) return;
    display.clearScreen();
    for (const row of tty_status_state(state).screen) row.fill(null);
    erase_tty_screen(state);
}

// C ref: wintty.c erase_tty_screen() (2036-2055): tty_clear_nhwindow() of
// every active window with erasing_tty_screen set, so that no arm draws,
// then tty_curs(BASE_WINDOW, 1, 0).  The flag also stops the map and base
// arms from calling term_clear_screen() again; the port has no such call to
// stop.  What each active window's arm (1047-1108) does:
//
// - NHW_MESSAGE: a top line that is not TOPLINE_EMPTY becomes so, without a
//   --More--.  The window is active from its first display on.
// - NHW_MAP: disp.botlx.  allmain.c init_sound_disp_gamewindows() displays
//   the map window two statements after the message window (756-758) and
//   neither is dismissed before both are freed, so the message window's
//   `active` answers for the map window, which the port creates only for
//   getpos().
// - NHW_STATUS: cw->data becomes spaces, and disp.botlx.  tty_status[][]
//   and finalx[][] keep their values.  windows.c genl_status_init()
//   (904-905) creates and displays the window when botl.c
//   status_initialize(FALSE) runs, which is also what sets gb.blinit
//   (botl.c:1692-1696), so gb.blinit is the window's `active`; the port
//   keeps the window's data in state._ttyStatus, not in wins[].
// - NHW_BASE: nothing.
// - NHW_MENU and NHW_TEXT: nothing.  The port keeps a displayed menu or
//   text window's cursor in the terminal cursor alone, and every write to
//   one follows a tty_curs() of its own.
//
// Every arm ends by zeroing the window's curx and cury (1108).
function erase_tty_screen(state) {
    if (state.program_state?.done_hup) return; // HUPSKIP()
    const wt = winttyState(state);
    for (const cw of wt.wins ?? []) {
        if (!cw?.active) continue;
        if (cw.type === NHW_MESSAGE) {
            eraseTtyMessageWindow(state);
            state.disp ??= {};
            state.disp.botlx = true;
        } else if (cw.type === NHW_MAP) {
            state.disp ??= {};
            state.disp.botlx = true;
        }
        cw.curx = cw.cury = 0;
    }
    if (state.gb?.blinit) {
        for (const row of tty_status_state(state).data) row.fill(' ');
        state.disp ??= {};
        state.disp.botlx = true;
    }
    if (windowAt(wt, wt.BASE_WINDOW ?? WIN_ERR))
        tty_curs(wt.BASE_WINDOW, 1, 0, state);
}

// C ref: wintty.c tty_putstatusfield() (4802-4841). `x` is one-based and
// `y` the status row; `style` is the color and attribute render_status()
// has switched on around the call. Returns the terminal cursor's zero-based
// column after the call, or null when x or y is outside the window and the
// cursor does not move.
function tty_putstatusfield(state, text, x, y, style = null, owner = null) {
    const tty = tty_status_state(state);
    const ncols = COLNO; // cw->cols
    if (!(x < ncols && y < statusRows(state))) return null;
    // tty_curs(NHW_STATUS, x, y): cw->curx is zero-based and x one-based,
    // so the test at 4819 never finds the cursor already in place.
    let cursor = x - 1;
    const screenRow = state.nhDisplay ? statusScreenRow(y, state) : null;
    for (let i = 0; i < text.length; ++i) {
        const n = i + x;
        if (n >= ncols) continue;
        tty.data[y][n - 1] = text[i];
        tty.screen[y][n - 1] = {
            ch: text[i],
            color: style?.color ?? NO_COLOR,
            attr: style?.attr ?? 0,
            owner,
        };
        if (screenRow !== null) dropStatusOverlay(state, screenRow, n - 1);
        ++cursor;
    }
    return cursor;
}

// C ref: wintty.c check_fields() (4646-4741) for one BL_FLUSH or BL_RESET,
// once make_things_fit() has settled the lengths; the port's status layout
// (display.js statusLayouts()) has already applied that shrink ladder, so
// this is the last of its check_fields() calls, whose x and redraw flags
// render_status() uses. `rows` holds, for each status row, its enabled
// fields in fieldorder[] order (twolineorder or threelineorder, 4276-4301):
//
//   { key, kind, lth, value, style, dirty, parts, entries }
//
// `kind` is 'condition' for BL_CONDITION, 'version' for BL_VERS and 'field'
// otherwise; `lth` is tty_status[NOW][].lth; `value` is status_vals[], which
// the same-contents test compares with cw->data; `style` identifies the
// field's color and attribute; `dirty` is tty_status[NOW][].dirty; `parts`
// are the {text, style, owner} pieces render_status() writes, in order,
// which for a condition is one blank and one word per set bit.
// Sets each field's one-based `x` and its `redraw`.
function check_fields(state, rows, forcefields) {
    const tty = tty_status_state(state);
    const cols = COLNO; // cw->cols
    for (let row = 0; row < rows.length; ++row) {
        let col = 1;
        let update_right = false;
        for (const field of rows[row]) {
            const before = tty.before.get(field.key)
                ?? { x: 0, y: 0, lth: 0, style: null };
            field.redraw = false;
            field.y = row;
            field.x = col;
            if (field.x + field.lth !== before.x + before.lth)
                update_right = true;
            else if (field.lth !== before.lth || field.x !== before.x)
                field.redraw = true;
            else
                update_right = false;

            let matchprev = false;
            if (!update_right && !forcefields && !field.redraw
                && field.kind !== 'condition'
                && field.style === before.style) {
                matchprev = true;
                if (field.dirty) {
                    let c = col - 1;
                    let nb = 0;
                    while (nb < field.value.length && c < cols) {
                        if (field.value[nb] !== tty.data[row][c]) break;
                        ++nb;
                        ++c;
                    }
                    if (nb < field.value.length) matchprev = false;
                }
            }
            if (forcefields || update_right || (field.dirty && !matchprev))
                field.redraw = true;
            col += field.lth;
        }
    }
}

// C ref: wintty.c render_status() (4991-5262). Draws every field
// check_fields() marked, in fieldorder[] order, and leaves the terminal
// cursor where the last tty_curs() or tty_putstatusfield() put it: at the
// start of the last row, after the last field drawn on it, or at the
// rest-of-row erase. `truncation_expected` is make_things_fit()'s flag for a
// last row that does not fit after every shrink.
function render_status(state, rows, truncation_expected) {
    const tty = tty_status_state(state);
    const cols = COLNO; // cw->cols
    let cursor = null;
    for (let row = 0; row < rows.length; ++row) {
        const y = row;
        const dat = tty.data[y];
        // tty_curs(WIN_STATUS, 1, y)
        cursor = [0, y];
        const put = (text, x, style, owner) => {
            const column = tty_putstatusfield(state, text, x, y, style, owner);
            if (column !== null) cursor = [column, y];
        };
        let finalxNow = null;
        for (const field of rows[row]) {
            let x = field.x;
            const tlth = field.lth;
            if (field.redraw) {
                if (field.kind === 'condition') {
                    // 5036-5069: on the third row, line the conditions up
                    // with BL_HUNGER on the row above, else right justify
                    // them, else leave them where check_fields() put them.
                    // fieldorder[row][i + 1] is BL_WEAPON, never BL_VERS, so
                    // last_col stays cw->cols.
                    if (row === MAX_STATUS_ROWS - 1 && field.parts.length) {
                        const last_col = cols;
                        const hunger = tty.before.get('hunger')
                            ?? { x: 0, y: 0 };
                        let cstart;
                        if (hunger.y < row && x < hunger.x
                            && hunger.x + tlth < last_col - 1)
                            cstart = hunger.x;
                        else if (x + tlth < cols - 1)
                            cstart = last_col - tlth;
                        else
                            cstart = x;
                        if (x < cstart) {
                            do {
                                if (dat[x - 1] !== ' ') put(' ', x);
                            } while (++x < cstart);
                            field.x = x;
                            // tty_curs(WIN_STATUS, x, y)
                            cursor = [x - 1, y];
                        }
                    }
                    // 5071-5100: a blank, then the word, for each set bit;
                    // `parts` alternates the two.
                    for (let i = 0; i + 1 < field.parts.length; i += 2) {
                        const word = field.parts[i + 1];
                        put(field.parts[i].text, x++);
                        if (x >= cols && !truncation_expected) {
                            // C: impossible("Unexpected condition placement
                            // overflow for \"%s\"", condtext), then no
                            // further conditions.
                            note_unported('pline.c impossible');
                            break;
                        }
                        put(word.text, x, word.style, word.owner);
                        x += word.text.length;
                    }
                    if (x > cols) x = cols;
                } else {
                    if (field.kind === 'version') {
                        // 5185-5210: BL_VERS ends its row in both orders, so
                        // it is right justified. fieldorder[row][i - 1] is
                        // BL_TERRAIN, never BL_CONDITION, so x is not moved
                        // to the conditions' end first.
                        const vstart = cols - field.lth;
                        if (x < vstart) {
                            do {
                                if (dat[x - 1] !== ' ') put(' ', x);
                            } while (++x < vstart);
                            field.x = x;
                        }
                    }
                    // 5108-5182 (hitpointbar) and 5211-5231: the parts carry
                    // the split into unhighlighted blanks, '/', '[' and ']'
                    // and the highlighted text.
                    for (const part of field.parts) {
                        put(part.text, x, part.style, part.owner);
                        x += part.text.length;
                    }
                }
            } else {
                // not rendered => same text as before
                x += tlth;
            }
            finalxNow = x - 1;
            tty.before.set(field.key, {
                x: field.x, y: field.y, lth: field.lth, style: field.style,
                // The port's own: display.js _statusFlush() compares it.
                text: field.text,
            });
        }
        if (finalxNow === null) continue;
        const x = finalxNow;
        if ((x < tty.finalx[row] || !tty.finalx[row]) && x + 1 < cols) {
            // tty_curs(WIN_STATUS, x + 1, y); cl_end();
            cursor = [x, y];
            tty_status_cl_end(row, x, state);
        }
        tty.finalx[row] = x;
    }
    tty.dirty.clear();
    return cursor;
}

// C ref: wintty.c tty_status_update()'s BL_FLUSH and BL_RESET arms
// (4479-4487): make_things_fit(), whose last check_fields() this runs, then
// render_status(). `forcefields` is BL_RESET's FORCE_RESET, and
// `truncation_expected` whether the last row still overflows after
// make_things_fit()'s last shrink. Moves the terminal cursor as
// render_status() leaves it.
export function tty_status_flush(
    rows, forcefields, truncation_expected, state = game,
) {
    check_fields(state, rows, forcefields);
    const cursor = render_status(state, rows, truncation_expected);
    const display = state.nhDisplay;
    if (cursor && display?.grid) {
        display.setCursor(
            Math.min(cursor[0], display.cols - 1),
            statusScreenRow(cursor[1], state),
        );
    }
}

// Copies the terminal's status rows from state._ttyStatus onto `display`,
// which the screen rebuild erases at every flush.
export function tty_status_paint(display, state = game) {
    if (!display?.grid) return;
    const tty = tty_status_state(state);
    const count = statusRows(state);
    for (let row = 0; row < count; ++row) {
        const screenRow = display.rows - count + row;
        display.clearRow(screenRow);
        for (let column = 0; column < Math.min(COLNO, display.cols);
            ++column) {
            const cell = tty.screen[row][column];
            // tty_putstatusfield() prints each byte as a char.
            if (cell)
                display.putch(column, screenRow, cell.ch, cell.color,
                    cell.attr);
        }
    }
}

// C ref: wintty.c tty_clear_nhwindow() NHW_STATUS arm (1059-1073): cl_end()
// on every status row, spaces in the window's data, and disp.botlx.
// state._renderedStatusLayouts, the rows as last shown, goes blank with them.
function clear_status_window(state) {
    const rows = statusRows(state);
    state._renderedStatusLayouts = Array.from(
        { length: rows },
        () => ({ text: '', owners: [] }),
    );
    state._renderedStatusStyles = null;
    const display = state.nhDisplay;
    // cl_end() also erases map glyphs that an unclipped map printed on a
    // status row (display.js _screenOverlay()); they come back only when
    // the map cell is printed again.
    for (let row = 0; row < rows; ++row) tty_status_cl_end(row, 0, state);
    const tty = tty_status_state(state);
    for (let row = 0; row < MAX_STATUS_ROWS; ++row) {
        tty.data[row].fill(' ');
        tty.screen[row].fill(null);
    }
    if (display?.grid) {
        const firstRow = display.rows - rows;
        for (let row = firstRow; row < display.rows; ++row)
            display.clearRow(row);
    }
    state.disp ??= {};
    state.disp.botlx = true;
}

// wintty.c:491-510.  The browser renderer has no WinDesc status window, so
// tty_clear_nhwindow(WIN_STATUS) clears the cached status rows.  C's first
// arm, which clears and destroys an existing status window, needs WIN_STATUS
// set, and the port never assigns it a window id.
// config.h defines STATUS_HILITES, so the rebuilt window ends with botl.c
// status_initialize(REASSESS_ONLY): its gu.update_all makes the next bot()
// evaluate every field with chg = 0 and clear its highlight timer, dropping
// a temporary up/down highlight.
export function new_status_window(state = game) {
    // windows.c:909-919 genl_status_finish() frees status_vals[]; then
    // wintty.c:4336-4361 tty_status_init() resets tty_status[][], the
    // condition bits and the hit-point bar, and genl_status_init()
    // (windows.c:893-906) empties status_vals[] and disables every field.
    // status_initialize(REASSESS_ONLY) below enables the fields again and
    // sets gu.update_all, so the next bot() sends every field before the
    // rows are drawn; the cached rows cleared below stand for that data.
    // genl_status_init()'s display_nhwindow(WIN_STATUS) clears rawprint
    // (wintty.c:1868).
    if (state.nhDisplay?.nomuxRaw) state.nhDisplay.nomuxRaw.rawprint = 0;
    clear_status_window(state);
    // tty_status_init() zeroes tty_status[][], so the next render_status()
    // pass redraws every field, and tty_clear_nhwindow(WIN_STATUS) blanks
    // cw->data.  Neither touches the file-static finalx[][] (wintty.c:4304;
    // the reset at 1070 is commented out), so a rebuilt window still
    // compares each row's end column with the old one at wintty.c:5251-5256:
    // the row's tail, where the indented conditions stand, is erased only
    // if the row got shorter.
    const tty = tty_status_state(state);
    tty.before = new Map();
    tty.dirty = new Set();
    status_initialize(state, true);
}

// C ref: win/tty/wintty.c tty_init_nhwindows() (511-593). The terminal
// syscalls and signal registration have no browser counterpart; the existing
// startup renderer owns the visible banner and cursor placement, while this
// entry point owns the tty descriptor and base-window state.
export function tty_init_nhwindows(argcp = null, argv = null, state = game) {
    state = startupState(argcp, argv, state);
    state.iflags ??= {};
    const wt = winttyState(state);
    const display = state.nhDisplay;
    term_startup(state);

    state.iflags.wc2_statuslines = statusRows(state);
    state.iflags.cbreak = true;
    // setftty() changes the terminal-only echo flag. Keep it off the
    // enumerable game snapshot: C does not save terminal mode, and the
    // existing replay state oracles likewise exclude this transport detail.
    Object.defineProperty(state.iflags, 'echo', {
        configurable: true,
        enumerable: false,
        value: false,
        writable: true,
    });
    // The ttyDisplay descriptor is the GameDisplay (see winttyState()).
    // Its rows and cols are already the terminal size.  C zeroes curx and
    // cury, but tty_clear_nhwindow(BASE_WINDOW) homes the cursor before the
    // banner, which renderTtyStartupBanner() draws.  No JavaScript code reads
    // topl_utf8, mixed, color, attrs or lastwin, so the port does not keep
    // them: C reads topl_utf8 and mixed in topl.c redotoplin() while
    // tty_putmixed() has set them, and color during glyph output, which the
    // per-cell grid replaces; it never reads attrs or lastwin.  The mixed arm
    // of redotoplin(), g_putch() of a leading high byte, is
    // tty_message.js ttyPutmixed()'s first cell, which update_topl() passes
    // to topl.js redrawTtyTopline() for that one paint.
    display.toplin = TOPLINE_EMPTY;
    display.inmore = display.inread = display.intr = 0;
    display.dismiss_more = 0;

    const baseWindow = tty_create_nhwindow(NHW_BASE, state);
    wt.BASE_WINDOW = baseWindow;
    wt.wins[baseWindow].active = true;

    // The browser terminal adapter supplies the void platform calls here:
    // display construction owns terminal dimensions and mode, and the startup
    // renderer owns the base-window writes.  The closing
    // set_wc2_option_mod_status(WC2_STATUSLINES, set_in_game) gives
    // statuslines the mode include/optlist.h already gives it.  They
    // therefore are not unported gaps in a normal browser startup.
    // wintty.c:560 tty_clear_nhwindow(BASE_WINDOW), before the banner.
    tty_clear_base_window(state);
    renderTtyStartupBanner(state);
}

// C ref: win/tty/wintty.c tty_preference_update() (595-631). The common
// preference update is a void no-op in this TTY build; statuslines still
// rebuilds the status window and clipping geometry before that call.
export function tty_preference_update(pref, state = game) {
    // wintty.c:598-599: only once iflags.window_inited is set.
    const newstatuslines = pref === 'statuslines'
        && Boolean(state.iflags?.window_inited);
    if (newstatuslines) {
        new_status_window(state);
        newclipping(state.u?.ux ?? 0, state.u?.uy ?? 0, state);
    }
}

// C ref: win/tty/wintty.c tty_update_inventory() (3605-3613), the tty
// window port's win_update_inventory. The recorder is built from
// sys/unix/hints/linux-minimal, which leaves include/config.h's
// TTY_PERM_INVENT undefined, so the function takes its "do nothing" branch:
// it draws no permanent inventory window and never calls back into
// invent.c sync_perminvent(), whether or not iflags.perm_invent is set.
// The same build omits WC_PERM_INVENT from tty_procs' capabilities.
export function tty_update_inventory(_arg = 0) {}

// C ref: win/tty/wintty.c tty_player_selection() (633-641). The role.c
// implementation is already owned by player_selection_tty.js; it returns true
// once a character is chosen, and a cancelled selection bails, which does not
// return.
export async function tty_player_selection(state = game, random) {
    const { ttyPlayerSelectionImpl } = await import('./player_selection_tty.js');
    if (await ttyPlayerSelectionImpl(state, random)) return true;
    await bail(null, state);
}

// C ref: win/tty/wintty.c tty_askname() (643-755). The source-shaped entry
// point delegates to the existing tty input loop, which owns filtering,
// echo, retry placement, and the PL_NSIZ bound.
export async function tty_askname(state = game) {
    if (state.iflags?.wc2_selectsaved && !state.iflags.renameinprogress) {
        const { restore_menu } = await import('./restore.js');
        const choice = await restore_menu(
            state.wintty?.BASE_WINDOW ?? WIN_ERR,
            state,
        );
        if (choice === -1)
            await bail('Until next time then...', state);
        if (choice === 1) return state.plname;
    }
    return ttyAsknameImpl(state);
}
