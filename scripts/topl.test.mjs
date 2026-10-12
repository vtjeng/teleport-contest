// Source-pinned tests for the TTY message-history ring and its snapshot API.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    NHW_MESSAGE,
    SUPPRESS_HISTORY,
    WIN_LOCKHISTORY,
} from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { tty_create_nhwindow } from '../js/wintty.js';
import {
    free_msghistory_snapshot,
    msghistory_snapshot,
    remember_topl,
    tty_getmsghistory,
    tty_putmsghistory,
} from '../js/topl.js';
import { ttyCustomPline } from '../js/tty_message.js';

function historyState() {
    const state = {
        iflags: { msg_history: 20, cbreak: true },
        nhDisplay: new GameDisplay(null),
        program_state: {},
        wintty: { wins: [] },
    };
    tty_create_nhwindow(NHW_MESSAGE, state);
    return state;
}

test('remember_topl advances the C message ring and respects its lock', () => {
    const state = historyState();
    const win = state.wintty.wins[state.wintty.messageWindow];
    state._ttyToplines = 'first';
    remember_topl(state);
    assert.equal(win.data[0], 'first');
    assert.equal(win.maxrow, 1);
    assert.equal(win.maxcol, 1);
    assert.equal(state._ttyToplines, '');

    win.flags |= WIN_LOCKHISTORY;
    state._ttyToplines = 'locked';
    remember_topl(state);
    assert.equal(win.data[1], null);
    assert.equal(state._ttyToplines, 'locked');
});

test('save snapshots read oldest first and restore puts prior-session lines first', () => {
    const state = historyState();
    state._ttyToplines = 'current session';
    remember_topl(state);
    state._ttyToplines = 'current topline';

    assert.deepEqual(msghistory_snapshot(false, state), [
        'current session', 'current topline',
    ]);
    assert.equal(
        tty_getmsghistory(true, state),
        'current session',
    );
    assert.equal(tty_getmsghistory(false, state), 'current topline');
    assert.equal(tty_getmsghistory(false, state), null);
    free_msghistory_snapshot(false, state);

    tty_putmsghistory('prior one', true, state);
    tty_putmsghistory('prior two', true, state);
    tty_putmsghistory(null, true, state);
    const win = state.wintty.wins[state.wintty.messageWindow];
    assert.deepEqual(win.data.slice(0, 3), [
        'prior one', 'prior two', 'current session',
    ]);
});

test('SUPPRESS_HISTORY shows feedback but keeps it out of Ctrl-P history', async () => {
    const state = historyState();
    state._ttyToplines = 'previous message';
    state.nhDisplay.toplines = 'previous message';

    await ttyCustomPline('Unknown command', SUPPRESS_HISTORY, state);

    const win = state.wintty.wins[state.wintty.messageWindow];
    assert.equal(win.data[0], 'previous message');
    assert.equal(win.maxrow, 1);
    assert.equal(state._ttyToplines, '');
    assert.equal(state._pending_message, 'Unknown command');
    assert.equal(state.nhDisplay.grid[0][0].ch, 'U');
    assert.equal(state.nhDisplay.grid[0][0].color, 8);
});
