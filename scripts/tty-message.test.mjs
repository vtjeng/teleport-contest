import assert from 'node:assert/strict';
import test from 'node:test';

import { PLNMSG_CAUGHT_IN_EXPLOSION, PLNMSG_UNKNOWN } from '../js/const.js';
import { msgtype_parse_add } from '../js/options.js';

import { GameDisplay } from '../js/game_display.js';
import { NO_COLOR } from '../js/terminal.js';
import {
    dismissPendingTtyMessage,
    TOPLINE_EMPTY,
    TOPLINE_NEED_MORE,
    TOPLINE_NON_EMPTY,
    ttyPline,
    ttyNorep,
    ttyPutmixed,
    ttyUrgentPline,
} from '../js/tty_message.js';

function rowText(state) {
    return state.nhDisplay.grid[0].map((cell) => cell.ch).join('').trimEnd();
}

function messageState(message, toplin) {
    const state = {
        nhDisplay: new GameDisplay(null),
        iflags: { cbreak: true },
        _pending_message: message,
        _ttyToplines: message,
    };
    state.nhDisplay.toplin = toplin;
    state.nhDisplay.toplines = message;
    state.nhDisplay.putstr(0, 0, message);
    state.nhDisplay.setCursor(message.length, 0);
    return state;
}

test('ttyPline redraws a replacement after tty_nhgetch acknowledges More',
    async () => {
        // C tty_nhgetch() demotes NEED_MORE to NON_EMPTY after the key. The
        // next update_topl() then runs redotoplin(), replacing the old row;
        // logical history alone is not enough.
        const state = messageState(
            'It is mildly chilly.  Something casts a spell at you!',
            TOPLINE_NON_EMPTY,
        );

        await ttyPline('Your cap area suddenly aches very painfully!', state);

        assert.equal(
            rowText(state),
            'Your cap area suddenly aches very painfully!',
        );
        assert.equal(
            state._pending_message,
            'Your cap area suddenly aches very painfully!',
        );
        assert.equal(state._ttyToplines, state._pending_message);
        assert.equal(state.nhDisplay.toplin, TOPLINE_NEED_MORE);
    });

test('same-line append paints new bytes at the source cursor and preserves skipped cells',
    async () => {
        // win/tty/topl.c:update_topl() adds two spaces to gt.toplines, advances
        // curx by two, then addtopl() paints only the new bytes and cl_end()
        // clears the remaining row. Recorder patch 006 ignores high-bit bytes
        // but still advances the cursor, so those shadow cells stay intact.
        const state = messageState('base', TOPLINE_NEED_MORE);
        state._ttyMixedFirstCell = '─';
        state.nhDisplay.setCell(0, 0, '─', NO_COLOR, 0);
        state.nhDisplay.setCell(6, 0, 'L', 7, 4);
        state.nhDisplay.setCell(7, 0, 'M', 6, 2);
        state.nhDisplay.setCell(14, 0, 'Z', 3, 1);

        await ttyPline('éX', state);

        assert.equal(state._pending_message, `base  \0\0X`);
        assert.equal(state._ttyToplines, `base  \0\0X`);
        assert.equal(state.nhDisplay.grid[0][0].ch, '─');
        assert.equal(state.nhDisplay.grid[0][6].ch, 'L');
        assert.equal(state.nhDisplay.grid[0][6].color, 7);
        assert.equal(state.nhDisplay.grid[0][6].attr, 4);
        assert.equal(state.nhDisplay.grid[0][7].ch, 'M');
        assert.equal(state.nhDisplay.grid[0][7].color, 6);
        assert.equal(state.nhDisplay.grid[0][7].attr, 2);
        assert.equal(state.nhDisplay.grid[0][8].ch, 'X');
        assert.equal(state.nhDisplay.grid[0][14].ch, ' ');
        assert.equal(state.nhDisplay.grid[0][14].attr, 0);
        assert.equal(state.nhDisplay.cursorCol, 9);
        assert.equal(state.nhDisplay.toplin, TOPLINE_NEED_MORE);
    });

test('redotoplin preserves shadow cells for ignored high-bit bytes',
    async () => {
        // Recorder patch 006 ignores each signed high-bit byte after the
        // source putsyms() advances the cursor. Those cells retain their
        // prior attributes; redotoplin only clears after the new byte prefix.
        const state = messageState('old message', TOPLINE_NON_EMPTY);
        state.nhDisplay.setCell(3, 0, 'Z', 7, 4);
        state.nhDisplay.setCell(4, 0, 'Y', 6, 2);

        await ttyPline('abcéX', state);

        assert.equal(state.nhDisplay.grid[0][3].ch, 'Z');
        assert.equal(state.nhDisplay.grid[0][3].color, 7);
        assert.equal(state.nhDisplay.grid[0][3].attr, 4);
        assert.equal(state.nhDisplay.grid[0][4].ch, 'Y');
        assert.equal(state.nhDisplay.grid[0][4].color, 6);
        assert.equal(state.nhDisplay.grid[0][4].attr, 2);
        assert.equal(state.nhDisplay.grid[0][5].ch, 'X');
    });

test('Escape More clears the physical row but keeps WIN_STOP history state',
    async () => {
        const state = messageState(
            'It is mildly chilly.  Something casts a spell at you!',
            TOPLINE_NEED_MORE,
        );
        state.nhDisplay.pushKey(27);

        assert.equal(
            await dismissPendingTtyMessage(state, { returnResponse: true }),
            27,
        );
        assert.equal(state.nhDisplay.toplin, TOPLINE_EMPTY);
        assert.equal(rowText(state), '');
        assert.equal(state._ttyMessageStopped, true);
        assert.equal(
            state._ttyToplines,
            'It is mildly chilly.  Something casts a spell at you!',
        );

        await ttyPline('Your movements are now unencumbered.', state);
        assert.equal(rowText(state), '');
    assert.equal(
        state._ttyToplines,
        'Your movements are now unencumbered.',
    );
});

test('urgent output clears Escape suppression before updating history',
    async () => {
        const state = messageState(
            'It is mildly chilly.  Something casts a spell at you!',
            TOPLINE_NEED_MORE,
        );
        state.nhDisplay.pushKey(27);
        await dismissPendingTtyMessage(state);
        assert.equal(state._ttyMessageStopped, true);
        assert.equal(rowText(state), '');

        // polyself.c:200-232 calls urgent_pline() from polyman(). Its
        // wintty.c:2277-2283 arm clears WIN_STOP and the physical line before
        // replacing it; an ordinary pline would keep this message hidden.
        await ttyUrgentPline('You return to human form!', state);
        assert.equal(state._ttyMessageStopped, false);
        assert.equal(state._pending_message, 'You return to human form!');
        assert.equal(state.nhDisplay.toplin, TOPLINE_NEED_MORE);
    });

// pline.c:vpline clears iflags.last_msg after putmesg, before MSGTYP_STOP,
// but its empty-line and MSGTYPE early returns preserve the caller's marker.
test('vpline clears last_msg after replacement, append and WIN_STOP output', async () => {
    for (const mode of ['replacement', 'append', 'stopped']) {
        const state = messageState(mode === 'append' ? 'old' : '', TOPLINE_NEED_MORE);
        state.iflags.last_msg = PLNMSG_CAUGHT_IN_EXPLOSION;
        state._ttyMessageStopped = mode === 'stopped';
        await ttyPline('Your cloak smoulders!', state);
        assert.equal(state.iflags.last_msg, PLNMSG_UNKNOWN, mode);
    }
});

test('vpline preserves last_msg for empty, hidden and repeated messages', async () => {
    const state = messageState('', TOPLINE_EMPTY);
    state.iflags.last_msg = PLNMSG_CAUGHT_IN_EXPLOSION;
    await ttyPline('', state); // C returns before output for an empty format.
    assert.equal(state.iflags.last_msg, PLNMSG_CAUGHT_IN_EXPLOSION);
    state.gp = { plinemsg_types: null };
    assert.equal(msgtype_parse_add(state, 'hide "Your cloak smoulders!"'), true);
    await ttyPline('Your cloak smoulders!', state);
    assert.equal(state.iflags.last_msg, PLNMSG_CAUGHT_IN_EXPLOSION);
    state._ttyPreviousMessage = 'You are caught in the fireball!';
    await ttyNorep(state._ttyPreviousMessage, state);
    assert.equal(state.iflags.last_msg, PLNMSG_CAUGHT_IN_EXPLOSION);
});

test('raw mixed window output bypasses vpline last_msg reset', async () => {
    // pager.c:do_look uses putmixed rather than pline; its leading symbol is
    // window output and does not change iflags.last_msg.
    const state = messageState('', TOPLINE_EMPTY);
    state.iflags.last_msg = PLNMSG_CAUGHT_IN_EXPLOSION;
    await ttyPutmixed('@  a human', '@', state);
    assert.equal(state.iflags.last_msg, PLNMSG_CAUGHT_IN_EXPLOSION);
});

test('vpline updates only the supplied state last_msg', async () => {
    const live = messageState('', TOPLINE_EMPTY);
    live.iflags.last_msg = PLNMSG_CAUGHT_IN_EXPLOSION;
    const clone = { ...live, iflags: structuredClone(live.iflags), nhDisplay: new GameDisplay(null) };
    await ttyPline('Your cloak smoulders!', clone);
    assert.equal(clone.iflags.last_msg, PLNMSG_UNKNOWN);
    assert.equal(live.iflags.last_msg, PLNMSG_CAUGHT_IN_EXPLOSION);
});

// vpline resets after putmesg's wrapped-line input, but before its own
// MSGTYP_STOP display. Pin both awaited boundaries to the same source order.
test('last_msg reset brackets wrapped output and explicit MSGTYPE stop input', async () => {
    for (const stopRule of [false, true]) {
        const state = messageState('', TOPLINE_EMPTY);
        const message = stopRule ? 'Stop here.' : 'x'.repeat(90);
        // Ninety bytes exceed the eighty-column TTY row and force putmesg's
        // wrapped More; the short stop rule instead blocks after vpline reset.
        state.iflags.last_msg = PLNMSG_CAUGHT_IN_EXPLOSION;
        if (stopRule) {
            state.gp = { plinemsg_types: null };
            assert.equal(msgtype_parse_add(state, 'stop "Stop here."'), true);
        }
        const observed = [];
        state._preNhgetchHook = () => observed.push(state.iflags.last_msg);
        state.nhDisplay.pushKey(32); // Space dismisses the source More prompt.
        await ttyPline(message, state);
        assert.deepEqual(observed, [stopRule ? PLNMSG_UNKNOWN : PLNMSG_CAUGHT_IN_EXPLOSION]);
        assert.equal(state.iflags.last_msg, PLNMSG_UNKNOWN);
    }
});
