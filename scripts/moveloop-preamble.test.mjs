import assert from 'node:assert/strict';
import test from 'node:test';

import { NORMAL_SPEED } from '../js/const.js';
import { flush_screen } from '../js/display.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { nhgetch } from '../js/input.js';
import {
    change_luck,
    moveloop_preamble,
} from '../js/moveloop_preamble.js';
import {
    enableRngLog,
    getRngLog,
    initRng,
} from '../js/rng.js';
import { maybe_do_tutorial } from '../js/tutorial_startup.js';
import {
    dismissPendingTtyMessage,
    ttyPline,
} from '../js/tty_message.js';

function preambleState(datetime, keys = '') {
    resetGame();
    game.fixedDatetime = datetime;
    // Fresh recordings preserve the recorder process's tm_isdst bit.  True
    // exercises the canonical contest-session setting.
    game.recorderIsDst = true;
    game.nhDisplay = new GameDisplay(null);
    game.flags = {};
    game.iflags = {
        menu_overlay: true,
        menu_headings: { attr: 1, color: 8 },
    };
    game.program_state = {};
    game.context = { move: 17 };
    game.disp = {};
    game.u = {
        uluck: 0,
        umovement: 0,
        uz: { dnum: 3, dlevel: 8 },
        // A distinct dungeon number proves that allmain.c only copies dlevel.
        uz0: { dnum: 9, dlevel: 2 },
    };
    // This arbitrary seed is unrelated to development recordings.
    initRng(618033);
    enableRngLog();
    for (const ch of keys) game.nhDisplay.pushKey(ch.charCodeAt(0));
    return game;
}

function rowText(state, row) {
    return state.nhDisplay.grid[row]
        .map((cell) => cell.ch).join('').trimEnd();
}

function captureBoundaries(state, rowCount = 8) {
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        rows: Array.from({ length: rowCount }, (_, row) => rowText(state, row)),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        rng: [...getRngLog()],
    });
    return boundaries;
}

test('ordinary new-game preamble owns its RNG draws and basic state', async () => {
    // 2026-01-29 has phase 3 and is not Friday the 13th, so no message input
    // obscures the state and PRNG assertions in this case.
    const state = preambleState('20260129120000');
    state.iflags.fuzzerpending = true;
    state.track = { stale: true };

    await moveloop_preamble(false, state);

    assert.equal(state.flags.moonphase, 3);
    assert.equal(state.flags.friday13, false);
    assert.deepEqual(
        getRngLog().map((entry) => entry.slice(0, entry.indexOf('='))),
        ['rnd(9000)', 'rnd(30)'],
    );
    assert.equal(
        state.context.rndencode,
        Number(getRngLog()[0].split('=').at(-1)),
    );
    assert.equal(
        state.context.seer_turn,
        Number(getRngLog()[1].split('=').at(-1)),
    );
    assert.equal(state.program_state.beyond_savefile_load, 1);
    assert.equal(state.program_state.in_moveloop, 1);
    assert.equal(state.disp.botlx, true);
    assert.equal(state.u.umovement, NORMAL_SPEED);
    assert.deepEqual(state.u.uz0, { dnum: 9, dlevel: 8 });
    assert.equal(state.context.move, 0);
    assert.deepEqual(
        { utcnt: state.track.utcnt, utpnt: state.track.utpnt },
        { utcnt: 0, utpnt: 0 },
    );
    // track.c UTSZ is 100; every coordinate is cleared by initrack().
    assert.equal(state.track.utrack.length, 100);
    assert.ok(state.track.utrack.every(({ x, y }) => x === 0 && y === 0));
    assert.equal(state.iflags.debug_fuzzer, 1);
    assert.equal(state.iflags.fuzzerpending, false);
});

test('permanent inventory first renders after entering the move loop', async () => {
    const state = preambleState('20260129120000');
    state.iflags.perm_invent = true;
    const updates = [];

    await moveloop_preamble(false, state, {
        hooks: {
            updateInventory(current) {
                updates.push(current.program_state.in_moveloop);
            },
        },
    });

    assert.deepEqual(updates, [1]);
});

test('moon and Friday effects preserve source messages and Luck changes', async () => {
    const cases = [
        {
            // 2026-02-02 is a full moon but not Friday the 13th.
            datetime: '20260202120000',
            moonphase: 4,
            friday13: false,
            message: 'You are lucky!  Full moon tonight.',
            luck: 1,
        },
        {
            // 2026-01-18 is a new moon but not Friday the 13th.
            datetime: '20260118120000',
            moonphase: 0,
            friday13: false,
            message: 'Be careful!  New moon tonight.',
            luck: 0,
        },
        {
            // 2026-02-13 is Friday the 13th but lunar phase 7.
            datetime: '20260213120000',
            moonphase: 7,
            friday13: true,
            message: 'Watch out!  Bad things can happen on Friday the 13th.',
            luck: -1,
        },
    ];

    for (const expected of cases) {
        const state = preambleState(expected.datetime);
        await moveloop_preamble(false, state);
        assert.equal(state.flags.moonphase, expected.moonphase);
        assert.equal(state.flags.friday13, expected.friday13);
        assert.equal(state._pending_message, expected.message);
        assert.equal(state.u.uluck, expected.luck);
    }

    const state = preambleState('20260129120000');
    state.u.uluck = 10;
    change_luck(1, state);
    assert.equal(state.u.uluck, 10);
    state.u.uluck = -10;
    change_luck(-1, state);
    assert.equal(state.u.uluck, -10);
});

test('combined full moon and Friday messages precede RNG and tutorial', async () => {
    // 2030-09-13 is both a full moon and Friday the 13th.  Three spaces
    // dismiss welcome, full-moon, and Friday messages; n declines tutorial.
    const state = preambleState('20300913120000', '   n');
    state.specialLevels = [{
        proto: 'tut-1',
        dlevel: { dnum: 8, dlevel: 1 },
    }];
    const boundaries = captureBoundaries(state);
    const welcome = 'Hello Preamble, welcome to NetHack!  '
        + 'You are a neutral male human Healer.';

    await ttyPline(welcome, state);
    await moveloop_preamble(false, state);
    assert.deepEqual(await maybe_do_tutorial(state), {
        action: 'skip', reason: 'declined',
    });

    assert.equal(boundaries.length, 4);
    assert.equal(boundaries[0].rows[0], welcome);
    assert.equal(boundaries[0].rows[1], '--More--');
    assert.deepEqual(boundaries[0].cursor, [8, 1]);
    assert.deepEqual(boundaries[0].rng, []);

    assert.equal(
        boundaries[1].rows[0],
        'You are lucky!  Full moon tonight.--More--',
    );
    assert.deepEqual(boundaries[1].cursor, [42, 0]);
    assert.deepEqual(boundaries[1].rng, []);

    assert.equal(
        boundaries[2].rows[0],
        'Watch out!  Bad things can happen on Friday the 13th.--More--',
    );
    assert.deepEqual(boundaries[2].cursor, [61, 0]);
    assert.deepEqual(
        boundaries[2].rng.map((entry) => entry.slice(0, entry.indexOf('='))),
        ['rnd(9000)', 'rnd(30)'],
    );
    assert.match(boundaries[3].rows[0], /Do you want a tutorial\?/u);
    assert.deepEqual(boundaries[3].rng, boundaries[2].rng);
    assert.equal(state.u.uluck, 0);
});

test('Escape at More suppresses later plines through the next input boundary', async () => {
    // 2030-09-13 exercises both calendar messages after Escape dismisses the
    // welcome More. The final missing key captures the first command screen.
    const state = preambleState('20300913120000', '\x1b');
    const boundaries = captureBoundaries(state, state.nhDisplay.rows);
    const welcome = 'Hello Stop, welcome to NetHack!  '
        + 'You are a neutral male human Healer.';

    await ttyPline(welcome, state);
    await moveloop_preamble(false, state);
    await flush_screen(1);
    // Match the command boundary: tty_nhgetch records first, then clears
    // WIN_STOP before discovering that this focused test has no next key.
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('Input queue empty');
    };
    await assert.rejects(nhgetch(), /Input queue empty/u);

    assert.equal(boundaries.length, 2);
    assert.equal(boundaries[0].rows[0], `${welcome}--More--`);
    assert.equal(
        boundaries[1].rows[0],
        'You are lucky!  Full moon tonight.',
    );
    assert.doesNotMatch(
        boundaries[1].rows.join('\n'),
        /Friday the 13th/u,
    );
    assert.equal(
        state._ttyToplines,
        'Watch out!  Bad things can happen on Friday the 13th.',
    );
    assert.equal(
        state._pending_message,
        'You are lucky!  Full moon tonight.',
    );
    assert.equal(state._ttyMessageStopped, false);
});

test('a wrapped message requests More immediately', async () => {
    const state = preambleState('20260129120000', 'x ');
    const boundaries = captureBoundaries(state, 3);
    // Eighty characters force update_topl() to wrap before the final word;
    // the invalid x leaves the same More boundary visible for the Space.
    const wrapped = `${'a'.repeat(70)} final word`;

    await ttyPline(wrapped, state);

    assert.equal(boundaries.length, 2);
    assert.deepEqual(boundaries[1], boundaries[0]);
    assert.equal(boundaries[0].rows[0], `${'a'.repeat(70)} final`);
    assert.equal(boundaries[0].rows[1], 'word--More--');
    assert.deepEqual(boundaries[0].cursor, [12, 1]);
    assert.equal(state._pending_message, '');
});

test('high-bit top-line bytes stay nonbreaking until recorder projection', async () => {
    const state = preambleState('20260129120000', ' ');
    const boundaries = captureBoundaries(state, 3);
    // The UTF-8 bytes for é occupy columns 70 and 71. C does not treat either
    // high-bit byte as a space while choosing a wrap point, so seven following
    // bytes remain on row zero. Recorder patch 006 leaves the two high-bit
    // cells blank only when the raw bytes reach the shadow grid.
    const message = `${'a'.repeat(70)}é${'B'.repeat(12)}`;

    await ttyPline(message, state);

    assert.equal(boundaries.length, 1);
    assert.equal(
        boundaries[0].rows[0],
        `${'a'.repeat(70)}  ${'B'.repeat(7)}`,
    );
    assert.equal(boundaries[0].rows[1], `${'B'.repeat(5)}--More--`);
    assert.deepEqual(boundaries[0].cursor, [13, 1]);
    assert.equal(
        state._ttyToplines,
        `${'a'.repeat(70)}\0\0${'B'.repeat(12)}`,
    );
    assert.equal(state._pending_message, '');
});

test('top-line sharing keeps the strict room-for-More inequality', async () => {
    const prior = 'P'.repeat(30);
    const cases = [
        // next + prior + 3 is respectively one below, equal to, and one
        // above CO - 8. Equality must start a new top line.
        { length: 38, shares: true },
        { length: 39, shares: false },
        { length: 40, shares: false },
    ];

    for (const expected of cases) {
        const next = 'N'.repeat(expected.length);
        const state = preambleState('20260129120000', '  ');
        const boundaries = captureBoundaries(state, 2);
        await ttyPline(prior, state);
        await ttyPline(next, state);

        if (expected.shares) {
            assert.equal(state._pending_message, `${prior}  ${next}`);
            assert.equal(state.nhDisplay.inputQueueLength, 2);
            assert.deepEqual(boundaries, []);
        } else {
            assert.equal(state._pending_message, next);
            assert.equal(state.nhDisplay.inputQueueLength, 1);
            assert.equal(boundaries.length, 1);
            assert.equal(boundaries[0].rows[0], `${prior}--More--`);
        }

        await dismissPendingTtyMessage(state);
        assert.equal(
            boundaries.at(-1).rows[0],
            `${expected.shares ? `${prior}  ${next}` : next}--More--`,
        );
        assert.equal(
            state.nhDisplay.inputQueueLength,
            expected.shares ? 1 : 0,
            'only a required More boundary consumes its queued key',
        );
    }
});

test('More cleanup distinguishes one-line, Escape, and multi-line messages', async () => {
    const oneLine = preambleState('20260129120000', ' ');
    await ttyPline('Short message.', oneLine);
    await dismissPendingTtyMessage(oneLine);
    assert.equal(rowText(oneLine, 0), 'Short message.--More--');

    const escaped = preambleState('20260129120000', '\x1b');
    await ttyPline('Short message.', escaped);
    await dismissPendingTtyMessage(escaped);
    assert.equal(rowText(escaped, 0), '');
    assert.deepEqual(
        [escaped.nhDisplay.cursorCol, escaped.nhDisplay.cursorRow],
        [0, 0],
    );

    const multiline = preambleState('20260129120000', ' ');
    multiline.nhDisplay.setCell(9, 1, 'M', 4, 2);
    await ttyPline(`${'a'.repeat(70)} final word`, multiline);
    assert.equal(rowText(multiline, 0), '');
    assert.deepEqual(
        [
            multiline.nhDisplay.grid[1][9].ch,
            multiline.nhDisplay.grid[1][9].color,
            multiline.nhDisplay.grid[1][9].attr,
        ],
        ['M', 4, 2],
    );
    assert.deepEqual(
        [multiline.nhDisplay.cursorCol, multiline.nhDisplay.cursorRow],
        [0, 0],
    );
});

test('You die starts a new top line instead of sharing the pending message', async () => {
    const state = preambleState('20260129120000', ' ');
    await ttyPline('A prior message.', state);
    await ttyPline('You die from a test.', state);

    assert.equal(state._pending_message, 'You die from a test.');
    assert.equal(state._ttyToplines, 'You die from a test.');
    assert.doesNotMatch(state._ttyToplines, /prior/u);
});

test('You die clears suppression set while dismissing the prior message', async () => {
    const state = preambleState('20260129120000', '\x1b');
    await ttyPline('A prior message.', state);
    await ttyPline('You die from a test.', state);

    assert.equal(state._ttyMessageStopped, false);
    assert.equal(state._pending_message, 'You die from a test.');
    assert.equal(state._ttyToplines, 'You die from a test.');
});

test('a long prior line preserves Escape suppression before You die comparison', async () => {
    const state = preambleState('20260129120000', '\x1b');
    await ttyPline('P'.repeat(50), state);
    await ttyPline('You die from a test.', state);

    assert.equal(state._ttyMessageStopped, true);
    assert.equal(state._pending_message, 'You die from a test.');
    await ttyPline('An ordinary follow-up.', state);
    assert.equal(state._ttyMessageStopped, true);
    assert.equal(state._pending_message, 'You die from a test.');
    assert.equal(
        state._ttyToplines,
        'You die from a test.  An ordinary follow-up.',
    );
});

test('pline flushes a changed status line before a wrapped More boundary', async () => {
    const state = preambleState('20260129120000', ' ');
    state.plname = 'ABCDEFGHIJKLMNOP';
    state.urole = { name: { m: 'Healer' }, rank: { m: 'Rhizotomist' } };
    state.u = {
        ...state.u,
        ux: 1,
        uy: 1,
        ulevel: 1,
        uhp: 13,
        uhpmax: 13,
        uen: 5,
        uenmax: 5,
        uac: 0,
        ualign: { type: 0 },
        acurr: { a: [8, 10, 14, 13, 14, 16] },
    };
    await flush_screen(1);
    state.u.uac = 8;
    state.disp.botl = true;
    const boundaries = captureBoundaries(state, state.nhDisplay.rows);

    await ttyPline(
        'Hello ABCDEFGHIJKLMNOP, welcome to NetHack!  '
            + 'You are a neutral male human Healer.',
        state,
    );

    assert.equal(boundaries.length, 1);
    assert.match(boundaries[0].rows[23], / AC:8 Xp:1$/u);
});

test('resuming skips new-game RNG, movement, and track initialization', async () => {
    // An ordinary calendar date isolates the restore branch from messages.
    const state = preambleState('20260129120000');
    state.u.umovement = 7;
    state.track = { existing: true };

    await moveloop_preamble(true, state);

    assert.deepEqual(getRngLog(), []);
    assert.equal(state.context.rndencode, undefined);
    assert.equal(state.context.seer_turn, undefined);
    assert.equal(state.program_state.beyond_savefile_load, undefined);
    assert.equal(state.u.umovement, 7);
    assert.deepEqual(state.track, { existing: true });
    assert.equal(state.program_state.in_moveloop, 1);
});
