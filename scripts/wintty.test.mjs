import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { parse, tokenizer } from 'acorn';

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
import { savefileKey } from './test-fixtures/savefile-key.mjs';
import { status_initialize } from '../js/display.js';
import { GameDisplay } from '../js/game_display.js';
import { get_saved_games } from '../js/files.js';
import { parseCFunctions } from './c-functions.mjs';
import { expectTerminated } from './expect-terminated.mjs';
import {
    bail,
    baseWindow,
    new_status_window,
    newclipping,
    print_vt_code,
    print_vt_soundcode_idx,
    tty_create_nhwindow,
    tty_curs,
    tty_askname,
    tty_clear_base_window,
    tty_cliparound,
    tty_init_nhwindows,
    tty_preference_update,
    tty_putstr_base,
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
        const state = {
            iflags: { msg_history: configured },
            nhDisplay: new GameDisplay(null),
        };
        tty_create_nhwindow(NHW_MESSAGE, state);
        assert.equal(state.iflags.msg_history, normalized, `${configured}`);
    }
});

// C ref: win/tty/wintty.c tty_create_nhwindow() NHW_MESSAGE arm (885-895)
// and the allocation after the switch (939-955).
test('tty_create_nhwindow gives the message window C geometry', () => {
    // A 24x80 GameDisplay: the message window must not copy its 80 columns.
    const state = {
        iflags: { msg_history: 37 },
        nhDisplay: new GameDisplay(null),
    };
    const id = tty_create_nhwindow(NHW_MESSAGE, state);
    const window = state.wintty.wins[id];
    assert.deepEqual(
        [window.offx, window.offy, window.rows, window.cols,
            window.maxrow, window.maxcol],
        // wintty.c:887 zeroes offx and offy; :893 sets rows to the
        // normalized msg_history (37 is inside 20..MAX_MSG_HISTORY, so it is
        // kept); :894 sets maxcol and cols to 0; :953-954 reset maxrow to 0
        // after allocating 37 history slots.
        [0, 0, 37, 0, 0, 0],
    );
    // wintty.c:944-952: one null line and a zero length per history slot.
    assert.deepEqual(window.data, Array(37).fill(null));
    assert.deepEqual(window.datlen, Array(37).fill(0));
    assert.equal(state.wintty.messageWindow, id);
    // The source lines the comments above cite.
    assert.match(C_SOURCE, /newwin->maxrow = newwin->rows = iflags\.msg_history;\n\s*newwin->maxcol = newwin->cols = 0;/u);
    assert.match(C_SOURCE, /if \(newwin->type == NHW_MESSAGE\)\n\s*newwin->maxrow = 0;/u);
});

test('tty_create_nhwindow keeps the unbuffered map geometry', () => {
    const state = { nhDisplay: new GameDisplay(null) };
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
    const state = {
        iflags: { msg_history: 37 },
        nhDisplay: new GameDisplay(null),
    };
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
        [state.wintty.wins[0].curx, state.wintty.wins[0].cury,
            display.cursorCol, display.cursorRow],
        [11, 8, 12, 11],
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
    // C's ttyDisplay fields live on the display; state.wintty holds only
    // the window table and window ids.
    assert.deepEqual(Object.keys(state.wintty).sort(), ['BASE_WINDOW', 'wins']);
    assert.equal(state.wintty.BASE_WINDOW, 0);
    // tty_create_nhwindow(NHW_BASE) copies ttyDisplay->rows and cols, the
    // 24x80 GameDisplay's size.
    assert.deepEqual(
        [state.wintty.wins[0].rows, state.wintty.wins[0].cols],
        [24, 80],
    );
    assert.equal(state.wintty.wins[0].type, NHW_BASE);
    assert.equal(state.wintty.wins[0].active, true);
    // wintty.c:538-544 zeroes these ttyDisplay fields; the port keeps them on
    // the display that its readers use.
    assert.deepEqual(
        ['toplin', 'inmore', 'inread', 'intr', 'dismiss_more']
            .map((field) => state.nhDisplay[field]),
        [0, 0, 0, 0, 0],
    );
    assert.equal(
        state.nhDisplay.grid[4].map((cell) => cell.ch).join('').trimEnd(),
        'NetHack, Copyright 1985-2026',
    );
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [0, 11],
    );
    // wintty.c:583 tty_curs(BASE_WINDOW, 1, 11): curx is x - 1.
    assert.deepEqual(
        [baseWindow(state).curx, baseWindow(state).cury],
        [0, 11],
    );
    assert.deepEqual([...state.unported], []);
});

// C ref: wintty.c tty_putstr() NHW_BASE arm (2348-2363) and
// erase_tty_screen()'s tty_curs(BASE_WINDOW, 1, 0) (2053), the base-window
// writes restore.c restore_menu() makes.
test('BASE_WINDOW row lives in wins[BASE_WINDOW].cury', () => {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    initUnported();
    tty_init_nhwindows(null, null, state);

    tty_clear_base_window(state);
    assert.deepEqual([baseWindow(state).curx, baseWindow(state).cury], [0, 0]);
    // Two short lines: each goes on cury from column 0, leaves the terminal
    // cursor after its text and advances cury by one.
    tty_putstr_base('ab', state);
    tty_putstr_base('cde', state);
    assert.deepEqual(
        state.nhDisplay.grid.slice(0, 2)
            .map((row) => row.map((cell) => cell.ch).join('').trimEnd()),
        ['ab', 'cde'],
    );
    assert.deepEqual([baseWindow(state).curx, baseWindow(state).cury], [0, 2]);
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [3, 1],
    );
    assert.match(C_SOURCE, /case NHW_BASE:\n\s*tty_curs\(window, cw->curx \+ 1, cw->cury\);/u);
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
    // A normal-play save of a neutral female human Valkyrie: the header text
    // plname_from_file() rebuilds is "saved-Val-Hum-Fem-Neu".
    storage.setItem(savefileKey({ plname: 'saved' }), JSON.stringify({
        plname: 'saved',
        urole: { filecode: 'Val' },
        urace: { filecode: 'Hum' },
        flags: { female: true },
        u: { ualign: { type: 0 } },
    }));
    setStorageForTesting(storage);
    state.nhDisplay.pushKey('a'.charCodeAt(0));

    try {
        assert.deepEqual(
            get_saved_games(state).map((entry) => entry.split('\0')[0]),
            ['saved-Val-Hum-Fem-Neu'],
        );
        await tty_askname(state);
        // restore_menu() copies the whole header text; plnamesuffix() later
        // splits the suffix off.
        assert.equal(state.plname, 'saved-Val-Hum-Fem-Neu');
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
    // A 24x80 terminal, 1 + ROWNO + 2 rows, needs no clipping with two
    // status lines.
    state.nhDisplay = new GameDisplay(null);
    // botl.c status_initialize(FALSE) ran at startup; new_status_window()'s
    // REASSESS_ONLY call panics without it.
    status_initialize(state, false);
    state.gu.update_all = false;
    tty_preference_update('statuslines', state);
    assert.equal(state.disp.botlx, true);
    assert.equal(state.gu.update_all, true);
    assert.equal(state.wintty.clipping, false);
});

test('bail ends in nh_terminate', async () => {
    // wintty.c:348 nh_terminate(EXIT_SUCCESS) does not return; gameover is
    // the runner's observable nh_terminate result.
    const state = resetGame();
    initUnported();
    await expectTerminated(() => bail('stop here', state));

    // clearlocks() deletes host lock files only; nothing is recorded.
    assert.deepEqual([...state.unported], []);
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
    state.nhDisplay = new GameDisplay(null);
    assert.deepEqual(
        [state.nhDisplay.rows, state.nhDisplay.cols],
        [1 + ROWNO + 2, COLNO],
    );
    state.wintty = {
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
    status_initialize(state, false); // startup's full status initialization
    state.disp.botlx = false;
    state.gu.update_all = false;
    // One raw_print() since the last window display; genl_status_init()'s
    // display_nhwindow(WIN_STATUS) clears the count (wintty.c:1868).
    state.nhDisplay = { nomuxRaw: { rawprint: 1 } };
    new_status_window(state);
    assert.equal(state.nhDisplay.nomuxRaw.rawprint, 0);

    // wintty.c tty_clear_nhwindow() NHW_STATUS sets disp.botlx, and
    // status_initialize(REASSESS_ONLY) sets gu.update_all so the next bot()
    // drops temporary highlights.
    assert.equal(state.disp.botlx, true);
    assert.equal(state.gu.update_all, true);
    // Two blank rows: wc2_statuslines is unset, which StatusRows() reads as 2.
    // recordings/wintty.c/statuslines-preference-clears-status shows C's
    // blank status rows until the next bot().
    assert.deepEqual(state._renderedStatusLayouts, [
        { text: '', owners: [] },
        { text: '', owners: [] },
    ]);
    assert.equal(state._renderedStatusStyles, null);
    assert.deepEqual([...state.unported], []);
});

// state.wintty holds the tty port's window state: wintty.c's window table,
// BASE_WINDOW and clipping variables, and decl.c's WIN_MAP and WIN_MESSAGE. C's struct DisplayDesc *ttyDisplay (wintty.h) is the
// GameDisplay (state.nhDisplay): its rows, cols, curx and cury are the
// display's rows, cols, cursorCol and cursorRow, and toplin, inmore, inread,
// intr and dismiss_more are fields on it. A ttyDisplay field copied onto
// state.wintty would be a second place for one C value, so every property
// read or written through state.wintty, or through a `wt` alias of it, in
// js/ and scripts/ must be one of these C values. Add a field here only for
// a C window-port value that is not in DisplayDesc.
const WINTTY_FIELDS = new Map([
    ['wins', 'wins[MAXWIN]'],
    ['BASE_WINDOW', 'BASE_WINDOW'],
    ['WIN_MAP', 'WIN_MAP (decl.c)'],
    ['messageWindow', 'WIN_MESSAGE (decl.c)'],
    ['clipping', 'clipping (CLIPPING)'],
    ['clipx', 'clipx (CLIPPING)'],
    ['clipy', 'clipy (CLIPPING)'],
    ['clipxmax', 'clipxmax (CLIPPING)'],
    ['clipymax', 'clipymax (CLIPPING)'],
]);

test('state.wintty holds only window state, not ttyDisplay fields', () => {
    // A property reached through any object's wintty member, or through a
    // wt variable, with or without optional chaining. Requiring an
    // identifier and a dot before wintty keeps file names such as wintty.c
    // in comments and strings out of the match.
    const access = /(?:\b\w+\.wintty|\bwt)\??\.([A-Za-z_]\w*)/gu;
    const offenders = [];
    let accesses = 0;
    for (const dir of ['js', 'scripts']) {
        for (const name of readdirSync(dir)) {
            if (!/\.m?js$/u.test(name)) continue;
            const lines = readFileSync(`${dir}/${name}`, 'utf8').split('\n');
            lines.forEach((line, index) => {
                for (const [, field] of line.matchAll(access)) {
                    accesses += 1;
                    if (!WINTTY_FIELDS.has(field))
                        offenders.push(`${dir}/${name}:${index + 1} ${field}`);
                }
            });
        }
    }
    assert.deepEqual(offenders, []);
    // The scan finds 124 accesses on 2026-11-20, mostly the window table's
    // readers. A floor of 50 leaves room for refactoring but fails if the
    // pattern stops matching, so the check cannot pass by finding nothing.
    assert.ok(accesses > 50, `only ${accesses} state.wintty accesses found`);

    // ttyDisplay->curx and cury are the display's cursorCol and cursorRow;
    // a curx or cury property on the display would be a second cursor.
    const displayCursor = /\b(?:display|nhDisplay)\??\.(?:curx|cury)\b/u;
    // The message window's flags are wins[messageWindow].flags; a
    // message-window field on the display, such as the starter skeleton's
    // unread messageWinFlags, would be a second copy.
    const messageWindowCopy = /\b(?:display|nhDisplay|this)\??\.messageWin\w*/u;
    // BASE_WINDOW's row is wins[BASE_WINDOW].cury (baseWindow()); a _ttyBase*
    // or _tty*Cursor* property, such as the former `_ttyBaseCursorRow` on
    // the game state, would be a second copy.
    const ttyCursorCopy = /\._tty(?:Base|\w*Cursor)/u;
    const cursorCopies = [];
    const messageWindowCopies = [];
    for (const dir of ['js', 'scripts']) {
        for (const name of readdirSync(dir)) {
            if (!/\.m?js$/u.test(name)) continue;
            readFileSync(`${dir}/${name}`, 'utf8').split('\n').forEach((line, index) => {
                const where = `${dir}/${name}:${index + 1}`;
                if (dir === 'js' && displayCursor.test(line)) cursorCopies.push(where);
                if (ttyCursorCopy.test(line)) cursorCopies.push(where);
                if (dir === 'js' && messageWindowCopy.test(line))
                    messageWindowCopies.push(where);
            });
        }
    }
    assert.deepEqual(cursorCopies, []);
    assert.deepEqual(messageWindowCopies, []);
});

// wintty.h keeps the message window's stop state in cw->flags: WIN_STOP
// (Escape at --More-- suppresses later messages until the next input),
// WIN_NOSTOP (an urgent message's one-shot exemption) and WIN_CANCELLED
// (the same bit as WIN_STOP, read by tty_display_nhwindow()). The port
// keeps all three in wins[messageWindow].flags. Until 2026-11-21 WIN_STOP
// lived in a separate game-state boolean beside the flags word, with
// a pline argument carrying a second copy of WIN_NOSTOP into more().
test('the message window stop bits live only in its flags word', () => {
    const STOP_BITS = new Set(['WIN_STOP', 'WIN_NOSTOP', 'WIN_CANCELLED']);
    // A separately named stop or cancel state: _tty...Stop..., a
    // message...Stop... or an ...Escape...Stop... identifier.
    const separateStop = /^(?:_tty\w*|\w*[Mm]essage\w*|\w*Escape\w*)(?:Stop|Cancel)/u;
    const separate = [];
    for (const dir of ['js', 'scripts']) {
        for (const name of readdirSync(dir)) {
            if (!/\.m?js$/u.test(name)) continue;
            const source = readFileSync(`${dir}/${name}`, 'utf8');
            for (const token of tokenizer(source, {
                ecmaVersion: 'latest', sourceType: 'module', locations: true,
                allowHashBang: true,
            })) {
                if (token.type.label === 'name' && separateStop.test(token.value))
                    separate.push(`${dir}/${name}:${token.loc.start.line} ${token.value}`);
            }
        }
    }
    assert.deepEqual(separate, []);

    // Every expression that names a stop bit in js/ must read or write a
    // .flags member: the bit has no meaning outside the flags word. An
    // expression is the outermost chain of operators, assignments and
    // conditionals around the constant.
    const OPERATORS = new Set([
        'BinaryExpression', 'LogicalExpression', 'AssignmentExpression',
        'UnaryExpression', 'ConditionalExpression', 'ChainExpression',
    ]);
    const hasFlagsMember = (node) => {
        if (!node || typeof node.type !== 'string') return false;
        if (node.type === 'MemberExpression' && !node.computed
            && node.property.name === 'flags') return true;
        return Object.values(node).some((child) => (Array.isArray(child)
            ? child.some(hasFlagsMember) : hasFlagsMember(child)));
    };
    const outsideFlags = [];
    let sites = 0;
    const visit = (node, ancestors, where) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'Identifier' && STOP_BITS.has(node.name)) {
            const parent = ancestors.at(-1);
            // An import or export specifier, or const.js's definition.
            const declaration = ['ImportSpecifier', 'ExportSpecifier']
                .includes(parent?.type)
                || (parent?.type === 'VariableDeclarator' && parent.id === node);
            if (!declaration) {
                sites += 1;
                let top = node;
                for (let i = ancestors.length - 1;
                    i >= 0 && OPERATORS.has(ancestors[i].type); --i)
                    top = ancestors[i];
                if (!hasFlagsMember(top))
                    outsideFlags.push(`${where(node)} ${node.name}`);
            }
        }
        ancestors.push(node);
        for (const [key, child] of Object.entries(node)) {
            if (key === 'loc') continue;
            if (Array.isArray(child)) child.forEach((c) => visit(c, ancestors, where));
            else if (child && typeof child.type === 'string') visit(child, ancestors, where);
        }
        ancestors.pop();
    };
    for (const name of readdirSync('js')) {
        if (!name.endsWith('.js')) continue;
        const ast = parse(readFileSync(`js/${name}`, 'utf8'), {
            ecmaVersion: 'latest', sourceType: 'module', locations: true,
        });
        visit(ast, [], (node) => `js/${name}:${node.loc.start.line}`);
    }
    assert.deepEqual(outsideFlags, []);
    // The C stop-bit sites in topl.c, getline.c and wintty.c that the port
    // models, counted as constant references on 2026-11-21:
    //   topl.c show_topl():150-153                         5 (topl.js)
    //   topl.c more():233-234                              2 (tty_message.js)
    //   topl.c update_topl()'s skip (257) and "You die"
    //     clear (299), skip read in both its JS halves     3
    //   topl.c tty_yn_function():390-393                   5
    //   getline.c hooked_tty_getlin():53-55                2
    //   wintty.c tty_display_nhwindow()'s WIN_CANCELLED
    //     return (1865), where the port displays WIN_MESSAGE:
    //     displayPendingTtyMessageWindow(), cls(), the
    //     legacy text window and three tty_menu.js windows 6
    //   wintty.c tty_putstr()'s urgent arm (2278-2282) and
    //     one-shot clear (2300), which the port makes on
    //     both of its write paths                          4
    //   wintty.c tty_message_menu():2843                   1
    //   wintty.c tty_nhgetch():4066                        1
    // Pinned in both directions: a new reader or writer must be counted
    // here, and a lost one means a C site stopped being modelled.
    assert.equal(sites, 29);
});
