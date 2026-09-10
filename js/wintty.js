// wintty.js -- The live tty window initialization used by startup.
// C ref: win/tty/wintty.c tty_create_nhwindow().

import {
    COLNO,
    MAXWIN,
    MAX_MSG_HISTORY,
    NHW_BASE,
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
import {
    renderTtyStartupBanner,
    ttyAsknameImpl,
} from './tty_startup.js';
import { NO_COLOR } from './terminal.js';

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
    return {
        wid: display?.cols ?? 80,
        hgt: display?.rows ?? 24,
    };
}

// C ref: win/tty/wintty.c tty_create_nhwindow() (850-895). The browser
// descriptor stores the fields needed by startup and by later resize code;
// message windows retain the earlier history-size normalization.
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
        window.maxrow = window.rows;
    } else {
        throw new Error(
            'tty_create_nhwindow() only ports the NHW_MESSAGE startup branch',
        );
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
    const newstatuslines = pref === 'statuslines'
        && Boolean(state.iflags?.window_inited);
    if (newstatuslines) {
        new_status_window(state);
        newclipping(state.u?.ux ?? 0, state.u?.uy ?? 0, state);
    }
}

// C ref: win/tty/wintty.c tty_player_selection() (633-641). The role.c
// implementation is already owned by player_selection_tty.js; this wrapper
// preserves its boolean result so the JavaScript caller can observe C's
// non-returning bail path when selection is cancelled.
export async function tty_player_selection(state = game, random) {
    const { ttyPlayerSelectionImpl } = await import('./player_selection_tty.js');
    if (await ttyPlayerSelectionImpl(state, random)) return true;
    bail(null, state);
    return false;
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
        if (choice === -1) {
            bail('Until next time then...', state);
            return null;
        }
        if (choice === 1) return state.plname;
    }
    return ttyAsknameImpl(state);
}
