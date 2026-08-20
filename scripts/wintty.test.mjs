import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_MSG_HISTORY, NHW_MESSAGE, NHW_STATUS } from '../js/const.js';
import { tty_create_nhwindow } from '../js/wintty.js';

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

test('tty_create_nhwindow stops before unported window types', () => {
    const state = { iflags: { msg_history: 37 } };
    assert.throws(
        () => tty_create_nhwindow(NHW_STATUS, state),
        /only ports the NHW_MESSAGE startup branch/u,
    );
    assert.equal(state.iflags.msg_history, 37);
});
