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

// C ref: options.c parsebindings():7644-7666.  Both errors leave the binding
// tables untouched and the file being read: txt2key() answering zero reports
// the key text it was handed, and a menu command on a key
// illegal_menu_cmd_key() rejects reports twice, once from that function and
// once from parsebindings() naming the pair through visctrl().
test('a binding parsebindings() cannot read is reported, not bound', () => {
    for (const [statement, reported] of [
        ['BIND=zorkmid:redraw',
            [" * Line 1: Unknown key binding key 'zorkmid'."]],
        // The key text is read before the command is classified, so a menu
        // command name reaches the same message.
        ['BIND=zorkmid:menu_search',
            [" * Line 1: Unknown key binding key 'zorkmid'."]],
        ['BIND=a:menu_search',
            [" * Line 1: Reserved menu command key 'a'.",
                ' * Line 1: Bad menu key a:menu_search.']],
        // illegal_menu_cmd_key()'s second arm walks def_oc_syms[].
        ['BIND=):menu_search',
            [" * Line 1: Menu command key ')' is an object class.",
                ' * Line 1: Bad menu key ):menu_search.']],
        // visctrl() renders the key, so a control byte is not written raw.
        ['BIND=^J:menu_search',
            [" * Line 1: Reserved menu command key '^J'.",
                ' * Line 1: Bad menu key ^J:menu_search.']],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            ...reported,
        ], statement);
        assert.deepEqual(parsed.commandOperations, [], statement);
        assert.equal(parsed.iflags.mapped_menu_cmds, '', statement);
        assert.equal(parsed.iflags.mapped_menu_op, '', statement);
    }

    // A legal menu key still binds, which is what proves the rows above fail
    // on their key rather than on the statement shape.
    const bound = parseNethackrc('BIND=^A:menu_search\n');
    assert.deepEqual(bound.configErrorFrame.output, []);
    assert.equal(bound.iflags.mapped_menu_cmds, '\x01');
    assert.equal(bound.iflags.mapped_menu_op, ':');

    // parsebindings() compares the key text against both mouse-button names
    // before txt2key() ever sees it, and cmd.c bind_mousebtn() accepts
    // clicklook, so neither spelling reaches "Unknown key binding key".  The
    // button state itself is unported, so nothing else changes here.
    for (const button of ['mouse1', 'mouse2']) {
        const parsed = parseNethackrc(`BIND=${button}:clicklook\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], button);
        assert.deepEqual(parsed.commandOperations, [], button);
    }
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
    // '(' once a ')' follows it.  The three parameter diagnostics
    // (cmd.c:2698, 2704 and 2712) all sit past cmdbind_add(), so C reports
    // them for a key it has already bound and the operation is pushed anyway.
    for (const [statement, command, reported] of [
        ['BIND=v:inventory', 'inventory', []],
        ['BIND=v:nothing', 'nothing', []],
        // strcmpi() makes the reserved name case-insensitive, which is the
        // only branch of bind_key() that never consults extcmdlist[].
        ['BIND=v:NOTHING', 'nothing', []],
        // cmd.c:140 gives toggle the CMD_PARAM flag, which is what a
        // parenthesized parameter is for.
        ['BIND=v:toggle(time)', 'toggle(time)', []],
        // C's message quotes buf, the copy truncated at '(', so it keeps the
        // case the statement spelled rather than the row's.
        ['BIND=v:toggle', 'toggle',
            [" * Line 1: 'toggle' requires a parameter."]],
        ['BIND=v:TOGGLE', 'toggle',
            [" * Line 1: 'TOGGLE' requires a parameter."]],
        // min(30, strlen(p)) + 1 <= 1 holds only for an empty parameter.
        ['BIND=v:toggle()', 'toggle()',
            [' * Line 1: Required parameter cannot be empty.']],
        // Every other row lacks CMD_PARAM, so a non-empty parameter is the
        // third diagnostic.
        ['BIND=v:redraw(time)', 'redraw(time)',
            [" * Line 1: 'redraw' does not take a parameter."]],
        // An empty parameter on such a row is silently accepted: C's guard is
        // `p && strlen(p) > 0`.
        ['BIND=v:redraw()', 'redraw()', []],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(
            parsed.configErrorFrame.output,
            reported.length ? [`\n${statement}`, ...reported] : [],
            statement,
        );
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

// C ref: options.c parseoptions() (489-693), whose own four configuration
// errors sit before, around and after the option handler: the length limit
// (520-524), "Empty statement" (526-538), bad_negation() (625-629) and
// "Unknown option" (687-689).  This rc trips all four in one read; a fresh
// differential at seed 6620941, 19910802143000 over exactly these lines
// matched C on all 2,522 random-number calls, all nine screens and all nine
// cursors, save the summary path no segment input can supply.
test('a segment with parseoptions errors reports all four and plays on',
    async () => {
        const nethackrc = [
            'OPTIONS=name:Ferrum',
            'OPTIONS=role:Valkyrie,race:human,gender:female,align:neutral',
            // 129 bytes, one past BUFSZ / 2.
            `OPTIONS=${'a'.repeat(129)}`,
            'OPTIONS=',
            // optlist.h gives sortloot negateok No.
            'OPTIONS=!sortloot:none',
            'OPTIONS=zorkmid:yes',
            // Two unknown elements on one line, to pin the reporting order.
            'OPTIONS=alpha,beta:1',
            '',
        ].join('\n');

        await withSerializedGrids(async () => {
            const replay = await runSegment({
                seed: SEED,
                datetime: DATETIME,
                nethackrc,
                moves: '\n',
            });
            const screens = replay.getScreens()
                .map((screen) => JSON.parse(screen));
            const reported = screens[0].map(
                (row) => row.map((cell) => cell.ch).join('').replace(/ +$/u, ''),
            );
            assert.deepEqual(reported.slice(0, 19), [
                '',
                // tty_raw_print() drops what runs past the last column, so the
                // echoed line stops at 80 characters.
                `OPTIONS=${'a'.repeat(72)}`,
                ' * Line 3: Option too long, max length is 128 characters.',
                '',
                'OPTIONS=',
                ' * Line 4: Empty statement.',
                '',
                'OPTIONS=!sortloot:none',
                ' * Line 5: The sortloot option may not both have a value and'
                + ' be negated.',
                '',
                'OPTIONS=zorkmid:yes',
                " * Line 6: Unknown option 'zorkmid:yes'.",
                '',
                'OPTIONS=alpha,beta:1',
                // parseoptions() recurses into the comma suffix before it
                // handles the current element, so the rightmost is first.
                " * Line 7: Unknown option 'beta:1'.",
                " * Line 7: Unknown option 'alpha'.",
                '',
                '6 errors in .nethackrc.',
                '',
            ]);

            // The name and character lines before the errors still applied,
            // and the game reached level generation after the Return.
            assert.ok(replay.getRngLog().length > 0);
            assert.ok(screens.length >= 2, `only ${screens.length} screens`);
            assert.notDeepEqual(screens[1], screens[0]);
        });
    });
