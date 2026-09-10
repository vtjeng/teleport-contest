import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MAX_MSG_HISTORY, NHW_MESSAGE, NHW_STATUS } from '../js/const.js';
import {
    print_vt_code,
    print_vt_soundcode_idx,
    tty_create_nhwindow,
} from '../js/wintty.js';

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

test('tty_create_nhwindow stops before unported window types', () => {
    const state = { iflags: { msg_history: 37 } };
    assert.throws(
        () => tty_create_nhwindow(NHW_STATUS, state),
        /only ports the NHW_MESSAGE startup branch/u,
    );
    assert.equal(state.iflags.msg_history, 37);
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
