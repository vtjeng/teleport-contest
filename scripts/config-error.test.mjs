// Startup configuration errors: the raw-print surface they land on, the
// keypress that dismisses them, and the segment that keeps playing afterwards.
// C refs: cfgfiles.c config_erradd() and config_error_done();
// win/tty/wintty.c tty_raw_print(), tty_wait_synch() and getret();
// options.c parsebindings(); recorder patch 006's nomux_raw_* shadow.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_CONFIGFILE, config_error_done, get_configfile,
} from '../js/cfgfiles.js';
import {
    MENU_COMBINATION,
    MENU_FULL,
    MENU_PARTIAL,
    MENU_TRADITIONAL,
    PARANOID_DIE,
    PARANOID_HIT,
    PARANOID_PRAY,
    PARANOID_SWIM,
    PARANOID_TRAP,
    RUN_CRAWL,
    RUN_TPORT,
} from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { encodeUtf8ByteString } from '../js/hacklib.js';
import { runSegment } from '../js/jsmain.js';
import {
    FOOD_CLASS, RING_CLASS, WEAPON_CLASS,
} from '../js/objects.js';
import { allopt } from '../js/optlist_data.js';
import {
    change_inv_order, oc_to_str, parseNethackrc,
} from '../js/options.js';
import { ATR_INVERSE, ATR_NONE, NO_COLOR } from '../js/terminal.js';
import { nomux_get_cursor, tty_raw_print } from '../js/tty_rawprint.js';
import { withSerializedGrids } from './terminal-grid-capture.mjs';
import {
    loadUnknownConfigStatementRecipe,
} from './run-unknown-config-statements.mjs';

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
        // The special-key candidate sits past this guard, so an unreadable key
        // text stops before bind_specialkey() and nothing is recorded.  This
        // name is a cmd.c spkeys_binds[] row, which the next block binds.
        ['BIND=zorkmid:getpos.self',
            [" * Line 1: Unknown key binding key 'zorkmid'."]],
        // txt2key() opens on trimspaces(), whose trailing half writes into the
        // buffer parsebindings() prints, so the blanks before the ':' are gone
        // from the message.  mungspaces() has already turned the tab into a
        // space and condensed the run, so one blank is all that can arrive.
        ['BIND=zorkmid :redraw',
            [" * Line 1: Unknown key binding key 'zorkmid'."]],
        ['BIND=zorkmid\t:redraw',
            [" * Line 1: Unknown key binding key 'zorkmid'."]],
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

    // The same for the special-key candidate, so its row above is pinned on
    // the key text alone.
    const special = parseNethackrc('BIND=^A:getpos.self\n');
    assert.deepEqual(special.configErrorFrame.output, []);
    assert.deepEqual(special.commandOperations, [
        { type: 'special_key', key: 1, command: 'getpos.self' },
    ]);

    // trimspaces() skips leading blanks by advancing a pointer parsebindings()
    // does not keep, so those survive into the message.  Only the recursion
    // into a comma suffix can deliver one: parse_config_line() has already
    // eaten the blanks that follow the '='.
    const leading = parseNethackrc('BIND=v:redraw, zorkmid:redraw\n');
    assert.deepEqual(leading.configErrorFrame.output, [
        '\nBIND=v:redraw, zorkmid:redraw',
        " * Line 1: Unknown key binding key ' zorkmid'.",
    ]);
    // The recursion runs before the current element, so the readable half of
    // the list still binds.
    assert.deepEqual(leading.commandOperations, [
        { type: 'bind', key: 118, command: 'redraw' },
    ]);
});

// C ref: options.c parsebindings():7635-7641 over cmd.c bind_mousebtn()
// (2623-2659).  Only the accepting arm returns; the rejecting arm reports and
// keeps going, so the key text is read as a key afterwards.  The button state
// bind_mousebtn() stores is unported, which is why an accepted binding leaves
// nothing behind here.
test('a mouse-button binding reports and falls through as C does', () => {
    // bind_mousebtn() takes the reserved "nothing" and every MOUSECMD row.  It
    // does not pass over INTERNALCMD the way bind_key() does, so clicklook and
    // mouseaction bind here although BIND=v:clicklook is refused above.
    for (const command of [
        'nothing', 'clicklook', 'mouseaction', 'therecmdmenu', 'MouseAction',
    ]) {
        for (const button of ['mouse1', 'mouse2']) {
            const parsed = parseNethackrc(`BIND=${button}:${command}\n`);
            const label = `${button}:${command}`;
            assert.deepEqual(parsed.configErrorFrame.output, [], label);
            assert.deepEqual(parsed.commandOperations, [], label);
        }
    }

    // A command bind_mousebtn() refuses reports the button and then falls out
    // of the loop into txt2key(), which answers M-o (0xEF) for both spellings:
    // 'm' makes it meta and 'o' is the byte left when the rest runs out.  Each
    // of the three later candidates is reached that way.
    for (const [statement, reported, expected] of [
        // No extcmdlist[] row spells this, so bind_key() refuses it too.
        ['BIND=mouse1:zorkmid',
            [' * Line 1: Error binding mouse button 1.',
                " * Line 1: Unknown key binding command 'zorkmid'."],
            {}],
        // inventory has a row but no MOUSECMD, so only the button fails and
        // the extended command binds to M-o.
        ['BIND=mouse2:inventory',
            [' * Line 1: Error binding mouse button 2.'],
            { operations: [{ type: 'bind', key: 0xEF, command: 'inventory' }] }],
        // The menu-command candidate is reached the same way, and 0xEF is not
        // a key illegal_menu_cmd_key() rejects.
        ['BIND=mouse1:menu_search',
            [' * Line 1: Error binding mouse button 1.'],
            { menuCmds: '\xEF', menuOp: ':' }],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            ...reported,
        ], statement);
        assert.deepEqual(parsed.commandOperations, expected.operations ?? [],
            statement);
        assert.equal(parsed.iflags.mapped_menu_cmds, expected.menuCmds ?? '',
            statement);
        assert.equal(parsed.iflags.mapped_menu_op, expected.menuOp ?? '',
            statement);
    }

    // strcmp() is case-sensitive and runs before txt2key() trims anything, so
    // neither of these is a button name.  Both are read as keys instead --
    // "MOUSE1" as M-O (0xCF) -- and clicklook's INTERNALCMD row is what
    // bind_key() then refuses.
    for (const statement of ['BIND=MOUSE1:clicklook', 'BIND=mouse1 :clicklook']) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            " * Line 1: Unknown key binding command 'clicklook'.",
        ], statement);
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
        // C walks default_menu_cmd_info[] with strcmp(), so a name carried by
        // Object.prototype is no more a menu command than any other unknown
        // one and has to reach bind_key().  Were the port to answer for it,
        // 'v' would draw the reserved-key pair of messages instead of this.
        ['constructor', 'BIND=v:constructor'],
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

// C ref: cfgfiles.c parse_config_line():1422-1438 and rcfile():1943-1945.
// NethackGame.start() must expose the unknown-statement report as its first
// input boundary, dismiss config_error_done()'s wait, and keep starting the
// game. Eight errors put the unrepresentable absolute rc path below row 24.
test('a segment reports unknown config statements and keeps starting',
    async () => {
        const [segment] = loadUnknownConfigStatementRecipe().segments;
        await withSerializedGrids(async () => {
            const replay = await runSegment(segment);
            const screens = replay.getScreens().map((screen) => JSON.parse(screen));
            const reported = screens[0].map(
                (row) => row.map((cell) => cell.ch).join('').replace(/ +$/u, ''),
            );
            assert.deepEqual(reported, [
                '',
                'ZORKMID=x',
                ' * Line 3: Unknown config statement.',
                '',
                'FROBNICATE=x',
                ' * Line 4: Unknown config statement.',
                '',
                'TILESETTINGS=x',
                ' * Line 5: Unknown config statement.',
                '',
                'KEYMAP=x',
                ' * Line 6: Unknown config statement.',
                '',
                'PLAYERDIR=x',
                ' * Line 7: Unknown config statement.',
                '',
                'RECORDER=x',
                ' * Line 8: Unknown config statement.',
                '',
                'FOOBAR=x',
                ' * Line 9: Unknown config statement.',
                '',
                'NOPE=x',
                ' * Line 10: Unknown config statement.',
            ]);
            assert.deepEqual(replay.getCursors()[0], [0, 27, 1]);
            assert.ok(replay.getRngLog().length > 0);
            assert.ok(screens.length >= 2, `only ${screens.length} screens`);
            assert.notDeepEqual(screens[1], screens[0]);
        });
    });

// C ref: options.c optfn_boolean() (5199-5222), the do_set exits that precede
// `*(allopt[optidx].addr) = !negated`.  A configuration-file read takes them
// on a boolean statement carrying a value, and only the negated spelling
// reports; the other two are silent.  parseoptions():670 turns the
// optn_silenterr that follows into a bare `return FALSE`, so the rest of the
// file is read either way.
test('a negated boolean with a parameter reports and sets nothing', () => {
    for (const [statement, reported] of [
        // C quotes allopt[matchidx].name, so an abbreviation is reported
        // under the full name it matched.
        ['OPTIONS=!legacy:on',
            [" * Line 1: Negated boolean 'legacy' should not have a"
             + ' parameter.']],
        ['OPTIONS=!leg:yes',
            [" * Line 1: Negated boolean 'legacy' should not have a"
             + ' parameter.']],
        // The alias loop settles matchidx on the row it belongs to, so the
        // message names "female" for a statement that spelled "male".
        ['OPTIONS=!male:on',
            [" * Line 1: Negated boolean 'female' should not have a"
             + ' parameter.']],
        // "no" and "no-" negate as "!" does, and '=' separates a value as
        // ':' does.
        ['OPTIONS=notime:on',
            [" * Line 1: Negated boolean 'time' should not have a"
             + ' parameter.']],
        ['OPTIONS=no-time=1',
            [" * Line 1: Negated boolean 'time' should not have a"
             + ' parameter.']],
        // bad_negation() runs first (options.c:625-629), so a row whose
        // negateok is No never reaches optfn_boolean() to report the value.
        ['OPTIONS=!BIOS:on',
            [' * Line 1: The BIOS option may not both have a value and be'
             + ' negated.']],
        // string_for_opt(opts, TRUE) answers empty_optstr for a separator
        // that ends the statement, so C skips the whole value block and the
        // negation applies as it would with no separator at all.
        ['OPTIONS=!legacy:', []],
        // The null-address retreat (5203) comes before the value is read.
        // optlist.h:668-670 compiles showscore's storage away for this build,
        // and js/optlist_data.js carries the resulting null addr.
        ['OPTIONS=!showscore:on', []],
        ['OPTIONS=!vt_tiledata:on', []],
        // So does the set_wiznofuz guard (5207), which fires because
        // go.opt_initial is true for the whole configuration-file read.
        ['OPTIONS=!debug_hunger:on', []],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(
            parsed.configErrorFrame.output,
            reported.length ? [`\n${statement}`, ...reported] : [],
            statement,
        );
    }

    // legacy and acoustics are both On by default, so a statement C refused
    // and one C applied leave the flag at opposite values.  Without this the
    // rows above pass whether the port reports and sets or reports and sets
    // the negation anyway.
    assert.equal(parseNethackrc('OPTIONS=!legacy:on\n').flags.legacy, true);
    assert.equal(parseNethackrc('OPTIONS=!legacy\n').flags.legacy, false);
    assert.equal(parseNethackrc('OPTIONS=!legacy:\n').flags.legacy, false);
    assert.equal(
        parseNethackrc('OPTIONS=!acoustics:true\n').flags.acoustics, true,
    );
    assert.equal(parseNethackrc('OPTIONS=!acoustics\n').flags.acoustics, false);

    // The rest of the file is read after the report: `showexp` sits on the
    // line below the refused one and still reaches flags.
    const continued = parseNethackrc(
        'OPTIONS=!legacy:on\nOPTIONS=showexp\n',
    );
    assert.equal(continued.flags.legacy, true);
    assert.equal(continued.flags.showexp, true);
    assert.equal(continued.configErrorFrame.num_errors, 1);
});

// C ref: options.c optfn_boolean() (5233-5237), the third arm of the do_set
// value block.  A value that reads as neither true nor false is a config error
// for every row whose optlist.h valok is No, and C returns optn_silenterr
// before `*(allopt[optidx].addr) = !negated`, so the option keeps its previous
// value and the rest of the file is read.  menucolors is the only BoolOpt row
// whose valok is Yes; its value stands instead, which the whole-table sweep
// below covers.
test('a boolean value C cannot read reports and sets nothing', () => {
    for (const [statement, reported] of [
        // config_error_add() quotes `opts`: the whole trimmed,
        // negation-stripped statement, in the case the file spelled it,
        // rather than the value alone or the row's name.
        ['OPTIONS=time:zebra',
            [" * Line 1: 'time:zebra' is not valid for a boolean."]],
        ['OPTIONS=TIME:Zebra',
            [" * Line 1: 'TIME:Zebra' is not valid for a boolean."]],
        // strncmpi() over strlen(op) accepts any leading substring of "true",
        // "yes", "false" and "no", so one letter settles those four.
        ['OPTIONS=time:t', []],
        ['OPTIONS=time:y', []],
        ['OPTIONS=time:f', []],
        ['OPTIONS=time:n', []],
        // "on" and "off" are whole-string strcmpi() compares instead, so a
        // prefix of either reads as neither value.
        ['OPTIONS=time:on', []],
        ['OPTIONS=time:off', []],
        ['OPTIONS=time:o', [" * Line 1: 'time:o' is not valid for a boolean."]],
        ['OPTIONS=time:of',
            [" * Line 1: 'time:of' is not valid for a boolean."]],
        // digit(*op) guards atoi(), which answers 1 and 0 for exactly these
        // two spellings and something else for every other digit.
        ['OPTIONS=time:1', []],
        ['OPTIONS=time:0', []],
        ['OPTIONS=time:2', [" * Line 1: 'time:2' is not valid for a boolean."]],
        // parseoptions()'s alias loop settles matchidx on the female row,
        // whose valok is No, so a statement that spelled "male" reports too.
        ['OPTIONS=male:Zebra',
            [" * Line 1: 'male:Zebra' is not valid for a boolean."]],
        // u.uroleplay's rows reach the same handler.
        ['OPTIONS=blind:Purple',
            [" * Line 1: 'blind:Purple' is not valid for a boolean."]],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(
            parsed.configErrorFrame.output,
            reported.length ? [`\n${statement}`, ...reported] : [],
            statement,
        );
    }

    // flags.time is Off by default, so a refused value and an accepted one
    // leave it at opposite values.  Without this the rows above pass whether
    // the port reports and sets or reports and leaves the option alone.
    assert.equal(parseNethackrc('OPTIONS=time:zebra\n').flags.time, false);
    assert.equal(parseNethackrc('OPTIONS=time:on\n').flags.time, true);
    assert.equal(parseNethackrc('OPTIONS=time:0\n').flags.time, false);

    // Six of applyBooleanOption()'s arms write more than the option's own
    // flag, so the refusal has to stop ahead of the whole dispatch rather
    // than inside the arm that owns the flag.  Two of the six are checked
    // here.  "male" writes flags.female, flags.initgend and the selected
    // gender, which start at the -1 that means no gender has been chosen.
    const male = parseNethackrc('OPTIONS=male:Zebra\n');
    assert.equal(male.flags.initgend, -1);
    assert.equal(male.gender, -1);
    assert.equal(parseNethackrc('OPTIONS=male\n').flags.initgend, 0);

    // hilite_pet also raises iflags.wc2_petattr off ATR_NONE, which the
    // petattr statement above it puts the field at.
    const pet = parseNethackrc(
        'OPTIONS=petattr:none\nOPTIONS=hilite_pet:Zebra\n',
    );
    assert.equal(pet.iflags.wc_hilite_pet, false);
    assert.equal(pet.iflags.wc2_petattr, ATR_NONE);
    assert.equal(
        parseNethackrc('OPTIONS=petattr:none\nOPTIONS=hilite_pet\n')
            .iflags.wc2_petattr,
        ATR_INVERSE,
    );

    // setRoleplay() has the same shape, and pauper writes nudist beside it.
    assert.equal(
        parseNethackrc('OPTIONS=blind:Purple\n').uroleplay.blind, false,
    );
    assert.equal(parseNethackrc('OPTIONS=blind\n').uroleplay.blind, true);
    assert.equal(
        parseNethackrc('OPTIONS=pauper:Purple\n').uroleplay.nudist, false,
    );
    assert.equal(parseNethackrc('OPTIONS=pauper\n').uroleplay.nudist, true);

    // The rest of the file is read after the report: showexp sits on the line
    // below the refused one and still reaches flags.
    const continuedAfterValue = parseNethackrc(
        'OPTIONS=time:zebra\nOPTIONS=showexp\n',
    );
    assert.equal(continuedAfterValue.flags.time, false);
    assert.equal(continuedAfterValue.flags.showexp, true);
    assert.equal(continuedAfterValue.configErrorFrame.num_errors, 1);
});

// global.h enum optset_restrictions.  optfn_boolean():5211 retreats on this
// one for the whole of a configuration-file read, because its guard is
// `go.opt_initial && allopt[optidx].setwhere == set_wiznofuz` and
// go.opt_initial is true throughout.
const SET_WIZNOFUZ = 6;

// The three exits optfn_boolean() takes before `*(allopt[optidx].addr)` that
// report nothing at all: a row whose #ifdef arm compiled its storage away
// (5203), one that must not come from a configuration file (5207), and one
// whose optlist.h valok lets an unreadable value stand (5233).
const SILENT_BOOLEAN_ROWS = new Set(allopt
    .filter((option) => option.opttyp === 'BoolOpt'
        && (!option.addr || option.setwhere === SET_WIZNOFUZ || option.valok))
    .map((option) => option.name));

// C refs: options.c string_for_opt() (6664-6673), whose `!colon || !*++colon`
// answers empty_optstr for a statement that ends on its separator as well as
// for one that carries none, and optfn_boolean() (5213), which skips its whole
// value block for empty_optstr and leaves the row taking !negated at 5285.
test('a boolean whose separator ends the statement takes the negation', () => {
    // sortpack starts On and autodig starts Off, so the rows below cover a
    // negation that changes the flag and one that does not.  string_for_opt()
    // finds a trailing '=' the same way it finds a trailing ':'.  Both options
    // store in flags under their own name, which is what makes the value
    // visible here.
    for (const [statement, sortpack, autodig] of [
        ['OPTIONS=sortpack:', true, false],
        ['OPTIONS=!sortpack:', false, false],
        ['OPTIONS=sortpack=', true, false],
        ['OPTIONS=autodig:', true, true],
        ['OPTIONS=!autodig:', true, false],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
        assert.equal(parsed.flags.sortpack, sortpack, statement);
        assert.equal(parsed.flags.autodig, autodig, statement);
    }

    // parseoptions():644 hands every BoolOpt row to optfn_boolean(), so none
    // of them may report or stop the read.  bad_negation() answers a row whose
    // negateok is No before the handler runs, which the sweep leaves out.
    for (const row of allopt.filter((option) => option.opttyp === 'BoolOpt'
                                                && option.negateok)) {
        assert.deepEqual(
            parseNethackrc(`OPTIONS=!${row.name}:\n`).configErrorFrame.output,
            [],
            row.name,
        );
    }
});

// C ref: options.c optfn_boolean() (5233-5237) again, this time over the whole
// table.  parseoptions() reaches the handler through allopt[matchidx].optfn,
// so the row's type decides whether the message is emitted, whatever the port
// does with the value afterwards.
test('an unreadable boolean value reports for every row that rejects one',
    () => {
        // Six rows compiled their storage away, three are set_wiznofuz and
        // menucolors admits any value, leaving 103 of the 113 to report.
        assert.equal(SILENT_BOOLEAN_ROWS.size, 10);
        for (const row of allopt.filter(
            (option) => option.opttyp === 'BoolOpt',
        )) {
            const statement = `OPTIONS=${row.name}:zebra`;
            assert.deepEqual(
                parseNethackrc(`${statement}\n`).configErrorFrame.output,
                SILENT_BOOLEAN_ROWS.has(row.name) ? [] : [
                    `\n${statement}`,
                    ` * Line 1: '${row.name}:zebra' is not valid for a`
                    + ' boolean.',
                ],
                row.name,
            );
        }

        // menucolors keeps `negated` as it was and reaches the assignment, so
        // the value C cannot read still turns the option on.
        const menucolors = parseNethackrc('OPTIONS=menucolors:zebra\n');
        assert.equal(menucolors.iflags.use_menu_color, true);
        assert.equal(menucolors.flags.menucolors, undefined);
    });

// C ref: options.c optfn_boolean() (5203-5208), the two do_set exits taken
// before the value is read at all.  Neither consults the negation or the
// value, so every spelling has to reach them, and neither reports.
test('the silent boolean retreats fire whatever the statement carries', () => {
    const noStorage = allopt.filter(
        (option) => option.opttyp === 'BoolOpt' && !option.addr,
    );
    const wizNoFuz = allopt.filter(
        (option) => option.opttyp === 'BoolOpt'
            && option.setwhere === SET_WIZNOFUZ,
    );
    // optlist.h compiles six rows' storage away for this build and gives
    // three the setwhere that keeps them out of a configuration file.
    assert.equal(noStorage.length, 6);
    assert.equal(wizNoFuz.length, 3);

    for (const row of [...noStorage, ...wizNoFuz]) {
        const spellings = [
            `OPTIONS=${row.name}`,
            `OPTIONS=${row.name}:on`,
            `OPTIONS=${row.name}:zebra`,
        ];
        // bad_negation() answers a row whose negateok is No before the
        // handler runs, so those two spellings never reach the retreat.
        if (row.negateok) {
            spellings.push(`OPTIONS=!${row.name}`, `OPTIONS=!${row.name}:on`);
        }
        for (const statement of spellings) {
            const parsed = parseNethackrc(`${statement}\n`);
            assert.deepEqual(parsed.configErrorFrame.output, [], statement);
            // Nothing reached the dispatch that would have stored a value.
            assert.equal(parsed.flags[row.name], undefined, statement);
            if (row.addr) {
                // The three set_wiznofuz rows do have storage, and C leaves it
                // at the compiled-in default.
                assert.equal(row.addr, `iflags.${row.name}`, row.name);
                assert.equal(
                    parsed.iflags[row.name], row.initval, statement,
                );
            }
        }
    }
});

// C ref: options.c optfn_boolean() (5244-5266), `case opt_female:`.  Its two
// guards compare max(strlen(op), 3) bytes of the whole statement against
// "female" and "male"; a value long enough to defeat both leaves the switch
// through its `break` and takes the ordinary `*(allopt[optidx].addr) =
// !negated`, which writes flags.female without flags.initgend beside it.
test('a gender statement too long to match its own name falls through', () => {
    // "false" is five bytes, so the compare reads "male:" against "male" and
    // stops on the separator: C stores !negated, which the value block has
    // already made TRUE, so flags.female ends FALSE where the male branch
    // would have made it TRUE.  Nothing has chosen a gender, so initgend and
    // the port's mirror of it stay at ROLE_NONE.
    const fellThrough = parseNethackrc('OPTIONS=male:false\n');
    assert.deepEqual(fellThrough.configErrorFrame.output, []);
    assert.equal(fellThrough.flags.female, false);
    assert.equal(fellThrough.flags.initgend, -1);
    assert.equal(fellThrough.gender, -1);

    // "off" is three bytes, so max(ln, 3) reads only "mal" and the male
    // branch takes it: flags.female becomes `negated`, which the value block
    // set TRUE.
    const matched = parseNethackrc('OPTIONS=male:off\n');
    assert.equal(matched.flags.female, true);
    assert.equal(matched.flags.initgend, 1);
    assert.equal(matched.gender, 1);

    // "female" is six bytes, so only a seven-byte value defeats it.  atoi()
    // reads seven zeroes as 0, which is a value optfn_boolean() accepts.
    const longFemale = parseNethackrc('OPTIONS=female:0000000\n');
    assert.deepEqual(longFemale.configErrorFrame.output, []);
    assert.equal(longFemale.flags.female, false);
    assert.equal(longFemale.flags.initgend, -1);

    // The guards read the statement, not the row the match loop settled on,
    // so an abbreviation that no longer spells "female" falls through as
    // well: "fem:false" compares "fem:f" against "femal".
    const abbreviated = parseNethackrc('OPTIONS=fem:false\n');
    assert.deepEqual(abbreviated.configErrorFrame.output, []);
    assert.equal(abbreviated.flags.female, false);
    assert.equal(abbreviated.flags.initgend, -1);

    // flags.female starts FALSE, so a value that reads as TRUE is what makes
    // the fall-through's own write visible: digit(*op) sends "00001" to
    // atoi(), which answers 1, and its five bytes defeat both compares.  C
    // stores TRUE where the male branch would have stored FALSE.
    for (const statement of ['OPTIONS=male:00001', 'OPTIONS=fem:00001']) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
        assert.equal(parsed.flags.female, true, statement);
        assert.equal(parsed.flags.initgend, -1, statement);
        assert.equal(parsed.gender, -1, statement);
    }

    // Six bytes still match "female" itself, and three still match "fem".
    for (const [statement, female, initgend] of [
        ['OPTIONS=female:false', false, 0],
        ['OPTIONS=fem:no', false, 0],
        ['OPTIONS=female:true', true, 1],
        ['OPTIONS=!female', false, 0],
        ['OPTIONS=male', false, 0],
        ['OPTIONS=!male', true, 1],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
        assert.equal(parsed.flags.female, female, statement);
        assert.equal(parsed.flags.initgend, initgend, statement);
        assert.equal(parsed.gender, initgend, statement);
    }
});

// C ref: options.c parseoptions() (639-644) over every CompOpt row it can
// dispatch from a configuration file.  Nothing a handler does with a value it
// cannot read may end the read: C's worst answer is optn_silenterr, which
// parseoptions() turns into a discarded FALSE.
//
// What a configuration read turns on is the message count.  One message more
// or fewer moves config_error_done()'s summary row, and the tty_wait_synch()
// boundary that follows it, so the sweep below asserts each statement's whole
// output rather than the shape of the lines it happened to write.
//
// The three spellings the sweep gives every row.  string_for_opt() answers
// empty_optstr for the first two alike -- no separator at all, and a separator
// that ends the statement -- and the third is four bytes no option's value
// grammar accepts.
const COMPOUND_SWEEP_SUFFIXES = Object.freeze(['', ':', ':zqxj']);

// C ref: options.c pfxfn_font()'s unknown-optidx arm followed by
// parseoptions()'s pfx_match diagnostic.  The first case is the selected fresh
// witness; the other two pin the delimiter stripping in the second message.
test('malformed font prefixes report both source diagnostics', () => {
    for (const [option, suffix] of [
        ['fontbogus:value', 'fontbogus'],
        ['font', 'font'],
        ['font_size_bogus=', 'font_size_bogus='],
    ]) {
        const parsed = parseNethackrc(`OPTIONS=${option}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=${option}`,
            ` * Line 1: Unknown font parameter '${option}'.`,
            ` * Line 1: bad option suffix variation '${suffix}'.`,
        ], option);
    }
});

// Every message this parser writes for those three spellings, in that order,
// without config_erradd()'s " * Line 1: " prefix.  A C recording of all 285
// spellings confirms each one, message for message.
const COMPOUND_SWEEP_REPORTS = new Map([
    ['playmode', [
        [],
        [],
        ['Invalid value for "playmode":zqxj.'],
    ]],
    ['disclose', [
        [],
        [],
        ["Unknown disclose parameter 'z'."],
    ]],
    ['name', [
        ["Missing parameter for 'name'."],
        ["Missing parameter for 'name:'."],
        [],
    ]],
    ['role', [
        ["Missing parameter for 'role'."],
        ["Missing parameter for 'role:'."],
        ["Unknown role 'zqxj'."],
    ]],
    ['race', [
        ["Missing parameter for 'race'."],
        ["Missing parameter for 'race:'."],
        ["Unknown race 'zqxj'."],
    ]],
    ['gender', [
        ["Missing parameter for 'gender'."],
        ["Missing parameter for 'gender:'."],
        ["Unknown gender 'zqxj'."],
    ]],
    ['alignment', [
        ["Missing parameter for 'alignment'."],
        ["Missing parameter for 'alignment:'."],
        ["Unknown alignment 'zqxj'."],
    ]],
    ['fruit', [
        ["Missing parameter for 'fruit'."],
        ["Missing parameter for 'fruit:'."],
        [],
    ]],
    ['font_map', [
        ["Missing parameter for 'font_map'."],
        ["Missing parameter for 'font_map:'."],
        [],
    ]],
    ['font_menu', [
        ["Missing parameter for 'font_menu'."],
        ["Missing parameter for 'font_menu:'."],
        [],
    ]],
    ['font_message', [
        ["Missing parameter for 'font_message'."],
        ["Missing parameter for 'font_message:'."],
        [],
    ]],
    ['font_size_map', [
        ["Missing parameter for 'font_size_map'."],
        ["Missing parameter for 'font_size_map:'."],
        [],
    ]],
    ['font_size_menu', [
        ["Missing parameter for 'font_size_menu'."],
        ["Missing parameter for 'font_size_menu:'."],
        [],
    ]],
    ['font_size_message', [
        ["Missing parameter for 'font_size_message'."],
        ["Missing parameter for 'font_size_message:'."],
        [],
    ]],
    ['font_size_status', [
        ["Missing parameter for 'font_size_status'."],
        ["Missing parameter for 'font_size_status:'."],
        [],
    ]],
    ['font_size_text', [
        ["Missing parameter for 'font_size_text'."],
        ["Missing parameter for 'font_size_text:'."],
        [],
    ]],
    ['font_status', [
        ["Missing parameter for 'font_status'."],
        ["Missing parameter for 'font_status:'."],
        [],
    ]],
    ['font_text', [
        ["Missing parameter for 'font_text'."],
        ["Missing parameter for 'font_text:'."],
        [],
    ]],
    ['hilite_status', [
        ['Value is mandatory for hilite_status.'],
        ['Value is mandatory for hilite_status.'],
        [],
    ]],
    ['menu_deselect_all', [
        ["Missing parameter for 'menu_deselect_all'."],
        ["Missing parameter for 'menu_deselect_all:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_deselect_page', [
        ["Missing parameter for 'menu_deselect_page'."],
        ["Missing parameter for 'menu_deselect_page:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_first_page', [
        ["Missing parameter for 'menu_first_page'."],
        ["Missing parameter for 'menu_first_page:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_headings', [
        [],
        [],
        ["Unknown color 'zqxj'."],
    ]],
    ['menu_invert_all', [
        ["Missing parameter for 'menu_invert_all'."],
        ["Missing parameter for 'menu_invert_all:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_invert_page', [
        ["Missing parameter for 'menu_invert_page'."],
        ["Missing parameter for 'menu_invert_page:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_last_page', [
        ["Missing parameter for 'menu_last_page'."],
        ["Missing parameter for 'menu_last_page:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_next_page', [
        ["Missing parameter for 'menu_next_page'."],
        ["Missing parameter for 'menu_next_page:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_previous_page', [
        ["Missing parameter for 'menu_previous_page'."],
        ["Missing parameter for 'menu_previous_page:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_search', [
        ["Missing parameter for 'menu_search'."],
        ["Missing parameter for 'menu_search:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_select_all', [
        ["Missing parameter for 'menu_select_all'."],
        ["Missing parameter for 'menu_select_all:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_select_page', [
        ["Missing parameter for 'menu_select_page'."],
        ["Missing parameter for 'menu_select_page:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_shift_left', [
        ["Missing parameter for 'menu_shift_left'."],
        ["Missing parameter for 'menu_shift_left:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menu_shift_right', [
        ["Missing parameter for 'menu_shift_right'."],
        ["Missing parameter for 'menu_shift_right:'."],
        ["Reserved menu command key '^@'."],
    ]],
    ['menustyle', [
        ["Missing parameter for 'menustyle'."],
        ["Missing parameter for 'menustyle:'."],
        ["Unknown menustyle parameter 'zqxj'."],
    ]],
    ['msghistory', [
        ["Missing parameter for 'msghistory'."],
        ["Missing parameter for 'msghistory:'."],
        [],
    ]],
    ['msg_window', [
        [],
        [],
        ["Unknown msg_window parameter 'zqxj'."],
    ]],
    ['number_pad', [
        [],
        ["Missing parameter for 'number_pad:'."],
        ["Illegal number_pad parameter 'zqxj'."],
    ]],
    ['packorder', [
        [],
        [],
        [
            "Not an object class 'z'.",
            "Not an object class 'q'.",
            "Not an object class 'x'.",
            "Not an object class 'j'.",
        ],
    ]],
    ['petattr', [
        ["Missing parameter for 'petattr'."],
        ["Missing parameter for 'petattr:'."],
        ["Unknown petattr parameter 'petattr:zqxj'."],
    ]],
    ['pettype', [
        ["Missing parameter for 'pettype'."],
        ["Missing parameter for 'pettype:'."],
        ["Unrecognized pet type 'zqxj'."],
    ]],
    ['pickup_burden', [
        ["Missing parameter for 'pickup_burden'."],
        ["Missing parameter for 'pickup_burden:'."],
        ["Unknown pickup_burden parameter 'zqxj'."],
    ]],
    ['pickup_types', [
        ["Missing parameter for 'pickup_types'."],
        ["Missing parameter for 'pickup_types:'."],
        ["Unknown pickup_types parameter ''."],
    ]],
    ['paranoid_confirmation', [
        ["paranoid_confirmation requires a value; use 'none' to cancel all."],
        ["paranoid_confirmation requires a value; use 'none' to cancel all."],
        ["Unknown paranoid_confirmation parameter 'zqxj'."],
    ]],
    ['pile_limit', [
        ["Missing parameter for 'pile_limit'."],
        ["Missing parameter for 'pile_limit:'."],
        [],
    ]],
    ['runmode', [
        ['Value is mandatory for runmode.'],
        ['Value is mandatory for runmode.'],
        ["Unknown runmode parameter 'zqxj'."],
    ]],
    ['sortloot', [
        ["Missing parameter for 'sortloot'."],
        ["Missing parameter for 'sortloot:'."],
        ["Unknown sortloot parameter 'zqxj'."],
    ]],
    ['sortdiscoveries', [
        ["Missing parameter for 'sortdiscoveries'."],
        ["Missing parameter for 'sortdiscoveries:'."],
        ["Unknown sortdiscoveries parameter 'zqxj'."],
    ]],
    ['symset', [
        [],
        [],
        ['Unable to load symbol set "zqxj" from "symbols".'],
    ]],
    ['statuslines', [
        [
            "Missing parameter for 'statuslines'.",
            "'statuslines:' is invalid; must be 2 or 3.",
        ],
        [
            "Missing parameter for 'statuslines:'.",
            "'statuslines:' is invalid; must be 2 or 3.",
        ],
        ["'statuslines:zqxj' is invalid; must be 2 or 3."],
    ]],
    ['versinfo', [
        [
            "Missing parameter for 'versinfo'.",
            "'versinfo' requires a value; defaulting to 1.",
        ],
        [
            "Missing parameter for 'versinfo:'.",
            "'versinfo' requires a value; defaulting to 1.",
        ],
        ["'versinfo' must be one of 1, 2, 4, or the sum of two or all"
            + ' three of those.'],
    ]],
    ['whatis_coord', [
        ["Missing parameter for 'whatis_coord'."],
        ["Missing parameter for 'whatis_coord:'."],
        ["Unknown whatis_coord parameter 'zqxj'."],
    ]],
]);

// The rows whose silence this port shares with C: neither writes anything for
// any of the three spellings.
const SILENT_COMPOUND_ROWS = new Set([
    'altkeyhandling',
    'catname',
    'DECgraphics',
    'dogname',
    'dungeon',
    'effects',
    'glyph',
    'horsename',
    'IBMgraphics',
    'menu_objsyms',
    'menuinvertmode',
    'monsters',
    'objects',
    'statushilites',
    'suppress_alert',
    'tile_file',
    'traps',
]);

// The rows whose silence is this parser's alone.  applyOption() stores the
// value instead of running the handler, so C reports where the port says
// nothing.  The counts are how many messages C writes for the three
// spellings, taken from the same recording.  Naming every row and its count is
// what makes a row crossing between these three collections an edit rather
// than a silent pass, and it is the target for whichever handler is ported
// next.
const UNPORTED_COMPOUND_ROWS = new Map([
    ['windowtype', [1, 1, 1]],
    ['align_message', [1, 1, 1]],
    ['align_status', [1, 1, 1]],
    ['autounlock', [0, 0, 1]],
    ['boulder', [1, 1, 1]],
    ['crash_email', [1, 1, 0]],
    ['crash_name', [1, 1, 0]],
    ['crash_urlmax', [1, 1, 1]],
    ['map_mode', [1, 1, 1]],
    ['mouse_support', [0, 1, 1]],
    ['perminv_mode', [1, 1, 1]],
    ['player_selection', [1, 1, 1]],
    ['roguesymset', [0, 0, 1]],
    ['scores', [1, 1, 1]],
    ['scroll_amount', [1, 1, 0]],
    ['scroll_margin', [1, 1, 0]],
    ['sortvanquished', [1, 1, 0]],
    ['soundlib', [1, 1, 0]],
    ['term_cols', [1, 1, 1]],
    ['term_rows', [1, 1, 1]],
    ['tile_height', [1, 1, 0]],
    ['tile_width', [1, 1, 0]],
    ['vary_msgcount', [1, 1, 0]],
    ['warnings', [1, 1, 0]],
    ['whatis_filter', [1, 1, 1]],
    ['windowborders', [1, 1, 0]],
    ['windowcolors', [1, 1, 1]],
]);

test('every compound option reports exactly what this parser owes it', () => {
    // optlist.h gives both prefix rows setwhere set_hidden, which labels them
    // "placeholder for prefixed entries" rather than stating a reachability
    // rule: neither parse_config_line() nor parseoptions() consults setwhere
    // at all.  What keeps the two out of a by-name sweep is their pfx flag.
    // options.c:556-560 matches such a row by prefix and lets the suffix pick
    // the handler, and applyOption() stops a statement that lands on one.
    assert.deepEqual(
        allopt.filter((option) => option.opttyp === 'CompOpt' && option.pfx)
            .map((option) => option.name),
        ['cond_', 'font'],
    );
    const rows = allopt.filter((option) => option.opttyp === 'CompOpt'
                                           && !option.pfx);
    assert.equal(rows.length, 95);
    assert.equal(COMPOUND_SWEEP_REPORTS.size, 51);
    assert.equal(SILENT_COMPOUND_ROWS.size, 17);
    assert.equal(UNPORTED_COMPOUND_ROWS.size, 27);

    let owed = 0;
    for (const row of rows) {
        const reported = COMPOUND_SWEEP_REPORTS.get(row.name);
        const unported = UNPORTED_COMPOUND_ROWS.get(row.name);
        // Exactly one of the three collections holds each row.
        const silent = SILENT_COMPOUND_ROWS.has(row.name) || undefined;
        assert.equal(
            [reported, unported, silent]
                .filter((entry) => entry !== undefined).length,
            1,
            row.name,
        );
        COMPOUND_SWEEP_SUFFIXES.forEach((suffix, index) => {
            const statement = `OPTIONS=${row.name}${suffix}`;
            const messages = reported ? reported[index] : [];
            const parsed = parseNethackrc(`${statement}\n`);
            assert.deepEqual(
                parsed.configErrorFrame.output,
                messages.length
                    ? [`\n${statement}`,
                        ...messages.map((text) => ` * Line 1: ${text}`)]
                    : [],
                statement,
            );
            // num_errors is what config_error_done() prints, and whether it is
            // zero is what decides that there is a raw-print screen at all.
            assert.equal(
                parsed.configErrorFrame.num_errors, messages.length, statement,
            );
            if (unported) owed += unported[index];
        });
    }
    // 65 messages over 27 rows: what porting those handlers is worth to a
    // configuration file that names one.
    assert.equal(owed, 65);
});

// C ref: options.c paranoia[] and optfn_paranoid_confirmation()'s do_set
// request.  Each accepted spelling writes only flags.paranoia_bits; the raw
// option text is not a second state value.
test('startup paranoid_confirmation parses every name and synonym', () => {
    // The masks are flag.h:83-95 literals rather than imported constants, so
    // drift in const.js cannot validate the parser table against itself.
    const rows = [
        [0x0001, 'C', 'Pa'],
        [0x0002, 'q', 'ex'],
        [0x0004, 'd', 'de'],
        [0x0008, 'b', null],
        [0x0010, 'a', 'h'],
        [0x0080, 'wa', 'br'],
        [0x0200, 'e', 'cont'],
        [0x0100, 'We', null],
        [0x0020, 'p', null],
        [0x0800, 't', 'm'],
        [0x1000, 'Au', 'autose'],
        [0x0400, 's', null],
        [0x0040, 'R', 'Ta'],
        [0, 'none', null],
        [0xFFFFFFFF, 'all', null],
    ];
    for (const [mask, primary, synonym] of rows) {
        for (const spelling of [primary, synonym].filter(Boolean)) {
            const parsed = parseNethackrc(
                `OPTIONS=paranoid_confirmation:${spelling}\n`,
            );
            assert.equal(parsed.flags.paranoia_bits, mask >>> 0, spelling);
            assert.equal(
                parsed.flags.paranoid_confirmation, undefined, spelling,
            );
            assert.deepEqual(parsed.configErrorFrame.output, [], spelling);
        }
    }

    // Both two-letter primaries require both letters; one is not a match.
    for (const spelling of ['w', 'W']) {
        const parsed = parseNethackrc(
            `OPTIONS=paranoid_confirmation:${spelling}\n`,
        );
        assert.equal(parsed.flags.paranoia_bits, 0, spelling);
        assert.match(
            parsed.configErrorFrame.output.at(-1),
            /Unknown paranoid_confirmation parameter/u,
            spelling,
        );
    }
    // "a"ttack takes precedence over "A"utoall, as paranoia[]'s source
    // comment specifies; Autoall therefore needs its two-letter minimum.
    assert.equal(
        parseNethackrc('OPTIONS=paranoid_confirmation:A\n')
            .flags.paranoia_bits,
        PARANOID_HIT,
    );
});

test('startup paranoid_confirmation applies list modifiers in token order',
    () => {
        const defaults = PARANOID_PRAY | PARANOID_SWIM | PARANOID_TRAP;
        const cases = [
            ['+die', defaults | PARANOID_DIE],
            ['-pray trap', PARANOID_SWIM],
            ['+!pray noTrap', PARANOID_SWIM],
            ['die !die pray', PARANOID_PRAY],
            ['all', 0xFFFFFFFF],
            ['-all', 0],
            ['+all', 0xFFFFFFFF],
            ['+none', defaults],
            ['-none', defaults],
            ['pray none trap', PARANOID_TRAP],
        ];
        for (const [value, expected] of cases) {
            const parsed = parseNethackrc(
                `OPTIONS=paranoid_confirmation:${value}\n`,
            );
            assert.equal(
                parsed.flags.paranoia_bits, expected >>> 0, value,
            );
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }
    });

test('startup paranoid_confirmation preserves partial state on an error',
    () => {
        const statement = 'OPTIONS=paranoid_confirmation:die pray zqxj';
        const parsed = parseNethackrc(`${statement}\n`);
        assert.equal(
            parsed.flags.paranoia_bits, PARANOID_DIE | PARANOID_PRAY,
        );
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            " * Line 1: Unknown paranoid_confirmation parameter 'zqxj'.",
        ]);

        // options.c's mutable walk accepts one space after '!', but its
        // misspelled no-prefix predicate advances onto a space and therefore
        // reports the empty token after clearing the starting default.
        assert.equal(parseNethackrc(
            'OPTIONS=paranoid_confirmation:! pray\n',
        ).flags.paranoia_bits, 0);
        const noSpace = parseNethackrc(
            'OPTIONS=paranoid_confirmation:no pray\n',
        );
        assert.equal(noSpace.flags.paranoia_bits, 0);
        assert.match(
            noSpace.configErrorFrame.output.at(-1),
            /Unknown paranoid_confirmation parameter ''/u,
        );

        // match_optname() receives val_allowed FALSE for both a primary name
        // and a synonym.  A delimiter inside the token therefore stays part
        // of it and makes the whole token unknown.
        for (const value of ['pray:tail', 'death:tail']) {
            const delimited = parseNethackrc(
                `OPTIONS=paranoid_confirmation:${value}\n`,
            );
            assert.equal(delimited.flags.paranoia_bits, 0, value);
            assert.match(
                delimited.configErrorFrame.output.at(-1),
                new RegExp(`Unknown paranoid_confirmation parameter '${value}'`,
                    'u'),
                value,
            );
        }
    });

test('startup paranoid_confirmation composes duplicates right to left', () => {
    const setAfterClear = parseNethackrc(
        'OPTIONS=paranoid_confirmation:+die,paranoid_confirmation:none\n',
    );
    assert.equal(setAfterClear.flags.paranoia_bits, PARANOID_DIE);
    const clearAfterSet = parseNethackrc(
        'OPTIONS=paranoid_confirmation:none,paranoid_confirmation:+die\n',
    );
    assert.equal(clearAfterSet.flags.paranoia_bits, 0);
    assert.deepEqual(setAfterClear.configErrorFrame.output, []);
    assert.deepEqual(clearAfterSet.configErrorFrame.output, []);

    // using_alias is line-wide after the comma recursion, but the handler
    // identifies prayconfirm from its own opts pointer.  Neither an unrelated
    // alias nor a prayconfirm element to the right changes how this canonical
    // element is parsed.
    const unrelatedAlias = parseNethackrc(
        'OPTIONS=paranoid_confirmation:none,align:lawful\n',
    );
    assert.equal(unrelatedAlias.flags.paranoia_bits, 0);
    assert.deepEqual(unrelatedAlias.configErrorFrame.output, []);
    const prayconfirmToRight = parseNethackrc(
        'OPTIONS=paranoid_confirmation:none,prayconfirm\n',
    );
    assert.equal(prayconfirmToRight.flags.paranoia_bits, 0);
    assert.equal(prayconfirmToRight.configErrorFrame.num_errors, 1);
    assert.match(
        prayconfirmToRight.configErrorFrame.output.at(-1),
        /switching to paranoid_confirmation:\+pray/u,
    );
});

test('prayconfirm reports deprecation and changes only the prayer bit', () => {
    const enabled = parseNethackrc(
        'OPTIONS=!paranoid_confirmation\nOPTIONS=prayconfirm\n',
    );
    assert.equal(enabled.flags.paranoia_bits, PARANOID_PRAY);
    assert.match(
        enabled.configErrorFrame.output.at(-1),
        /prayconfirm option is deprecated; switching to paranoid_confirmation:\+pray/u,
    );

    const disabled = parseNethackrc('OPTIONS=!prayconfirm\n');
    assert.equal(
        disabled.flags.paranoia_bits, PARANOID_SWIM | PARANOID_TRAP,
    );
    assert.match(
        disabled.configErrorFrame.output.at(-1),
        /!prayconfirm option is deprecated; switching to paranoid_confirmation:-pray/u,
    );

    const parameter = parseNethackrc('OPTIONS=prayconfirm:true\n');
    assert.equal(
        parameter.flags.paranoia_bits,
        PARANOID_PRAY | PARANOID_SWIM | PARANOID_TRAP,
    );
    assert.match(
        parameter.configErrorFrame.output.at(-1),
        /deprecated prayconfirm option takes no parameters \(found 'true'\)/u,
    );
});

test('paranoid_confirmation reports missing and negated values exactly', () => {
    const statements = [
        [
            'paranoid_confirmation',
            "paranoid_confirmation requires a value; use 'none' to cancel all",
        ],
        [
            '!paranoid_confirmation:pray',
            '!paranoid_confirmation does not accept a value',
        ],
    ];
    for (const [option, message] of statements) {
        const statement = `OPTIONS=${option}`;
        const parsed = parseNethackrc(`${statement}\n`);
        assert.equal(
            parsed.flags.paranoia_bits,
            PARANOID_PRAY | PARANOID_SWIM | PARANOID_TRAP,
            option,
        );
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            ` * Line 1: ${message}.`,
        ]);
    }
    assert.equal(
        parseNethackrc('OPTIONS=!paranoid_confirmation\n')
            .flags.paranoia_bits,
        0,
    );
});

// C ref: options.c optfn_sortdiscoveries() (3863-3903).  Its startup
// do_set request stores one of disco_order_let[]'s four bytes in
// flags.discosort; the raw option name is not another state value.
test('startup sortdiscoveries parses first bytes and negated resets', () => {
    const defaults = parseNethackrc('');
    assert.equal(defaults.flags.discosort, 'o');
    assert.equal(defaults.flags.sortdiscoveries, undefined);

    for (const [value, order] of [
        ['0-tail', 'o'],
        ['Order-tail', 'o'],
        ['1-tail', 's'],
        ['Sortloot-tail', 's'],
        ['2-tail', 'c'],
        ['Class-tail', 'c'],
        ['3-tail', 'a'],
        ['Alphabetical-tail', 'a'],
    ]) {
        const parsed = parseNethackrc(`OPTIONS=sortdiscoveries:${value}\n`);
        assert.equal(parsed.flags.discosort, order, value);
        assert.equal(parsed.flags.sortdiscoveries, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }

    // string_for_env_opt() reports before the handler examines negated, then
    // both missing-value spellings still restore the default order.  A value
    // on a negated statement is ignored rather than diagnosed.
    for (const statement of ['!sortdiscoveries', '!sortdiscoveries:']) {
        const parsed = parseNethackrc(
            `OPTIONS=sortdiscoveries:3\nOPTIONS=${statement}\n`,
        );
        assert.equal(parsed.flags.discosort, 'o', statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\nOPTIONS=${statement}`,
            ' * Line 2: compound option specified multiple times:'
                + ' sortdiscoveries.',
            ` * Line 2: Missing parameter for '${statement.slice(1)}'.`,
        ], statement);
    }
    const negatedValue = parseNethackrc(
        'OPTIONS=sortdiscoveries:2\nOPTIONS=!sortdiscoveries:zqxj\n',
    );
    assert.equal(negatedValue.flags.discosort, 'o');
    assert.deepEqual(negatedValue.configErrorFrame.output, [
        '\nOPTIONS=!sortdiscoveries:zqxj',
        ' * Line 2: compound option specified multiple times:'
            + ' sortdiscoveries.',
    ]);

    // An unknown positive parameter returns optn_silenterr after its report.
    // The prior accepted value remains, and the file continues with later
    // statements even though duplicate detection reports this second use.
    const unknown = parseNethackrc(
        'OPTIONS=sortdiscoveries:3\n'
            + 'OPTIONS=sortdiscoveries:zqxj\nOPTIONS=!color\n',
    );
    assert.equal(unknown.flags.discosort, 'a');
    assert.equal(unknown.iflags.wc_color, false);
    assert.deepEqual(unknown.configErrorFrame.output, [
        '\nOPTIONS=sortdiscoveries:zqxj',
        ' * Line 2: compound option specified multiple times:'
            + ' sortdiscoveries.',
        " * Line 2: Unknown sortdiscoveries parameter 'zqxj'.",
    ]);
});

// C refs: options.c optfn_packorder() (2670-2691), change_inv_order()
// (7466-7508), and def_inv_order[] (118-123).  The parser supplies statements
// right to left, and each change fills omissions from the order installed by
// the preceding call.  flags.inv_order is the result: no raw packorder value
// remains beside it.
test('startup packorder rewrites inv_order with source diagnostics and fill',
    () => {
        const defaultOrder = '$")[%?+!=/(*`0_';
        const defaults = parseNethackrc('');
        assert.equal(defaults.flags.inv_order.length, 15);
        assert.equal(defaults.flags.packorder, undefined);

        // Gold is prepended only when absent.  When supplied, it keeps its
        // requested position; omitted classes retain their previous order.
        for (const [value, order] of [
            ['%)[', '$%)["?+!=/(*`0_'],
            ['[%$', '[%$")?+!=/(*`0_'],
        ]) {
            const parsed = parseNethackrc(`OPTIONS=packorder:${value}\n`);
            assert.equal(parsed.flags.packorder, undefined, value);
            assert.equal(oc_to_str(parsed.flags.inv_order), order, value);
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }

        const validResult = parseNethackrc('');
        assert.equal(change_inv_order(validResult, '%)['), true);
        const invalidResult = parseNethackrc('');
        assert.equal(change_inv_order(invalidResult, '%Z'), false);

        for (const suffix of ['', ':']) {
            const statement = `OPTIONS=packorder${suffix}`;
            const parsed = parseNethackrc(`${statement}\n`);
            assert.equal(
                oc_to_str(parsed.flags.inv_order), defaultOrder, statement,
            );
            assert.deepEqual(parsed.configErrorFrame.output, [], statement);
        }

        // The rightmost statement runs first.  The left one therefore fills
        // from `$)?"[%+...`, not from def_inv_order[], and its duplicate-option
        // report does not prevent either handler call.
        const repeated = parseNethackrc(
            'OPTIONS=packorder:[%,packorder:)?\n',
        );
        assert.equal(oc_to_str(repeated.flags.inv_order), '$[%)?"+!=/(*`0_');
        assert.deepEqual(repeated.configErrorFrame.output, [
            '\nOPTIONS=packorder:[%,packorder:)?',
            ' * Line 1: compound option specified multiple times: packorder.',
        ]);

        // change_inv_order() diagnoses every rejected byte and still commits
        // `%`, `[`, the final `)`, and `(`.  strchr(sp + 1, *sp) rejects each
        // non-final `)` rather than only the first duplicate.
        const partial = parseNethackrc('OPTIONS=packorder:%[ZZ].))))(\n');
        assert.equal(oc_to_str(partial.flags.inv_order), '$%[)("?+!=/*`0_');
        assert.deepEqual(partial.configErrorFrame.output, [
            '\nOPTIONS=packorder:%[ZZ].))))(',
            " * Line 1: Not an object class 'Z'.",
            " * Line 1: Not an object class 'Z'.",
            " * Line 1: Object class ']' not allowed.",
            " * Line 1: Object class '.' not allowed.",
            " * Line 1: Duplicate object class ')'.",
            " * Line 1: Duplicate object class ')'.",
            " * Line 1: Duplicate object class ')'.",
        ]);

        // C walks the UTF-8 bytes C3 A9 separately.  The frame preserves each
        // raw byte as a byte-string escape, so re-encoding both messages gives
        // one diagnostic for each input byte rather than one for `é`.
        const multibyte = parseNethackrc('OPTIONS=packorder:é%\n');
        assert.equal(oc_to_str(multibyte.flags.inv_order), '$%\")[?+!=/(*`0_');
        assert.equal(multibyte.configErrorFrame.output.length, 3);
        assert.deepEqual(
            multibyte.configErrorFrame.output.slice(1).map(
                (message) => encodeUtf8ByteString(message).at(-3),
            ),
            [0xC3, 0xA9],
        );
    });

// C ref: options.c optfn_menustyle() (2320-2376), reached from
// parseoptions() with the abbreviation exactly as the player wrote it.  The
// handler distinguishes the five-byte minimum match from every longer bare
// spelling, defaults missing optional values from negation, and otherwise
// reads only the lowercased first byte of the value.
test('startup menustyle stores the source enum with C abbreviation semantics',
    () => {
        const defaults = parseNethackrc('');
        assert.equal(defaults.flags.menu_style, MENU_FULL);

        for (const [value, style] of [
            ['traditional-tail', MENU_TRADITIONAL],
            ['NONE', MENU_TRADITIONAL],
            ['Combination-or-anything', MENU_COMBINATION],
            ['fuller', MENU_FULL],
            ['Partial-word', MENU_PARTIAL],
        ]) {
            const parsed = parseNethackrc(`OPTIONS=menustyle:${value}\n`);
            assert.equal(parsed.flags.menu_style, style, value);
            assert.equal(parsed.flags.menustyle, undefined, value);
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }

        // MENUTYPELEN is sizeof("traditional "), but do_set's compatibility
        // rule is the literal strlen(opts) > 5.  "menus" is the shortest
        // unambiguous name and is exactly five bytes before any separator.
        const abbreviated = parseNethackrc('OPTIONS=menus\n');
        assert.equal(abbreviated.flags.menu_style, MENU_FULL);
        assert.deepEqual(abbreviated.configErrorFrame.output, []);

        for (const statement of ['menustyle', 'menustyle:']) {
            const parsed = parseNethackrc(`OPTIONS=${statement}\n`);
            assert.equal(parsed.flags.menu_style, MENU_FULL, statement);
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\nOPTIONS=${statement}`,
                ` * Line 1: Missing parameter for '${statement}'.`,
            ], statement);
        }

        for (const statement of ['!menustyle', '!menustyle:']) {
            const parsed = parseNethackrc(`OPTIONS=${statement}\n`);
            assert.equal(
                parsed.flags.menu_style, MENU_TRADITIONAL, statement,
            );
            assert.deepEqual(parsed.configErrorFrame.output, [], statement);
        }
        const negatedValue = parseNethackrc('OPTIONS=!menus:partial-tail\n');
        assert.equal(negatedValue.flags.menu_style, MENU_PARTIAL);
        assert.deepEqual(negatedValue.configErrorFrame.output, []);

        const rejected = parseNethackrc('OPTIONS=menustyle:zebra-tail\n');
        assert.equal(rejected.flags.menu_style, MENU_FULL);
        assert.deepEqual(rejected.configErrorFrame.output, [
            '\nOPTIONS=menustyle:zebra-tail',
            " * Line 1: Unknown menustyle parameter 'zebra-tail'.",
        ]);
    });

// C ref: options.c optfn_pickup_types() (3320-3390), reached with
// go.opt_initial set during the rc-file read.  These cases form the startup
// matrix: ordinary symbols, both all-class spellings, both empty-value
// spellings, and a list containing one invalid and one repeated symbol.
test('startup pickup_types converts symbols and keeps partial accepted state',
    () => {
        const valid = parseNethackrc('OPTIONS=pickup_types:%=)\n');
        assert.deepEqual(
            valid.flags.pickup_types,
            [FOOD_CLASS, RING_CLASS, WEAPON_CLASS],
        );
        assert.deepEqual(valid.configErrorFrame.output, []);

        for (const all of ['a', 'A']) {
            const parsed = parseNethackrc(`OPTIONS=pickup_types:${all}Z\n`);
            assert.deepEqual(parsed.flags.pickup_types, [], all);
            assert.deepEqual(parsed.configErrorFrame.output, [], all);
        }

        for (const suffix of ['', ':']) {
            const statement = `OPTIONS=pickup_types${suffix}`;
            const parsed = parseNethackrc(`${statement}\n`);
            assert.equal(parsed.flags.pickup, true, statement);
            assert.deepEqual(parsed.flags.pickup_types, [], statement);
            assert.deepEqual(parsed.configErrorFrame.output, [
                `\n${statement}`,
                ` * Line 1: Missing parameter for 'pickup_types${suffix}'.`,
            ], statement);
        }

        const statement = 'OPTIONS=pickup_types:)%Z)';
        const partial = parseNethackrc(`${statement}\n`);
        assert.deepEqual(
            partial.flags.pickup_types,
            [WEAPON_CLASS, FOOD_CLASS],
        );
        assert.deepEqual(partial.configErrorFrame.output, [
            `\n${statement}`,
            " * Line 1: Unknown pickup_types parameter ''.",
        ]);
    });

// C ref: options.c petname_optfn() (846-873), the do_set arm optfn_catname(),
// optfn_dogname() and optfn_horsename() share.  `op == empty_optstr` returns
// optn_err without a message, because parseoptions() already read the value
// with val_optional TRUE and the handler asks for no second copy.
test('a pet-name option with no value is refused in silence', () => {
    const untouched = parseNethackrc('');
    for (const field of ['catname', 'dogname', 'horsename']) {
        for (const suffix of ['', ':']) {
            const statement = `OPTIONS=${field}${suffix}`;
            const parsed = parseNethackrc(`${statement}\n`);
            assert.deepEqual(parsed.configErrorFrame.output, [], statement);
            assert.equal(parsed[field], untouched[field], statement);
        }
        // The two spellings C reads as "no name" clear it, and any other
        // value is kept, so the refusal above is the only silent one.
        assert.equal(
            parseNethackrc(`OPTIONS=${field}:none\n`)[field], '', field,
        );
        assert.equal(
            parseNethackrc(`OPTIONS=${field}:Rex\n`)[field], 'Rex', field,
        );
    }
});

// C ref: options.c optfn_pettype() (3196-3227), its do_set arm.  val_optional
// is the negation, so only a positive statement has to carry a value, and the
// negation is otherwise ignored rather than refused.
test('pettype reads its value whether or not the statement is negated', () => {
    const missing = parseNethackrc('OPTIONS=pettype\n');
    assert.deepEqual(missing.configErrorFrame.output, [
        '\nOPTIONS=pettype',
        " * Line 1: Missing parameter for 'pettype'.",
    ]);
    assert.equal(missing.preferred_pet, '');

    // A negated statement with no value is the "no pet" arm and reports
    // nothing, because val_optional is the negation; one that carries a value
    // reaches the switch, which never consults the negation.
    const negatedBare = parseNethackrc('OPTIONS=!pettype\n');
    assert.deepEqual(negatedBare.configErrorFrame.output, []);
    assert.equal(negatedBare.preferred_pet, 'n');
    const negatedDog = parseNethackrc('OPTIONS=!pettype:dog\n');
    assert.deepEqual(negatedDog.configErrorFrame.output, []);
    assert.equal(negatedDog.preferred_pet, 'd');

    // The rejection's format string ends in a period of its own, so
    // config_erradd() appends none and the message carries exactly one.
    const rejected = parseNethackrc('OPTIONS=pettype:zqxj\n');
    assert.deepEqual(rejected.configErrorFrame.output, [
        '\nOPTIONS=pettype:zqxj',
        " * Line 1: Unrecognized pet type 'zqxj'.",
    ]);
    assert.equal(rejected.preferred_pet, '');
});

// C ref: options.c optfn_runmode() (3626-3654), its do_set arm.  The negation
// is tested before the value, so a negated statement never needs one, and the
// missing-value message is the handler's own rather than string_for_opt()'s.
test('runmode answers its negation before it looks for a value', () => {
    const defaults = parseNethackrc('');
    for (const statement of ['OPTIONS=!runmode', 'OPTIONS=!runmode:walk']) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
        assert.equal(parsed.flags.runmode, RUN_TPORT, statement);
    }
    for (const [statement, reported] of [
        ['OPTIONS=runmode', ' * Line 1: Value is mandatory for runmode.'],
        ['OPTIONS=runmode:', ' * Line 1: Value is mandatory for runmode.'],
        ['OPTIONS=runmode:zqxj',
            " * Line 1: Unknown runmode parameter 'zqxj'."],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            reported,
        ], statement);
        assert.equal(parsed.flags.runmode, defaults.flags.runmode, statement);
    }

    // str_start_is() is called case-blind, and the value is the shorter side:
    // any prefix of a mode's name selects it whatever its case.
    for (const [value, mode] of [
        ['TELE', RUN_TPORT], ['Crawl', RUN_CRAWL],
    ]) {
        const parsed = parseNethackrc(`OPTIONS=runmode:${value}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
        assert.equal(parsed.flags.runmode, mode, value);
    }
});

// C ref: options.c optfn_name() (2548-2564), its do_set arm.  The value is
// mandatory and the handler adds nothing to string_for_opt()'s report.
test('a name option with no value reports and leaves plname alone', () => {
    for (const statement of ['OPTIONS=name', 'OPTIONS=name:']) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            ' * Line 1: Missing parameter for'
            + ` '${statement.slice('OPTIONS='.length)}'.`,
        ], statement);
        assert.equal(parsed.name, '', statement);
    }
    assert.equal(parseNethackrc('OPTIONS=name:Bilbo\n').name, 'Bilbo');
});

// C ref: options.c parse_role_opt() (7904-8016), the grammar all four of
// role, race, gender and alignment share.  Every exit reports and leaves the
// aspect unchosen; optfn_role() and its three siblings turn the FALSE into
// optn_silenterr without adding a message of their own.
test('the role grammar reports each refusal and chooses nothing', () => {
    const defaults = parseNethackrc('');
    for (const [statement, reported] of [
        // string_for_env_opt(fullname, opts, FALSE): the value is mandatory,
        // and the message quotes the statement, not the option's name.
        ['OPTIONS=role', " * Line 1: Missing parameter for 'role'."],
        ['OPTIONS=role:', " * Line 1: Missing parameter for 'role:'."],
        // A value that is nothing but negation prefixes.
        ['OPTIONS=race:!', " * Line 1: Negated nothing for 'race'."],
        ['OPTIONS=gender:no', " * Line 1: Negated nothing for 'gender'."],
        // A second value that disagrees with the first about negation.  The
        // message repeats the leading '!' when the statement carried one.
        ['OPTIONS=role:Sam !Val',
            " * Line 1: Invalid mixed negation for 'role'."],
        ['OPTIONS=!role:!Sam !Val',
            " * Line 1: Invalid mixed negation for '!role'."],
        // Two positive values, which C accepts only as a negated list.
        ['OPTIONS=role:Sam Val',
            ' * Line 1: Multiple role values only allowed when list is'
            + ' negated.'],
        // setrolefilter() refuses the value, which reports through the
        // filter's own message rather than the handler's.
        ['OPTIONS=alignment:!zqxj',
            " * Line 1: Invalid alignment 'zqxj'."],
        // str2<aspect>() refuses it, which is the handler's own message and
        // names allopt[].name -- "alignment", not the shorter "align" the
        // statement may have spelled or the field the port writes.
        ['OPTIONS=align:zqxj', " * Line 1: Unknown alignment 'zqxj'."],
    ]) {
        const parsed = parseNethackrc(`${statement}\n`);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${statement}`,
            reported,
        ], statement);
        assert.deepEqual(
            [parsed.flags.initrole, parsed.flags.initrace,
                parsed.flags.initgend, parsed.flags.initalign],
            [defaults.flags.initrole, defaults.flags.initrace,
                defaults.flags.initgend, defaults.flags.initalign],
            statement,
        );
    }
});

// C ref: cfgfiles.c config_error_done() (1609-1615), which closes a
// configuration read with
//     pline("\n%d error%s %s %s.\n", n, plur(n), cmdline ? "on" : "in",
//           *config_error_data->source ? config_error_data->source
//                                      : configfile);
// `configfile` is the absolute path fopen_config_file() opened, which on UNIX
// is "$HOME/.nethackrc".  A segment carries its configuration as text and no
// path (js/jsmain.js runSegment()), so nothing in the port can learn $HOME.
//
// This test pins an accepted divergence rather than a defect.  No port closes
// it, because the value C prints is not in the contest's segment input at all.
// The cost is one cell of one row per affected segment, measured over three
// fresh differentials at the deferral's commit: seed 3310277 at
// 19960229180000 matched C on all 3,150 random-number calls, every cursor and
// every other cell, and diverged only at `Cell row 20, column 13 (ch): C "/",
// JS "."`, the first character of the path.  cfgfiles.c's other reader,
// ask_do_tutorial(), prints nh_basename() of the same value and is unaffected,
// which is why js/tutorial_startup.js already matched.
test('the config-error summary names the bare rc file C gives an absolute path',
    () => {
        // state.configfile is the one place the path lives, and get_configfile()
        // is the only reader.  Absent it, the port answers with the UNIX
        // default_configfile spelling (cfgfiles.c:126-139) and no directory.
        assert.equal(get_configfile({}), DEFAULT_CONFIGFILE);
        assert.equal(DEFAULT_CONFIGFILE, '.nethackrc');
        assert.ok(!DEFAULT_CONFIGFILE.includes('/'),
            'the divergence is exactly the missing directory, so the default '
            + 'spelling must carry no separator');

        // The summary row C would print as "1 error in /home/you/.nethackrc."
        const oneError = { num_errors: 1, output: [] };
        assert.equal(config_error_done(oneError, {}), 1);
        assert.deepEqual(oneError.output, ['\n1 error in .nethackrc.\n']);

        // hacklib.h plur(x) is "" for one and "s" otherwise, and the count is
        // config_error_done()'s own, so a second error changes both.
        const twoErrors = { num_errors: 2, output: [] };
        assert.equal(config_error_done(twoErrors, {}), 2);
        assert.deepEqual(twoErrors.output, ['\n2 errors in .nethackrc.\n']);

        // A read that found nothing prints no summary row at all, which is
        // C's `if (n)` guard rather than an empty string.
        const clean = { num_errors: 0, output: [] };
        assert.equal(config_error_done(clean, {}), 0);
        assert.deepEqual(clean.output, []);

        // Should a later port ever learn the path, state.configfile is where
        // it lands and this row follows it without another change here.
        assert.equal(get_configfile({ configfile: '/home/you/.nethackrc' }),
            '/home/you/.nethackrc');
    });
