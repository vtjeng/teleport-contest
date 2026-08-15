// Startup configuration errors: the raw-print surface they land on, the
// keypress that dismisses them, and the segment that keeps playing afterwards.
// C refs: cfgfiles.c config_erradd() and config_error_done();
// win/tty/wintty.c tty_raw_print(), tty_wait_synch() and getret();
// options.c parsebindings(); recorder patch 006's nomux_raw_* shadow.

import assert from 'node:assert/strict';
import test from 'node:test';

import { GameDisplay } from '../js/game_display.js';
import { runSegment } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import { parseNethackrc } from '../js/options.js';
import { ATR_INVERSE, ATR_NONE, NO_COLOR } from '../js/terminal.js';
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

// global.h enum optset_restrictions.  optfn_boolean():5207 retreats on this
// one for the whole of a configuration-file read, because go.opt_initial is
// true throughout.
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
    // sortpack starts On and autodig starts Off, so the four spellings cover a
    // negation that changes the flag and one that does not.  Both rows store
    // in flags under their own name, and neither had a handler of its own
    // before this: a name-keyed dispatch sent them to the compound arm, which
    // stored the empty string and stopped the read on the negated spelling.
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

// C ref: options.c optfn_boolean() (5233-5237) again, over the whole table
// rather than the rows whose storage this port owns.  parseoptions() reaches
// the handler through allopt[matchidx].optfn, so the row's type decides
// whether the message is emitted.
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
        assert.equal(
            parseNethackrc('OPTIONS=menucolors:zebra\n').flags.menucolors,
            true,
        );
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
