// Startup configuration errors: the raw-print surface they land on, the
// keypress that dismisses them, and the segment that keeps playing afterwards.
// C refs: cfgfiles.c config_erradd() and config_error_done();
// win/tty/wintty.c tty_raw_print(), tty_wait_synch() and getret();
// options.c parsebindings(); recorder patch 006's nomux_raw_* shadow.

import assert from 'node:assert/strict';
import test from 'node:test';

import { GameDisplay } from '../js/game_display.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { NO_COLOR } from '../js/terminal.js';
import { nomux_get_cursor, tty_raw_print } from '../js/tty_rawprint.js';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

// Two seeds and one datetime chosen for this file; neither appears in a
// recorded session, and a configuration error is settled before any of the
// three could matter.
const SEED = 4471903;
const DATETIME = '20030417113000';

function displayState() {
    return { nhDisplay: new GameDisplay(null) };
}

function rowText(display, row) {
    return display.grid[row].map((cell) => cell.ch).join('').replace(/ +$/u, '');
}

// C ref: win/tty/wintty.c tty_raw_print() plus patch 006 nomux_raw_emit(),
// which appends the newline puts() writes and starts at the top left.
test('raw printing writes whole lines from the top of a cleared screen',
    () => {
        const state = displayState();
        const display = state.nhDisplay;
        // Something already on screen proves nomux_enter_raw_mode() clears it.
        display.putstr(0, 3, 'stale banner text', NO_COLOR);

        tty_raw_print(state, '\nOPTIONS=sortloot:x');
        tty_raw_print(state, " * Line 1: Unknown sortloot parameter 'x'.");

        assert.equal(rowText(display, 0), '');
        assert.equal(rowText(display, 1), 'OPTIONS=sortloot:x');
        assert.equal(rowText(display, 2),
            " * Line 1: Unknown sortloot parameter 'x'.");
        assert.equal(rowText(display, 3), '');
        // nomux_fg_cur is 7, which nomux_capture_screen() writes no SGR code
        // for, so the cells carry the terminal default rather than grey.
        assert.equal(display.grid[1][0].color, NO_COLOR);
        assert.equal(display.grid[1][0].attr, 0);
    });

// C ref: patch 006 nomux_raw_putch(), which drops bytes below space other
// than the newline, and nomux_get_cursor(), which reports the raw row and
// column for the rest of the process once raw mode is on.
test('the raw cursor skips control bytes and outlives the raw output', () => {
    const state = displayState();
    const display = state.nhDisplay;
    assert.deepEqual(nomux_get_cursor(display), [0, 0]);

    // A tab and a bell are both below space and neither reaches a cell.
    tty_raw_print(state, 'a	bc');
    assert.equal(rowText(display, 0), 'abc');
    // One trailing newline from puts() leaves the cursor at the next row.
    assert.deepEqual(nomux_get_cursor(display), [0, 1]);

    // Ordinary drawing continues into the same shadow screen, and the cursor
    // it sets is the one nomux_get_cursor() stops reporting.
    display.setCursor(37, 12);
    assert.deepEqual(nomux_get_cursor(display), [0, 1]);
    assert.equal(display.cursorCol, 37);
    assert.equal(display.cursorRow, 12);
});

// C ref: patch 006 nomux_raw_putch(), which drops a byte past the last column
// instead of moving to the next row.  Only the newline advances a row, so an
// overlong line loses its tail rather than wrapping.
test('raw output past the last column is dropped rather than wrapped', () => {
    const state = displayState();
    const display = state.nhDisplay;
    const overlong = 'z'.repeat(display.cols + 3);

    tty_raw_print(state, overlong);
    assert.equal(rowText(display, 0), 'z'.repeat(display.cols));
    assert.equal(rowText(display, 1), '');
    // The newline that ends the line resets the column whatever it reached.
    assert.deepEqual(nomux_get_cursor(display), [0, 1]);
});

// C ref: options.c parsebindings():7669-7672 over cmd.c bind_key().  A command
// name in no extcmdlist[] row, and one whose row carries INTERNALCMD, both make
// bind_key() answer FALSE, so the key keeps what it had.
test('a binding to a command bind_key() refuses is reported, not bound', () => {
    for (const [command, statement] of [
        // No extcmdlist[] row spells this.
        ['zorkmid', 'BIND=v:zorkmid'],
        // cmd.c:2063 gives altdip the INTERNALCMD flag, and bind_key()'s loop
        // passes over such a row rather than binding it.
        ['altdip', 'BIND=v:altdip'],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.commandOperations, [], command);
        assert.deepEqual(parsed.gameplayBindings, [], command);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            ` * Line 1: Unknown key binding command '${command}'.`,
        ], command);
    }

    // A name with a row still binds, and so does the reserved "nothing"
    // bind_key() answers TRUE for without consulting the table.  A name
    // carrying a parameter binds too: bind_key() matches the text before the
    // '(' once a ')' follows it.
    for (const [statement, command] of [
        ['BIND=v:inventory', 'inventory'],
        ['BIND=v:nothing', 'nothing'],
        // cmd.c:140 gives toggle the CMD_PARAM flag, which is what a
        // parenthesized parameter is for.
        ['BIND=v:toggle(time)', 'toggle(time)'],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
        assert.equal(parsed.commandOperations.at(0)?.command, command,
            statement);
    }

    // Both halves of the parenthesis test have to hold: with no '(' the name
    // keeps its stray ')' and matches no row, so a closing parenthesis alone
    // does not trim the name down to one that would.
    const unbalanced = parseNethackrc('BIND=v:toggle)\n');
    assert.deepEqual(unbalanced.commandOperations, []);
    assert.deepEqual(unbalanced.configErrorFrame.output, [
        '\nBIND=v:toggle)',
        " * Line 1: Unknown key binding command 'toggle)'.",
    ]);
});

// C refs: cfgfiles.c rcfile():1943-1945 and unixmain.c:150, which put the whole
// configuration read before init_nhwindows().  The startup banner is what
// clears the errors off the screen afterwards.
test('a segment with a bad option value reports it and plays on', async () => {
    const nethackrc = [
        'OPTIONS=name:Ferrum',
        'OPTIONS=role:Valkyrie,race:human,gender:female,align:neutral',
        'OPTIONS=sortloot:zebra',
        '',
    ].join('\n');

    await withSerializedGrids(async () => {
        // A space and a 'q' precede the Return: iflags.cbreak is still off,
        // so xwaitforspace() reads and discards both.
        const replay = await runSegment({
            seed: SEED,
            datetime: DATETIME,
            nethackrc,
            moves: ' q\n',
        });
        const screens = replay.getScreens().map((screen) => JSON.parse(screen));
        assert.ok(screens.length >= 4, `only ${screens.length} screens`);

        const reported = screens[0].map(
            (row) => row.map((cell) => cell.ch).join('').replace(/ +$/u, ''),
        );
        assert.deepEqual(reported.slice(0, 6), [
            '',
            'OPTIONS=sortloot:zebra',
            " * Line 3: Unknown sortloot parameter 'zebra'.",
            '',
            // config_error_done() names the configuration file, whose path
            // this port cannot know; js/cfgfiles.js records why.
            '1 error in .nethackrc.',
            '',
        ]);

        // The three screens before the Return are the same wait, because a key
        // the loop rejects redraws nothing.
        assert.deepEqual(screens[1], screens[0]);
        assert.deepEqual(screens[2], screens[0]);
        // Once the Return lands, the game starts and repaints the screen.
        assert.notDeepEqual(screens[3], screens[0]);

        // Every recorded cursor is the raw-print one, because nothing clears
        // patch 006's nomux_raw_active.  Six is the row the three pline()
        // calls left it on.
        for (const cursor of replay.getCursors())
            assert.deepEqual(cursor, [0, 6, 1]);

        // A segment that stopped on the error would draw no level at all, so
        // a non-empty PRNG log is the coarsest proof that it did not.
        assert.ok(replay.getRngLog().length > 0);
    });
});
