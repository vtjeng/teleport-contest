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
    TOPLINE_EMPTY,
    TOPLINE_NEED_MORE,
} from './tty_message.js';
import {
    renderTtyStartupBanner,
    ttyAsknameImpl,
} from './tty_startup.js';
import { NO_COLOR } from './terminal.js';
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

// C ref: win/tty/termcap.c term_startup(). The terminal port already owns
// the dimensions through GameDisplay, so the pointer outputs become this
// source-shaped pair rather than a second copy of the dimensions.
export function term_startup(state = game) {
    const display = state.nhDisplay;
    const wid = display?.cols ?? 80;
    const hgt = display?.rows ?? 24;
    // termcap.c tty_startup() (CLIPPING).
    if (wid < COLNO || hgt < ROWNO + 3) setclipped(state);
    return { wid, hgt };
}

// C ref: win/tty/wintty.c tty_create_nhwindow() (850-895). The browser
// descriptor stores the fields needed by startup, cursor movement, and later
// resize code; message windows retain the earlier history-size normalization.
export function tty_create_nhwindow(type, state = game) {
    const wt = winttyState(state);
    const display = ttyDisplay(state, wt);
    const rows = wt.rows ?? display?.rows ?? 24;
    const cols = wt.cols ?? display?.cols ?? 80;
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
        cols,
        maxrow: 0,
        maxcol: 0,
        data: null,
        datlen: null,
    };
    if (type === NHW_BASE) {
        window.rows = rows;
        window.maxrow = 0;
    } else if (type === NHW_MESSAGE) {
        const history = state.iflags?.msg_history ?? 20;
        state.iflags ??= {};
        state.iflags.msg_history = Math.min(
            MAX_MSG_HISTORY,
            Math.max(20, history),
        );
        window.rows = state.iflags.msg_history;
        // wintty.c allocates rows slots, then uses maxrow as the next history
        // slot (zero for an empty ring).
        window.maxrow = 0;
        window.maxcol = 0;
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

// wintty.c keeps these values in file-static/global storage.  The JavaScript
// runner creates a fresh game object for each segment, so state.wintty is the
// single owner of the port's tty dimensions, window table, clipping state and
// resize-only message flag.
function winttyState(state) {
    state.wintty ??= {};
    return state.wintty;
}

function ttyDisplay(state, wt) {
    return wt.ttyDisplay ?? state.ttyDisplay ?? state.nhDisplay ?? null;
}

function windowAt(wt, id) {
    if (id === WIN_ERR) return null;
    return wt.wins?.[id] ?? null;
}

function displayCursor(state, wt, display) {
    if (Number.isFinite(display?.curx) && Number.isFinite(display?.cury)) {
        return [display.curx, display.cury];
    }
    if (Number.isFinite(display?.cursorCol)
        && Number.isFinite(display?.cursorRow)) {
        return [display.cursorCol, display.cursorRow];
    }
    return [wt.curx ?? 0, wt.cury ?? 0];
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

    const display = ttyDisplay(state, wt);
    const [oldx, oldy] = displayCursor(state, wt, display);
    wt.lastwin = window;

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

    if (typeof display?.setCursor === 'function') {
        display.setCursor(targetX, targetY);
    } else if (display) {
        display.curx = targetX;
        display.cury = targetY;
    }
    wt.curx = targetX;
    wt.cury = targetY;
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
export function tty_suspend_nhwindows(str, state = game) {
    const display = state.nhDisplay;
    display?.clearScreen();
    if (str) {
        tty_raw_print(state, str);
    } else if (display?.nomuxRaw?.active) {
        tty_raw_print(state, '');
    } else if (display?.nomuxRaw) {
        display.nomuxRaw.rawprint = (display.nomuxRaw.rawprint ?? 0) + 1;
    }
}

// C ref: wintty.c tty_exit_nhwindows() (810-845).  After the farewell, C
// frees every tty window and the pickinv cache and shuts the terminal down;
// only raw output follows, so the observable result is the cleared or
// farewell screen and window_inited, which tty_init_nhwindows() set.
export function tty_exit_nhwindows(str, state = game) {
    tty_suspend_nhwindows(str, state);
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
    const display = ttyDisplay(state, wt);
    const cols = wt.CO ?? display?.cols ?? 0;
    const rows = wt.LI ?? display?.rows ?? 0;
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
    const display = ttyDisplay(state, wt);
    wt.clipping = true;
    wt.clipx = 0;
    wt.clipy = 0;
    wt.clipxmax = wt.CO ?? display?.cols ?? 0;
    wt.clipymax = (wt.LI ?? display?.rows ?? 0) - 1 - statusRows(state);
}

// C ref: win/tty/wintty.c tty_cliparound() (3817-3843), without its closing
// redraw_map(TRUE): it returns true where C makes that call, and the async
// cliparound() below makes it.  A synchronous caller leaves the redraw to its
// next flush, which repaints every map row of the moved clip window.
export function tty_cliparound(x, y, state = game) {
    const wt = winttyState(state);
    const display = ttyDisplay(state, wt);
    const oldx = wt.clipx;
    const oldy = wt.clipy;
    if (!wt.clipping) return false;
    const co = wt.CO ?? display?.cols ?? 0;
    const height = (wt.LI ?? display?.rows ?? 0) - 1 - statusRows(state);
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
    const display = state.nhDisplay;
    if (!display?.grid) return;
    display.clearScreen();
    if (state._ttyBaseCursorRow !== undefined) state._ttyBaseCursorRow = 0;
}

// C ref: wintty.c tty_clear_nhwindow() NHW_STATUS arm (1059-1073): cl_end()
// on every status row, spaces in the window's data, and disp.botlx. The
// port's status window contents are the cached layouts the screen rebuild
// writes, so blank layouts are the cleared window until bot() repaints it.
function clear_status_window(state) {
    const rows = statusRows(state);
    state._renderedStatusLayouts = Array.from(
        { length: rows },
        () => ({ text: '', owners: [] }),
    );
    state._renderedStatusStyles = null;
    const display = state.nhDisplay;
    if (display?.grid) {
        const firstRow = display.rows - rows;
        for (let row = firstRow; row < display.rows; ++row)
            display.clearRow(row);
        // cl_end() also erases map glyphs that an unclipped map printed on a
        // status row (display.js _screenOverlay()); they come back only
        // when the map cell is printed again.
        for (const [key, cell] of state._screenOverlay ?? [])
            if (cell.row >= firstRow) state._screenOverlay.delete(key);
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
    const display = ttyDisplay(state, wt);
    const { wid, hgt } = term_startup(state);

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
    wt.ttyDisplay = display;
    wt.toplin = TOPLINE_EMPTY;
    wt.topl_utf8 = 0;
    wt.rows = hgt;
    wt.cols = wid;
    wt.curx = 0;
    wt.cury = 0;
    wt.inmore = 0;
    wt.inread = 0;
    wt.intr = 0;
    wt.dismiss_more = 0;
    wt.color = NO_COLOR;
    wt.attrs = 0;
    wt.mixed = 0;
    wt.lastwin = WIN_ERR;

    const baseWindow = tty_create_nhwindow(NHW_BASE, state);
    wt.BASE_WINDOW = baseWindow;
    wt.wins[baseWindow].active = true;
    // CLIPPING is enabled in the recorder build, so the source selects
    // set_in_game (4) for the statuslines capability.
    wt.statuslines_mod_status = 4;

    // The browser terminal adapter supplies the void platform calls here:
    // display construction owns terminal dimensions and mode, the startup
    // renderer owns the base-window writes, and statuslines_mod_status is the
    // source's set_wc2_option_mod_status(set_in_game) result. They therefore
    // are not unported gaps in a normal browser startup.
    renderTtyStartupBanner(state);
}

// C ref: win/tty/wintty.c tty_preference_update() (595-631). The common
// preference update is a void no-op in this TTY build; statuslines still
// rebuilds the status window and clipping geometry before that call.
export function tty_preference_update(pref, state = game) {
    // The JS startup path does not store window_inited, so only an explicit
    // false means windows are not yet initialized.
    const newstatuslines = pref === 'statuslines'
        && state.iflags?.window_inited !== false;
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
