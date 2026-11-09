import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    COLNO,
    MAX_MSG_HISTORY,
    NHW_MAP,
    NHW_MESSAGE,
    NHW_BASE,
    NHW_STATUS,
    ROWNO,
    WIN_ERR,
} from '../js/const.js';
import { resetGame } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import { get_saved_games } from '../js/restore.js';
import { parseCFunctions } from './c-functions.mjs';
import { expectTerminated } from './expect-terminated.mjs';
import {
    bail,
    new_status_window,
    newclipping,
    print_vt_code,
    print_vt_soundcode_idx,
    tty_create_nhwindow,
    tty_curs,
    tty_askname,
    tty_cliparound,
    tty_init_nhwindows,
    tty_preference_update,
} from '../js/wintty.js';
import { initUnported } from '../js/unported.js';
import { InMemoryStorage, setStorageForTesting } from '../js/storage.js';

const C_SOURCE = readFileSync(
    'nethack-c/upstream/win/tty/wintty.c',
    'utf8',
);
const CONFIG_SOURCE = readFileSync(
    'nethack-c/upstream/include/config.h',
    'utf8',
);

// C ref: win/tty/wintty.c tty_create_nhwindow() (850-895), the NHW_MESSAGE
// branch's side effect on iflags.msg_history.  Message-row allocation is not
// modeled by this port.
test('tty_create_nhwindow clamps the live message history size', () => {
    for (const [configured, normalized] of [
        [0, 20],
        [19, 20],
        [20, 20],
        [37, 37],
        [MAX_MSG_HISTORY, MAX_MSG_HISTORY],
        [MAX_MSG_HISTORY + 1, MAX_MSG_HISTORY],
        [0xFFFFFFFF, MAX_MSG_HISTORY],
    ]) {
        const state = { iflags: { msg_history: configured } };
        tty_create_nhwindow(NHW_MESSAGE, state);
        assert.equal(state.iflags.msg_history, normalized, `${configured}`);
    }
});

test('tty_create_nhwindow keeps the unbuffered map geometry', () => {
    const state = { wintty: { rows: 24, cols: 80 } };
    const mapId = tty_create_nhwindow(NHW_MAP, state);
    assert.deepEqual(state.wintty.wins[mapId], {
        type: NHW_MAP,
        flags: 0,
        active: false,
        curx: 0,
        cury: 0,
        offx: 0,
        offy: 1,
        rows: ROWNO,
        cols: COLNO,
        maxrow: 0,
        maxcol: 0,
        data: null,
        datlen: null,
    });
});

test('tty_create_nhwindow stops before unported window types', () => {
    const state = { iflags: { msg_history: 37 } };
    assert.throws(
        () => tty_create_nhwindow(NHW_STATUS, state),
        /only ports the NHW_MESSAGE and NHW_MAP startup branches/u,
    );
    assert.equal(state.iflags.msg_history, 37);
});

test('tty_curs follows map offsets, clipping, bookkeeping, and early return', () => {
    const movements = [];
    const display = {
        cursorCol: 10,
        cursorRow: 9,
        setCursor(column, row) {
            movements.push([column, row]);
            this.cursorCol = column;
            this.cursorRow = row;
        },
    };
    const state = {
        nhDisplay: display,
        wintty: {
            WIN_MAP: 0,
            clipping: true,
            clipx: 3,
            clipy: 2,
            curx: 10,
            cury: 9,
            wins: [{
                type: NHW_MAP,
                offx: 4,
                offy: 5,
                curx: 0,
                cury: 0,
            }],
        },
    };

    tty_curs(0, 12, 8, state);
    assert.deepEqual(movements, [[12, 11]]);
    assert.deepEqual(
        [state.wintty.lastwin, state.wintty.wins[0].curx,
            state.wintty.wins[0].cury, state.wintty.curx, state.wintty.cury],
        [0, 11, 8, 12, 11],
    );

    // The C early return still updates the selected window's logical cursor,
    // but emits no second terminal movement or map flush.
    tty_curs(0, 12, 8, state);
    assert.deepEqual(movements, [[12, 11]]);
    assert.deepEqual(
        [state.wintty.wins[0].curx, state.wintty.wins[0].cury],
        [11, 8],
    );
});

test('tty_curs leaves all state untouched when hangup handling is active', () => {
    const state = {
        program_state: { done_hup: true },
        wintty: { wins: null },
    };
    assert.equal(tty_curs(WIN_ERR, 1, 0, state), undefined);
    assert.deepEqual(state.wintty, { wins: null });
});

test('VT escape helpers are compile-disabled in the reference build', () => {
    // config.h comments out both feature defines, so wintty.c selects the
    // empty macro branches at lines 318 and 339.
    assert.match(CONFIG_SOURCE, /\/\* #define TTY_TILES_ESCCODES \*\//u);
    assert.match(CONFIG_SOURCE, /\/\* #define TTY_SOUND_ESCCODES \*\//u);
    assert.match(
        C_SOURCE,
        /#define print_vt_code\(i, c, d\) \/\*empty\*\//u,
    );
    assert.match(
        C_SOURCE,
        /#define print_vt_soundcode_idx\(idx, v\) ;/u,
    );
});

test('compile-disabled VT escape helpers preserve state and output routing', () => {
    // These values exercise the helper arguments and the runtime options even
    // though the compile-time macros discard both calls before they can read
    // them.
    const state = {
        iflags: { vt_tiledata: true, vt_sounddata: true },
        program_state: { done_hup: true },
        nhDisplay: {
            putstr() {
                throw new Error('compile-disabled helper emitted output');
            },
        },
    };
    const before = {
        ...state,
        iflags: { ...state.iflags },
        program_state: { ...state.program_state },
    };

    assert.equal(print_vt_code(2, 17, 31, state), undefined);
    assert.equal(print_vt_soundcode_idx(9, 120, state), undefined);
    assert.deepEqual(state, before);
});

test('window-resize functions follow the wintty.c source order and build flags', () => {
    const names = ['bail', 'winch_handler', 'resize_tty', 'newclipping',
        'new_status_window'];
    const sourceNames = parseCFunctions(C_SOURCE)
        .filter(({ name }) => names.includes(name))
        .map(({ name }) => name);
    assert.deepEqual(sourceNames, names);
    assert.match(CONFIG_SOURCE, /^#define CLIPPING\s*\/\* allow smaller screens/mu);
    assert.doesNotMatch(CONFIG_SOURCE, /^#define WINCHAIN/mu);
    assert.match(C_SOURCE, /#if defined\(CLIPPING\) && !defined\(NO_SIGNAL\)/u);
});

test('startup entry points follow wintty.c source order', () => {
    const names = [
        'tty_init_nhwindows',
        'tty_preference_update',
        'tty_player_selection',
        'tty_askname',
    ];
    const sourceNames = parseCFunctions(C_SOURCE)
        .filter(({ name }) => names.includes(name))
        .map(({ name }) => name);
    assert.deepEqual(sourceNames, names);
});

test('tty_init_nhwindows creates the base descriptor and preserves banner placement', () => {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    state.iflags = { wc2_statuslines: 0 };
    initUnported();

    tty_init_nhwindows(null, null, state);

    assert.equal(state.iflags.wc2_statuslines, 2);
    assert.equal(state.iflags.cbreak, true);
    assert.equal(state.iflags.echo, false);
    assert.deepEqual(
        [state.wintty.rows, state.wintty.cols, state.wintty.BASE_WINDOW],
        [24, 80, 0],
    );
    assert.equal(state.wintty.wins[0].type, NHW_BASE);
    assert.equal(state.wintty.wins[0].active, true);
    assert.equal(
        state.nhDisplay.grid[4].map((cell) => cell.ch).join('').trimEnd(),
        'NetHack, Copyright 1985-2026',
    );
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [0, 11],
    );
    assert.deepEqual([...state.unported], []);
});

test('tty_askname keeps the source input filter behind the C entry point', async () => {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    for (const character of '1A2\u007f-ice\n')
        state.nhDisplay.pushKey(character.charCodeAt(0));
    // The C initialization cursor is row 11; this test reaches the prompt
    // through the source-named entry point rather than the compatibility name.
    tty_init_nhwindows(null, null, state);
    await tty_askname(state);
    assert.equal(state.plname, '_A-ice');
    assert.equal(state.iflags.renameallowed, true);
});

test('tty_askname preserves SELECTSAVED return paths before prompting', async () => {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    state.iflags = { wc2_selectsaved: true };
    const storage = new InMemoryStorage();
    storage.setItem('vfs:nhsave', JSON.stringify({ plname: 'saved' }));
    setStorageForTesting(storage);
    state.nhDisplay.pushKey('a'.charCodeAt(0));

    try {
        assert.deepEqual(get_saved_games(state), ['saved']);
        await tty_askname(state);
        assert.equal(state.plname, 'saved');
        assert.equal(state.iflags.renameallowed, undefined);
    } finally {
        setStorageForTesting(null);
    }
});

test('tty_preference_update preserves the common no-op and statuslines branch', () => {
    const state = resetGame();
    state.iflags = { window_inited: false, wc2_statuslines: 2 };
    initUnported();

    tty_preference_update('symset', state);
    assert.deepEqual([...state.unported], []);

    state.iflags.window_inited = true;
    state.nhDisplay = new GameDisplay(null);
    state.wintty = {
        LI: 24,
        CO: 80,
        WIN_STATUS: WIN_ERR,
    };
    tty_preference_update('statuslines', state);
    assert.equal(state.disp.botlx, true);
    assert.equal(state.wintty.clipping, false);
});

test('bail records unavailable cleanup and ends in nh_terminate', async () => {
    // wintty.c:348 nh_terminate(EXIT_SUCCESS) does not return; gameover is
    // the runner's observable nh_terminate result.
    const state = resetGame();
    initUnported();
    await expectTerminated(() => bail('stop here', state));

    assert.deepEqual([...state.unported], [
        'files.c clearlocks',
    ]);
    assert.deepEqual(state.program_state, {
        in_moveloop: 0,
        exiting: 1,
        gameover: true,
    });
    // tty_exit_nhwindows() closes the windows tty_init_nhwindows() opened.
    assert.equal(state.iflags.window_inited, false);
});

// SIGWINCH never reaches the recorder's fixed pty or the 80x24 browser
// terminal, so the port has no winch_handler() or resize_tty(), and it never
// gives WIN_STATUS a window id, so new_status_window() has no arm for an
// existing status window. The tty window port also takes no injected
// operations: each C call it makes is either ported or noted.
test('the tty window port has no resize path or injected operations', () => {
    const strip = (source) => source
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
    const wintty = strip(readFileSync('js/wintty.js', 'utf8'));
    const input = strip(readFileSync('js/input.js', 'utf8'));
    for (const source of [wintty, input]) {
        assert.doesNotMatch(source,
            /winch_handler|resize_tty|resize_pending|getwindowsz|WIN_STATUS/u);
    }
    assert.doesNotMatch(wintty, /callTerminalOperation|\benv\.\w/u);
});

test('newclipping and tty_cliparound follow wintty.c clipping arithmetic', () => {
    const state = resetGame();
    initUnported();
    // Two status lines on a 1 + ROWNO + 2 row terminal fill it exactly, so
    // newclipping() takes its unclipped arm and resets a stale clip origin
    // (9, 7 are arbitrary nonzero values).
    state.iflags = { wc2_statuslines: 2 };
    state.wintty = {
        LI: 1 + ROWNO + 2,
        CO: COLNO,
        clipping: true,
        clipx: 9,
        clipy: 7,
    };
    newclipping(12, 8, state);
    assert.deepEqual(
        [state.wintty.clipping, state.wintty.clipx, state.wintty.clipy],
        [false, 0, 0],
    );
    // Unclipped, tty_cliparound() returns at once.
    assert.equal(tty_cliparound(12, 19, state), false);

    // Three status lines on the same 24-row terminal need one row more, so
    // setclipped() runs: clipxmax = CO, clipymax = LI - 1 - 3 = 20.  The
    // hero at <12,8> is inside both margins, so the origin stays at 0,0.
    state.iflags.wc2_statuslines = 3;
    newclipping(12, 8, state);
    const clip = () => [state.wintty.clipping, state.wintty.clipx,
        state.wintty.clipy, state.wintty.clipxmax, state.wintty.clipymax];
    assert.deepEqual(clip(), [true, 0, 0, COLNO, 20]);
    // y 19 > clipymax - 2: clipymax = min(ROWNO, 20 + 20/2) = 21 and
    // clipy = 21 - 20 = 1; the origin moved, so C calls redraw_map().
    assert.equal(tty_cliparound(12, 19, state), true);
    assert.deepEqual(clip(), [true, 0, 1, COLNO, 21]);
    // y 2 < clipy + 2: clipy = max(0, 2 - (21 - 1)/2) = 0, clipymax = 20.
    assert.equal(tty_cliparound(12, 2, state), true);
    assert.deepEqual(clip(), [true, 0, 0, COLNO, 20]);
    // x 3 < clipx + 5 recomputes clipx = max(0, 3 - 20) = 0 on an 80-column
    // terminal, so the origin does not move and no redraw follows.
    assert.equal(tty_cliparound(3, 10, state), false);
    assert.deepEqual(clip(), [true, 0, 0, COLNO, 20]);
    // x 0 (no hero yet) sets the clip window without tty_cliparound().
    state.wintty.clipy = 5;
    newclipping(0, 19, state);
    assert.deepEqual(clip(), [true, 0, 0, COLNO, 20]);
    assert.deepEqual([...state.unported], []);
});

test('new_status_window clears the JavaScript status rows', () => {
    const state = resetGame();
    initUnported();
    state.disp = { botlx: false };
    // A cached two-row layout and style, as bot() leaves them; the window
    // clear must replace both.
    state._renderedStatusLayouts = [
        { text: 'old row 1', owners: [] },
        { text: 'old row 2', owners: [] },
    ];
    state._renderedStatusStyles = [[], []];
    new_status_window(state);

    // wintty.c tty_clear_nhwindow() NHW_STATUS sets disp.botlx.
    assert.equal(state.disp.botlx, true);
    // Two blank rows: wc2_statuslines is unset, which StatusRows() reads as 2.
    // recordings/wintty.c/statuslines-preference-clears-status shows C's
    // blank status rows until the next bot().
    assert.deepEqual(state._renderedStatusLayouts, [
        { text: '', owners: [] },
        { text: '', owners: [] },
    ]);
    assert.equal(state._renderedStatusStyles, null);
    assert.deepEqual([...state.unported], [
        'windows.c genl_status_finish',
        'wintty.c tty_status_init',
    ]);
});
