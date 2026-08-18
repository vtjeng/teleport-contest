import assert from 'node:assert/strict';
import test from 'node:test';

import { NORMAL_SPEED, STAIRS, STONE } from '../js/const.js';
import { flush_screen } from '../js/display.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { nhgetch } from '../js/input.js';
import { runSegment } from '../js/jsmain.js';
import {
    change_luck,
    moveloop_preamble,
    runMoveloopPreambleAtStartupBoundary,
    UnsupportedStartupBoundaryError,
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
    ttyUrgentPline,
    UnsupportedUrgentMessageError,
} from '../js/tty_message.js';
import { CLR_GRAY, NO_COLOR } from '../js/terminal.js';

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
        // Every boundary below sits inside the move loop, long after
        // tty_init_nhwindows() called setftty(); without cbreak,
        // xwaitforspace() would read only Return and Enter, as it does for
        // the configuration errors printed before the window system starts.
        cbreak: true,
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
    // botl.c describe_level() reaches dungeon.c depth(), which reads
    // svd.dungeons[u.uz.dnum].depth_start. Tests below leave the hero in
    // dungeon 3 or move it to dungeon 0, so the list runs to index 3; giving
    // each entry depth_start 1 keeps the status row's Dlvl equal to
    // u.uz.dlevel whichever branch a test picks.
    game.dungeons = Array.from({ length: 4 }, () => ({ depth_start: 1 }));
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

test('new-game preamble resets starting inventory before staircase decor',
    async () => {
        // 2026-01-29 has no calendar message, so the one Space dismisses only
        // the pending welcome line before pickup.c describes the staircase.
        const state = preambleState('20260129120000', ' ');
        state.flags = {
            mention_decor: true,
            pickup: false,
            verbose: true,
        };
        state.iflags.prev_decor = STONE;
        Object.assign(state.u, {
            ux: 1,
            uy: 1,
            uz: { dnum: 0, dlevel: 1 },
            uhave: { amulet: false },
        });
        const locations = Array.from({ length: 3 }, () =>
            Array.from({ length: 3 }, () => ({ typ: 0 })));
        locations[1][1].typ = STAIRS;
        state.level = {
            locations,
            objects: Array.from({ length: 3 }, () => Array(3).fill(null)),
            at(x, y) { return this.locations[x]?.[y] ?? { typ: 0 }; },
        };
        state.stairs = {
            sx: 1,
            sy: 1,
            up: true,
            isladder: false,
            tolev: { dnum: 1, dlevel: 1 },
            u_traversed: true,
            next: null,
        };
        state.invent = { pickup_prev: true, nobj: null };
        await ttyPline('Hello Stair, welcome to NetHack!', state);

        await moveloop_preamble(false, state);

        assert.equal(state.invent.pickup_prev, false);
        assert.equal(
            state._pending_message,
            'There is a staircase up out of the dungeon here.',
        );
        assert.equal(state.iflags.prev_decor, STAIRS);
        assert.deepEqual(
            getRngLog().map((entry) => entry.slice(0, entry.indexOf('='))),
            ['rnd(9000)', 'rnd(30)'],
        );
        assert.deepEqual([state.u.ux, state.u.uy, state.context.move], [1, 1, 0]);
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

test('short high-bit messages never write internal markers to the screen', async () => {
    const state = preambleState('20260129120000');
    const priorCells = [
        { column: 0, ch: 'W', color: 1, attr: 1 },
        { column: 1, ch: 'X', color: 2, attr: 2 },
        { column: 2, ch: 'Y', color: 3, attr: 4 },
        { column: 3, ch: 'Z', color: 4, attr: 0 },
    ];
    for (const cell of priorCells) {
        state.nhDisplay.setCell(
            cell.column, 0, cell.ch, cell.color, cell.attr,
        );
    }
    await ttyPline('AéB', state);

    await flush_screen(1);

    assert.equal(rowText(state, 0), 'AXYB');
    assert.deepEqual(
        state.nhDisplay.grid[0].slice(0, 4).map(
            ({ ch, color, attr }) => ({ ch, color, attr }),
        ),
        [
            { ch: 'A', color: NO_COLOR, attr: 0 },
            { ch: 'X', color: 2, attr: 2 },
            { ch: 'Y', color: 3, attr: 4 },
            { ch: 'B', color: NO_COLOR, attr: 0 },
        ],
        'a full-grid rebuild preserves complete skipped-byte cells',
    );
    assert.equal(
        state.nhDisplay.grid.flat().some(({ ch }) => ch === '\0'),
        false,
        'the physical capture grid contains no logical marker bytes',
    );
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [0, 0],
    );
    assert.equal(state._pending_message, 'A\0\0B');
});

test('recorder-ignored top-line bytes preserve prior physical cells', async () => {
    const state = preambleState('20260129120000', ' ');
    const priorCells = [
        { column: 0, ch: 'W', color: 1, attr: 1 },
        { column: 1, ch: 'X', color: 2, attr: 2 },
        { column: 2, ch: 'Y', color: 3, attr: 4 },
        { column: 3, ch: 'Z', color: 4, attr: 0 },
    ];
    for (const cell of priorCells) {
        state.nhDisplay.setCell(
            cell.column, 0, cell.ch, cell.color, cell.attr,
        );
    }
    // Column 20 lies beyond the four-byte logical message and its eight-byte
    // More prompt, so redotoplin()'s cl_end() must erase this stale cell.
    state.nhDisplay.setCell(20, 0, 'T', 5, 2);
    const boundaries = captureBoundaries(state, 1);
    await ttyPline('AéB', state);

    await dismissPendingTtyMessage(state);

    assert.equal(boundaries[0].rows[0], 'AXYB--More--');
    assert.deepEqual(
        state.nhDisplay.grid[0].slice(0, 4).map(
            ({ ch, color, attr }) => ({ ch, color, attr }),
        ),
        [
            { ch: 'A', color: NO_COLOR, attr: 0 },
            { ch: 'X', color: 2, attr: 2 },
            { ch: 'Y', color: 3, attr: 4 },
            { ch: 'B', color: NO_COLOR, attr: 0 },
        ],
        'ordinary bytes overwrite while skipped bytes retain full cell state',
    );
    assert.deepEqual(
        state.nhDisplay.grid[0][20],
        { ch: ' ', color: CLR_GRAY, attr: 0 },
        'cl_end clears stale character and style state after the message',
    );
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

test('an urgent message stops where Escape has suppressed the window',
    async () => {
    // pline.c putmesg():72-74 turns urgent_pline()'s URGENT_MESSAGE into
    // tty_putstr()'s ATR_URGENT, and wintty.c:2277-2283 answers it by wiping
    // the message window and clearing the WIN_STOP an Escape at an earlier
    // --More-- set. Ordinary pline() holds the message back invisibly instead,
    // so the urgent caller cannot borrow that path.
    //
    // Two 50-byte messages are what set WIN_STOP: the second cannot share the
    // top line with the first, so it raises the --More-- the queued Escape
    // answers.
    const stopped = preambleState('20260129120000', '\x1b');
    await ttyPline('P'.repeat(50), stopped);
    await ttyPline('Q'.repeat(50), stopped);
    assert.equal(stopped._ttyMessageStopped, true);
    await assert.rejects(
        () => ttyUrgentPline('You die...', stopped),
        UnsupportedUrgentMessageError,
    );

    // With WIN_STOP clear the arm sets only WIN_NOSTOP, which update_topl():257
    // reads as the `skip = FALSE` a clear WIN_STOP already gives. The message
    // then travels the ordinary path, where "You die" still takes a line of its
    // own and forces a --More-- on the one before it.
    const running = preambleState('20260129120000', ' ');
    await ttyPline('A prior message.', running);
    await ttyUrgentPline('You die...', running);
    assert.equal(running._pending_message, 'You die...');
    assert.equal(running._ttyToplines, 'You die...');

    // topl.c more():232-234. WIN_NOSTOP's second reader: an Escape answered at
    // the --More-- this urgent message itself raises must not set WIN_STOP,
    // where the same Escape at an ordinary message's --More-- does. The port
    // models that through ttyPlineCore()'s deathComparisonReached clear rather
    // than through a WIN_NOSTOP flag, which is the same answer for every input
    // either rule can see while "You die..." is urgent_pline()'s only caller.
    const escaped = preambleState('20260129120000', '\x1b');
    await ttyPline('A prior message.', escaped);
    await ttyUrgentPline('You die...', escaped);
    assert.equal(escaped._ttyMessageStopped, false);

    // The control: the same Escape at an ordinary message's --More--. Two
    // 50-byte messages are what raise it, since a short pair shares the top
    // line and never stops at all.
    const ordinary = preambleState('20260129120000', '\x1b');
    await ttyPline('P'.repeat(50), ordinary);
    await ttyPline('Q'.repeat(50), ordinary);
    assert.equal(ordinary._ttyMessageStopped, true);

    // urgent_pline() sets URGENT_MESSAGE alone. PLINE_NOREPEAT is Norep()'s
    // flag (pline.c:326-335), so vpline():253 compares nothing against
    // gp.prevmsg and the same urgent line is written a second time.
    const repeated = preambleState('20260129120000', ' ');
    await ttyUrgentPline('The bolt of fire hits you!', repeated);
    await ttyUrgentPline('The bolt of fire hits you!', repeated);
    assert.equal(repeated._pending_message,
        'The bolt of fire hits you!  The bolt of fire hits you!');
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

// A hero standing on an object, which is what allmain.c:75 pickup(1) meets
// and js/pickup.js preflight_initial_pickup() refuses. The square is the
// staircase a new game starts on; preflight only tests that the pile is
// non-empty, so one bare node stands for the wand the recorded case below
// finds there.
function preambleStateOnAnObject(datetime) {
    const state = preambleState(datetime);
    state.flags = { mention_decor: false, pickup: false };
    Object.assign(state.u, {
        ux: 1,
        uy: 1,
        uz: { dnum: 0, dlevel: 1 },
        uhave: { amulet: false },
    });
    const locations = Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({ typ: 0 })));
    locations[1][1].typ = STAIRS;
    const objects = Array.from({ length: 3 }, () => Array(3).fill(null));
    objects[1][1] = { nexthere: null };
    state.level = {
        locations,
        objects,
        at(x, y) { return this.locations[x]?.[y] ?? { typ: 0 }; },
    };
    state.invent = { pickup_prev: true, nobj: null };
    return state;
}

test('a startup refusal is converted into the boundary that ends a segment',
    async () => {
        // 2026-01-29 has no calendar message, so nothing but the refusal
        // decides what this case does.
        const state = preambleStateOnAnObject('20260129120000');

        await assert.rejects(
            runMoveloopPreambleAtStartupBoundary(false, state),
            (error) => {
                assert.ok(error instanceof UnsupportedStartupBoundaryError,
                    `expected the startup boundary, got ${error?.name}: `
                    + `${error?.message}`);
                assert.equal(
                    error.message,
                    'game startup reached unsupported pickup: '
                    + 'initial floor object',
                );
                // The owner's reason survives the conversion, as it does at
                // js/allmain.js runUnmulAtTurnBoundary().
                assert.equal(error.reason, 'initial floor object');
                return true;
            },
        );
        // allmain.c:74-79. preflight_initial_pickup() refuses in front of
        // reset_justpicked() at 74 and of the rnd(30) at 79, so a converted
        // refusal has changed no state and drawn no random number beyond the
        // rndencode at 72.
        assert.equal(state.invent.pickup_prev, true);
        assert.equal(state.context.seer_turn, undefined);
        assert.deepEqual(
            getRngLog().map((entry) => entry.slice(0, entry.indexOf('='))),
            ['rnd(9000)'],
        );
    });

test('a startup failure that is not a refusal still escapes the preamble',
    async () => {
        // The converter reads js/cmd.js failClosedCommandRefusals(), so a
        // fault outside that list stays a hard failure: converting one would
        // turn a port bug into a quietly short segment. The perm_invent hook
        // is the seam an injected fault can reach without pretending that a
        // ported function raises it.
        const state = preambleState('20260129120000');
        state.iflags.perm_invent = true;

        await assert.rejects(
            runMoveloopPreambleAtStartupBoundary(false, state, {
                hooks: {
                    updateInventory() {
                        throw new Error('no inventory window');
                    },
                },
            }),
            (error) => {
                assert.equal(error.constructor, Error,
                    `expected a plain Error, got ${error?.name}`);
                assert.equal(error.message, 'no inventory window');
                return true;
            },
        );
    });

test('a segment whose startup refuses keeps every screen it matched',
    async () => {
        // The end-to-end half of the case above: a refusal raised inside
        // js/jsmain.js start() must end the segment where it stands rather
        // than escape runSegment() and discard the whole segment.
        //
        // Seed 2021184 puts a wand of probing on the D:1 up staircase, so the
        // hero starts on it. C is what puts it there: the recorded case below
        // matches this port call for call over the whole level generation, and
        // ordinary room filling cannot reach the square, because mkroom.c
        // somexyspace() (743-756) admits only ROOM, CORR and ICE.
        //
        // 15 June 2000 is a full moon, which is what makes the preamble print
        // before it refuses. Its message needs no key of its own here: the
        // port defers the --More-- until the next message, and the refusal is
        // what stops that message from arriving.
        const inputs = {
            seed: 2021184,
            datetime: '20000615103000',
            nethackrc:
                'OPTIONS=name:Failclose,role:Val,race:Hum,gender:Fem,align:Neu'
                + '\nOPTIONS=!legacy,!tutorial,!splash_screen\n',
            // One Space dismisses the welcome --More--.
            moves: ' ',
        };
        let boundary = null;

        const replay = await runSegment(inputs, {
            onBoundary: (error) => { boundary = error; },
        });

        assert.ok(boundary instanceof UnsupportedStartupBoundaryError,
            `expected the startup boundary, got ${boundary?.name}`);
        assert.equal(boundary.reason, 'initial floor object');
        // Recorded with scripts/record-session.mjs on these inputs: C draws
        // 2848 random numbers over three input boundaries, the last of them
        // rnd(9000)=5468 at allmain.c:72. The port stops one statement later
        // and keeps all of them, where before this conversion it returned
        // none of them at all.
        assert.equal(replay.getRngLog().length, 2848);
        assert.equal(replay.getRngLog().at(-1), 'rnd(9000)=5468');
        // C's first boundary is the welcome --More--, its cursor resting past
        // that prompt on row 1. The port keeps that boundary and stops before
        // C's second and third.
        assert.equal(replay.getScreens().length, 1);
        assert.deepEqual(replay.getCursors(), [[8, 1, 1]]);
        // The preamble printed the full-moon line and took its point of Luck
        // before refusing, so this boundary is not the same case as one raised
        // before the game has drawn anything.
        assert.equal(game._pending_message,
            'You are lucky!  Full moon tonight.');
        assert.equal(game.u.uluck, 1);
        // allmain.c:88. The refusal is upstream of it, so the segment never
        // entered the move loop.
        assert.equal(game.program_state.in_moveloop, undefined);
    });

test('a hero standing on an engraving reads it before her first command',
    async () => {
        // pickup.c pickup() (702-709): a square holding nothing ends the
        // autopickup arm in read_engr_at(), which allmain.c:75 pickup(1)
        // reaches before the move loop starts. The segment must therefore
        // print the engraving rather than stop above it, which is what the
        // floor-object case above does.
        //
        // Seed 100778 puts the "ad aerarium" engraving that mklev.c:768 leaves
        // beside a trapped niche on the D:1 up staircase, so the hero starts on
        // it. 11 March 2027 is neither a full nor a new moon and is not Friday
        // the 13th, so no calendar message shares the top line.
        const inputs = {
            seed: 100778,
            datetime: '20270311094500',
            nethackrc:
                'OPTIONS=name:Engraver,role:Valkyrie,race:human,gender:female,'
                + 'align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen\n',
            // One Space dismisses the welcome --More-- that the engraving
            // message forces; the segment then ends waiting for a command.
            moves: ' ',
        };
        let boundary = null;

        const replay = await runSegment(inputs, {
            onBoundary: (error) => { boundary = error; },
        });

        assert.equal(boundary, null,
            `expected no startup boundary, got ${boundary?.message}`);
        // Recorded with scripts/record-session.mjs on these inputs: C draws
        // 2430 random numbers, the last of them the rnd(30) that
        // moveloop_preamble() makes at allmain.c:79, one statement below the
        // pickup(1) this case exercises.
        assert.equal(replay.getRngLog().length, 2430);
        assert.equal(replay.getRngLog().at(-1), 'rnd(30)=15');
        // C's two boundaries are the welcome --More-- and the command prompt
        // that follows the engraving message, its cursor back on the hero at
        // (15,17): column x-1, row y+1.
        assert.equal(replay.getScreens().length, 2);
        assert.deepEqual(replay.getCursors(), [[8, 1, 1], [14, 18, 1]]);
        // engrave.c read_engr_at() (329-334, 396-397) prints the DUST
        // sensing line and the text, which share one top line. The
        // five rubbed-out characters come from mklev.c:769
        // wipe_engr_at(..., 5, FALSE).
        assert.equal(
            game._ttyToplines,
            'Something is written here in the dust.'
            + '  You read: "ad ?er?ri?r".',
        );
        // engrave.c:399-400. Only read_engr_at() sets these, so they separate
        // a printed message from a message printed by something else.
        assert.deepEqual(
            [game.head_engr.eread, game.head_engr.erevealed],
            [true, true],
        );
        // allmain.c:88. The preamble ran to its end instead of refusing.
        assert.equal(game.program_state.in_moveloop, 1);
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
