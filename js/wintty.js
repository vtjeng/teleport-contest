// wintty.js -- The live tty window initialization used by startup.
// C ref: win/tty/wintty.c tty_create_nhwindow().

import {
    COLNO,
    MAXWIN,
    MAX_MSG_HISTORY,
    NHW_MESSAGE,
    ROWNO,
    WIN_ERR,
} from './const.js';
import { game } from './gstate.js';
import { note_unported } from './unported.js';
import {
    TOPLINE_EMPTY,
    TOPLINE_NON_EMPTY,
} from './tty_message.js';

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

function callTerminalOperation(state, operation, gap, args = []) {
    if (typeof operation === 'function') return operation(...args);
    note_unported(gap);
    return undefined;
}

// wintty.c:344-360.  The C path removes lock files, tears down tty windows,
// and exits the process.  The browser runner has no files or process to
// release; record those calls and expose nh_terminate()'s observable result
// through the existing gameover state.
export function bail(mesg, state = game, env = {}) {
    callTerminalOperation(
        state,
        env.clearlocks,
        'files.c clearlocks',
        [state],
    );
    callTerminalOperation(
        state,
        env.tty_exit_nhwindows,
        'wintty.c tty_exit_nhwindows',
        [mesg, state],
    );
    callTerminalOperation(
        state,
        env.nh_terminate,
        'end.c nh_terminate',
        [0, state],
    );

    state.program_state ??= {};
    state.program_state.in_moveloop = 0;
    state.program_state.exiting = 1;
    state.program_state.gameover = true;
}

// wintty.c:361-391.  WINCHAIN is disabled in config.h, so the compiled
// handler only records the pending resize and services it immediately when
// tty_nhgetch() is already waiting for a character.
export function winch_handler(_sig_unused = 0, state = game, env = {}) {
    state.program_state ??= {};
    state.program_state.resize_pending =
        (state.program_state.resize_pending ?? 0) + 1;
    if (state.program_state.getting_char)
        resize_tty(state, env);
}

function windowSize(state, wt, display, env) {
    const oldRows = wt.LI ?? display?.rows ?? 0;
    const oldCols = wt.CO ?? display?.cols ?? 0;
    const query = env.getwindowsz ?? wt.getwindowsz;
    if (typeof query !== 'function') {
        note_unported('ioctl.c getwindowsz');
        return { oldRows, oldCols, rows: oldRows, cols: oldCols, queried: false };
    }

    const result = query.call(wt, state, wt);
    if (Array.isArray(result)) {
        if (Number.isFinite(result[0])) wt.LI = result[0];
        if (Number.isFinite(result[1])) wt.CO = result[1];
    } else if (result && typeof result === 'object') {
        if (Number.isFinite(result.rows)) wt.LI = result.rows;
        if (Number.isFinite(result.cols)) wt.CO = result.cols;
    }
    const rows = wt.LI ?? oldRows;
    const cols = wt.CO ?? oldCols;
    return { oldRows, oldCols, rows, cols, queried: true };
}

// wintty.c:392-470.  The dimensions and early-return branches are portable
// state transitions.  The redraw calls remain explicit gaps unless a caller
// supplies the corresponding operation; this avoids pretending that a
// browser terminal can perform C's synchronous window-port redraw.
export function resize_tty(state = game, env = {}) {
    const wt = winttyState(state);
    const display = ttyDisplay(state, wt);
    state.program_state ??= {};
    state.program_state.resize_pending = 0;
    wt.resize_mesg = 0;

    const size = windowSize(state, wt, display, env);
    if (!size.queried || !display
        || (size.rows === size.oldRows && size.cols === size.oldCols)) {
        return;
    }

    wt.LI = size.rows;
    wt.CO = size.cols;
    // GameDisplay exposes rows and cols as read-only views of Terminal.  A
    // plain C-shaped descriptor remains directly mutable for source tests;
    // the browser display keeps its physical grid unchanged until a real
    // resize-capable terminal implementation exists.
    if (!display.terminal) {
        display.rows = size.rows;
        display.cols = size.cols;
    }

    const baseId = wt.BASE_WINDOW ?? WIN_ERR;
    const base = windowAt(wt, baseId);
    if (base) {
        base.rows = size.rows;
        base.cols = size.cols;
    }

    // The C flag is false before tty_init_nhwindows().  The JS startup path
    // does not store it, so an explicit false is the pre-window sentinel.
    if (state.iflags?.window_inited === false) return;

    const mapId = wt.WIN_MAP ?? WIN_ERR;
    const map = windowAt(wt, mapId);
    const mapActive = Boolean(map?.active);
    let mapx;
    let mapy;
    if (!mapActive) {
        mapx = 1;
        mapy = 0;
    } else if ((state.gg?.getposx ?? 0) < 1) {
        mapx = state.u?.ux ?? 0;
        mapy = state.u?.uy ?? 0;
    } else {
        mapx = state.gg.getposx;
        mapy = state.gg.getposy;
    }

    const oldtoplin = display.toplin ?? TOPLINE_EMPTY;
    display.toplin = TOPLINE_EMPTY;
    callTerminalOperation(
        state,
        env.term_clear_screen ?? display.clearScreen?.bind(display),
        'termcap.c term_clear_screen',
    );
    new_status_window(state, env);

    if (mapActive) {
        callTerminalOperation(
            state,
            env.docrt_flags,
            'display.c docrt_flags',
            ['docrtRefresh', state],
        );
        callTerminalOperation(state, env.bot, 'botl.c bot', [state]);

        const skip = new Set([
            baseId,
            mapId,
            wt.WIN_STATUS ?? WIN_ERR,
            wt.WIN_INVEN ?? WIN_ERR,
            wt.WIN_MESSAGE ?? WIN_ERR,
        ]);
        for (let i = 0; i < MAXWIN; ++i) {
            if (skip.has(i)) continue;
            if (wt.wins?.[i]?.active) {
                display.toplin = TOPLINE_NON_EMPTY;
                callTerminalOperation(
                    state,
                    env.addtopl,
                    'topl.c addtopl',
                    ['Press a key to continue: ', state],
                );
                wt.resize_mesg++;
                break;
            }
        }
    }

    if (oldtoplin !== TOPLINE_EMPTY) {
        display.toplin = oldtoplin;
        callTerminalOperation(
            state,
            env.addtopl,
            'topl.c addtopl',
            [display.toplines ?? state._ttyToplines ?? '', state],
        );
    }
    if (mapActive) {
        newclipping(mapx, mapy, state, env);
        callTerminalOperation(
            state,
            env.tty_curs,
            'wintty.c tty_curs',
            [mapId, mapx, mapy, state],
        );
        callTerminalOperation(
            state,
            env.tty_display_nhwindow,
            'wintty.c tty_display_nhwindow',
            [mapId, false, state],
        );
    }
}

// wintty.c:471-490.  CLIPPING is enabled by config.h.  Its two helper calls
// are later in wintty.c and remain unported, so this function records them;
// the wide-screen branch is complete because it owns those assignments.
export function newclipping(x, y, state = game, env = {}) {
    const wt = winttyState(state);
    const display = ttyDisplay(state, wt);
    const cols = wt.CO ?? display?.cols ?? 0;
    const rows = wt.LI ?? display?.rows ?? 0;
    const statusLines = state.iflags?.wc2_statuslines ?? 0;
    if (cols < COLNO || rows < 1 + ROWNO + statusLines) {
        callTerminalOperation(
            state,
            env.setclipped,
            'wintty.c setclipped',
            [state],
        );
        if (x) {
            callTerminalOperation(
                state,
                env.tty_cliparound,
                'wintty.c tty_cliparound',
                [x, y, state],
            );
        }
    } else {
        wt.clipping = false;
        wt.clipx = 0;
        wt.clipy = 0;
    }
}

// wintty.c:491-510.  The browser renderer has no WinDesc status window;
// invalidating the cached layout and raising disp.botlx is its equivalent of
// clearing and recreating the status rows.  The underlying tty lifecycle
// calls remain recorded gaps until their window-port implementations land.
export function new_status_window(state = game, env = {}) {
    const wt = winttyState(state);
    const statusId = wt.WIN_STATUS ?? WIN_ERR;
    if (statusId !== WIN_ERR) {
        callTerminalOperation(
            state,
            env.tty_clear_nhwindow,
            'wintty.c tty_clear_nhwindow',
            [statusId, state],
        );
        callTerminalOperation(
            state,
            env.tty_destroy_nhwindow,
            'wintty.c tty_destroy_nhwindow',
            [statusId, state],
        );
        wt.WIN_STATUS = WIN_ERR;
    }
    callTerminalOperation(
        state,
        env.genl_status_finish,
        'windows.c genl_status_finish',
        [state],
    );
    callTerminalOperation(
        state,
        env.tty_status_init,
        'wintty.c tty_status_init',
        [state],
    );
    callTerminalOperation(
        state,
        env.tty_clear_nhwindow,
        'wintty.c tty_clear_nhwindow',
        [wt.WIN_STATUS ?? WIN_ERR, state],
    );
    // config.h defines STATUS_HILITES.  status_initialize(REASSESS_ONLY) is
    // already represented by this port's full status refresh flag.
    state.disp ??= {};
    state.disp.botlx = true;
    state._renderedStatusLayouts = null;
}
