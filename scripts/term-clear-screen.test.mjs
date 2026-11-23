// js/wintty.js term_clear_screen() is the port's only whole-terminal erase,
// as termcap.c term_clear_screen() is C's: erase_tty_screen() resets every
// active window there, so a caller that clears the grid itself leaves the
// message window, disp.botlx and the base window's cursor behind.
//
// The scan fails when any other function under js/ calls clearScreen(), or
// loops clearRow() over every terminal row, outside the exceptions below.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { NHW_MAP, NHW_MESSAGE } from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { resetGame } from '../js/gstate.js';
import { TOPLINE_EMPTY, TOPLINE_NEED_MORE } from '../js/tty_message.js';
import { initUnported } from '../js/unported.js';
import {
    baseWindow,
    term_clear_screen,
    tty_create_nhwindow,
    tty_init_nhwindows,
    tty_status_state,
} from '../js/wintty.js';

const JS = new URL('../js/', import.meta.url);

// The primitives: the scorer replaces js/terminal.js, which defines
// Terminal.clearScreen(), and js/game_display.js defines
// GameDisplay.clearScreen() as a clearRow() loop.
const SKIPPED_FILES = new Set(['terminal.js', 'game_display.js']);

// `file function`: why the call is not C's term_clear_screen().
const EXCEPTIONS = new Map([
    ['wintty.js term_clear_screen', 'the one erase itself'],
    ['tty_rawprint.js nomux_enter_raw_mode',
        'patch 006 nomux_clear_screen() as nomux_raw_emit() calls it: it '
        + 'blanks the recorder\'s shadow screen alone, and no tty window '
        + 'changes'],
    ['display.js _buildScreenOutput',
        'the port\'s flush_screen() repaints the whole grid from the glyph '
        + 'buffer; C erases nothing there, and the function restores the '
        + 'message, status and cursor it found'],
]);
// One call in each excepted function. Lower the count when one goes; give
// a new exception a reason above.
const EXCEPTION_CALLS = 3;

// The name of the function a source offset lies in: the nearest preceding
// declaration that starts in column 0, which is how js/ declares functions.
function enclosingFunction(text, offset) {
    const head = text.slice(0, offset);
    const declarations = [...head.matchAll(
        /^(?:export )?(?:async )?function\*? (\w+)/gmu,
    )];
    return declarations.at(-1)?.[1] ?? '(top level)';
}

function clearScreenCalls() {
    const calls = [];
    for (const file of readdirSync(JS).filter((name) => name.endsWith('.js'))) {
        if (SKIPPED_FILES.has(file)) continue;
        // Blank each line comment, keeping offsets: comments name the call.
        const text = readFileSync(new URL(file, JS), 'utf8')
            .replace(/\/\/.*$/gmu, (comment) => ' '.repeat(comment.length));
        // Any spelling of a call: display.clearScreen(), display?.clearScreen(),
        // display.clearScreen?.(), terminal.clearScreen().
        for (const match of text.matchAll(/[.?]clearScreen\s*(?:\?\.)?\(/gu))
            calls.push(`${file} ${enclosingFunction(text, match.index)}`);
        // A loop that clears every row is the same erase written out.
        for (const match of text.matchAll(
            /for \(let \w+ = 0; \w+ < [\w.?]*\.rows;[^)]*\)\s*\{?\s*[\w.?]*clearRow\(/gu,
        )) calls.push(`${file} ${enclosingFunction(text, match.index)}`);
    }
    return calls.sort();
}

test('only term_clear_screen() erases the whole terminal', () => {
    const calls = clearScreenCalls();
    const outside = calls.filter((site) => !EXCEPTIONS.has(site));
    assert.deepEqual(outside, [],
        'call js/wintty.js term_clear_screen() instead of clearScreen()');
    const excepted = calls.filter((site) => EXCEPTIONS.has(site));
    assert.equal(excepted.length, EXCEPTION_CALLS);
    assert.deepEqual([...new Set(excepted)].sort(), [...EXCEPTIONS.keys()].sort());
});

function startedState() {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    initUnported();
    tty_init_nhwindows(null, null, state);
    return state;
}

test('term_clear_screen() leaves inactive windows alone', () => {
    // restore.c restore_menu() runs before init_sound_disp_gamewindows():
    // the message window does not exist, so only BASE_WINDOW is active.
    const state = startedState();
    const display = state.nhDisplay;
    // An arbitrary cell, cursor and base-window row to be erased and reset.
    display.putstr(3, 5, 'x', 7);
    display.setCursor(9, 9);
    baseWindow(state).cury = 11;
    state.disp = { botlx: false };
    // wintty.c:1047: TOPLINE_NEED_MORE would be reset by an active message
    // window; without one it must survive.
    display.toplin = TOPLINE_NEED_MORE;

    term_clear_screen(state);

    assert.equal(display.grid[5][3].ch, ' ');
    assert.deepEqual([display.cursorCol, display.cursorRow], [0, 0]);
    assert.deepEqual([baseWindow(state).curx, baseWindow(state).cury], [0, 0]);
    assert.equal(state.disp.botlx, false);
    assert.equal(display.toplin, TOPLINE_NEED_MORE);
});

test('term_clear_screen() resets the active message and map windows', () => {
    const state = startedState();
    const display = state.nhDisplay;
    const id = tty_create_nhwindow(NHW_MESSAGE, state);
    const message = state.wintty.wins[id];
    message.active = true;
    // wintty.c:1047-1056 with erasing_tty_screen set: a two-row top line
    // (cury 1) waiting for --More-- is retired without one.
    message.curx = 7;
    message.cury = 1;
    display.toplin = TOPLINE_NEED_MORE;
    state._pending_message = 'pending';
    state.disp = { botlx: false };
    // A status cell on the terminal and its cw->data character. The terminal
    // cell goes. The status window is inactive until status_initialize(FALSE)
    // sets gb.blinit, so its data survives this first erase (wintty.c:2050).
    const status = tty_status_state(state);
    status.data[0][0] = 'D';
    status.screen[0][0] = { ch: 'D', color: 7, attr: 0, owner: null };
    // tty_status[BEFORE][] and finalx[][] are not reset by either erase.
    status.before.set('hp', { x: 1, y: 0, lth: 2, style: null });
    status.finalx[0] = 5;

    term_clear_screen(state);

    assert.equal(display.toplin, TOPLINE_EMPTY);
    assert.deepEqual([message.curx, message.cury], [0, 0]);
    assert.equal(state._pending_message, '');
    // wintty.c:1074-1076, the map arm.
    assert.equal(state.disp.botlx, true);
    assert.equal(status.screen[0][0], null);
    assert.equal(status.data[0][0], 'D');

    // wintty.c:1059-1072 with erasing_tty_screen set, once the window is
    // active: cw->data becomes spaces and disp.botlx is set.
    state.gb = { ...state.gb, blinit: true };
    message.active = false;
    state.disp.botlx = false;
    term_clear_screen(state);
    assert.equal(status.data[0][0], ' ');
    assert.equal(state.disp.botlx, true);
    assert.equal(status.before.get('hp').lth, 2);
    assert.equal(status.finalx[0], 5);
});

test('erase_tty_screen() is skipped after a hangup', () => {
    const state = startedState();
    const id = tty_create_nhwindow(NHW_MAP, state);
    state.wintty.wins[id].active = true;
    // An arbitrary nonzero row; HUPSKIP() (wintty.c:2041) returns before
    // tty_curs(BASE_WINDOW, 1, 0) can zero it.
    baseWindow(state).cury = 4;
    state.disp = { botlx: false };
    state.program_state = { ...state.program_state, done_hup: 1 };

    term_clear_screen(state);

    assert.equal(state.disp.botlx, false);
    assert.equal(baseWindow(state).cury, 4);
});
