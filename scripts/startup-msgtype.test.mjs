import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MSGTYP_NOREP,
    MSGTYP_NORMAL,
    MSGTYP_NOSHOW,
    MSGTYP_STOP,
    NHW_MESSAGE,
    NO_CURS_ON_U,
    OVERRIDE_MSGTYPE,
    PLINE_NOREPEAT,
    PLINE_SPEECH,
    PLINE_VERBALIZE,
    URGENT_MESSAGE,
} from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { textBytes, utf8Text } from '../js/hacklib.js';
import { nhgetch } from '../js/input.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import {
    msgtype_parse_add,
    msgtype_type,
    optionValue,
    parseNethackrc,
} from '../js/options.js';
import {
    regex_compile,
    regex_error_desc,
    regex_init,
    regex_match,
} from '../js/posixregex.js';
import {
    dismissPendingTtyMessage,
    ttyCustomPline,
    ttyNorep,
    ttyPline,
    ttyPutmixed,
    ttyUrgentPline,
    UnsupportedCustomPlineFlagsError,
} from '../js/tty_message.js';
import { NO_COLOR } from '../js/terminal.js';
import { encglyph } from '../js/windows.js';
import {
    loadStartupMsgtypeRecipe,
    STARTUP_MSGTYPE_CASES,
} from './run-startup-msgtype.mjs';
import { setWinStop, winStop } from './test-fixtures/win-stop.mjs';
import { tty_create_nhwindow } from '../js/wintty.js';

const MESSAGE_TYPES = allopt.find(({ name }) => name === 'message types');

function rules(state) {
    const result = [];
    for (let rule = state.gp?.plinemsg_types; rule; rule = rule.next) {
        result.push({ msgtype: rule.msgtype, pattern: rule.pattern });
    }
    return result;
}

function messageState(config = '', keys = '') {
    const parsed = parseNethackrc(config);
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    // The windows are up (wintty.c:1883), so pline() reaches WIN_MESSAGE.
    // initoptions() has run on C's zeroed iflags; tty_create_nhwindow(NHW_MESSAGE)
    // reads msg_history from it.
    game.iflags = { ...parseNethackrc('').iflags, window_inited: true, cbreak: true };
    tty_create_nhwindow(NHW_MESSAGE, game);
    game.program_state = {};
    game.u = { ux: 0, uy: 0 };
    game.gp = { plinemsg_types: parsed.gp.plinemsg_types };
    game._ttyPreviousMessage = '';
    for (const key of keys) game.nhDisplay.pushKey(key.charCodeAt(0));
    return game;
}

test('the fresh recipe retains the MSGTYPE branch matrix', () => {
    const recipe = loadStartupMsgtypeRecipe();
    assert.equal(recipe.segments.length, STARTUP_MSGTYPE_CASES.length);
    assert.equal(recipe.segments.length, 28);
    assert.equal(STARTUP_MSGTYPE_CASES.filter(({ errors }) => errors).length, 4);
    assert.ok(STARTUP_MSGTYPE_CASES.some(({ statements }) => (
        statements.length === 2
        && statements[0].startsWith('MSGTYPE=hide ".*"')
        && statements[1].startsWith('MSGTYPE=show ".*"')
    )));
});

test('MSGTYPE recognizes its exact name and both statement delimiters', () => {
    for (const line of [
        'MSGTYPE=hide ".*"',
        'msgtype:hide ".*"',
        'MsGtYpE=hide ".*"',
    ]) {
        const parsed = parseNethackrc(`${line}\n`);
        assert.deepEqual(rules(parsed), [
            { msgtype: MSGTYP_NOSHOW, pattern: '.*' },
        ]);
        assert.deepEqual(parsed.unportedConfigStatements, []);
    }

    const short = parseNethackrc('MSGTYP=hide ".*"\n');
    assert.equal(short.gp.plinemsg_types, null);
    assert.equal(short.configErrorFrame.num_errors, 1);
});

test('msgtype_parse_add preserves action order and prefix matching', () => {
    const parsed = parseNethackrc('');
    for (const [action, expected] of [
        ['s', MSGTYP_NORMAL],
        ['h', MSGTYP_NOSHOW],
        ['n', MSGTYP_NOSHOW],
        ['st', MSGTYP_STOP],
        ['m', MSGTYP_STOP],
        ['nore', MSGTYP_NOREP],
        ['SHOW', MSGTYP_NORMAL],
    ]) {
        assert.equal(msgtype_parse_add(parsed, `${action} "${action}"`), true);
        assert.equal(parsed.gp.plinemsg_types.msgtype, expected, action);
    }
    assert.equal(optionValue(parsed, MESSAGE_TYPES, {}),
        '(7 currently set)');
});

test('MSGTYPE keeps sscanf byte widths and assignment accidents', () => {
    const atLimit = 'x'.repeat(255);
    const parsed = parseNethackrc([
        'MSGTYPE=hide "unclosed',
        `MSGTYPE=hide "${atLimit}Z" trailing junk`,
        'MSGTYPE=hide ""',
        'MSGTYPE=hide"joined"',
        'MSGTYPE=abcdefghij"captured"',
    ].join('\n'));
    assert.deepEqual(rules(parsed), [
        { msgtype: MSGTYP_NOSHOW, pattern: atLimit },
        { msgtype: MSGTYP_NOSHOW, pattern: 'unclosed' },
    ]);
    assert.deepEqual(
        parsed.configErrorFrame.output.filter((line) => line.startsWith(' * ')),
        [
            ' * Line 3: Malformed MSGTYPE.',
            ' * Line 4: Malformed MSGTYPE.',
            " * Line 5: Unknown message type 'abcdefghij'.",
        ],
    );
});

test('parse_config_line munges the MSGTYPE value before sscanf', () => {
    const parsed = parseNethackrc('MSGTYPE =  hide   "two   spaces"  \n');
    assert.deepEqual(rules(parsed), [
        { msgtype: MSGTYP_NOSHOW, pattern: 'two spaces' },
    ]);
});

test('invalid MSGTYPE rows preserve prior rules and later rows continue', () => {
    const parsed = parseNethackrc([
        'MSGTYPE=hide "first"',
        'MSGTYPE=hide "[z-a]"',
        'MSGTYPE=unknown "ignored"',
        'MSGTYPE=show "first"',
    ].join('\n'));
    assert.deepEqual(rules(parsed), [
        { msgtype: MSGTYP_NORMAL, pattern: 'first' },
        { msgtype: MSGTYP_NOSHOW, pattern: 'first' },
    ]);
    assert.equal(msgtype_type('first', false, parsed), MSGTYP_NORMAL);
    assert.equal(msgtype_type('other', false, parsed), MSGTYP_NORMAL);
    assert.equal(msgtype_type('other', true, parsed), MSGTYP_NOREP);
    assert.equal(parsed.configErrorFrame.num_errors, 2);
    // macOS regerror() for REG_ERANGE (Apple Libc regex/FreeBSD/regerror.c).
    assert.match(parsed.configErrorFrame.output[1],
        /MSGTYPE regex error: invalid character range/u);
    assert.match(parsed.configErrorFrame.output[3],
        /Unknown message type 'unknown'/u);
});

test('a finite duplicated-capture MSGTYPE reaches startup',
    async () => {
        let boundary = null;
        await runSegment({
            seed: 9812511,
            datetime: '20420415155100',
            nethackrc: [
                'OPTIONS=name:Boundary,role:Archeologist,race:human,gender:female,align:lawful',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,!autopickup',
                String.raw`MSGTYPE=hide "^He(()|l){1,2}\2lo"`,
                '',
            ].join('\n'),
            moves: 's',
        }, { onBoundary: (error) => { boundary = error; } });
        assert.equal(boundary, null);
        assert.equal(game.gp.plinemsg_types.pattern,
            String.raw`^He(()|l){1,2}\2lo`);
    });

test('posixregex.c keeps the last regcomp() error code', () => {
    const regex = regex_init();
    assert.equal(regex_error_desc(regex), 'no explanation');
    assert.equal(regex_error_desc(null), 'no regexp');
    // [z-a] runs backwards: REG_ERANGE, in macOS regerror()'s words.
    assert.equal(regex_compile('[z-a]', regex), false);
    assert.equal(regex_error_desc(regex), 'invalid character range');
    assert.equal(regex_match('a', regex), false);
    // A later success clears the code. In macOS's extended regex \1 is
    // the digit 1, so (a){2}\1 is the text "aa1".
    assert.equal(regex_compile(String.raw`(a){2}\1`, regex), true);
    assert.equal(regex_error_desc(regex), 'no explanation');
    assert.equal(regex_match('aaa1', regex), true);
    assert.equal(regex_match('aaa', regex), false);
});

test('all twelve ASCII POSIX character classes pin both memberships', () => {
    for (const [name, member, nonmember] of [
        ['alnum', 'A', '-'],
        ['alpha', 'z', '7'],
        ['blank', '\t', '\n'],
        ['cntrl', '\x7F', ' '],
        ['digit', '4', 'a'],
        ['graph', '~', ' '],
        ['lower', 'q', 'Q'],
        ['print', ' ', '\x7F'],
        ['punct', '[', 'A'],
        ['space', '\v', '_'],
        ['upper', 'Q', 'q'],
        ['xdigit', 'F', 'G'],
    ]) {
        const pattern = `^[[:${name}:]]$`;
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), true, name);
        assert.equal(regex_match(member, regex), true, `${name} member`);
        assert.equal(regex_match(nonmember, regex), false,
            `${name} nonmember`);
    }
});

test('negated POSIX classes and unmatched close parentheses match literally',
    () => {
        for (const [pattern, match, miss] of [
            ['^[^[:digit:]]$', 'a', '7'],
            ['^)$', ')', ''],
        ]) {
            const regex = regex_init();
            assert.equal(regex_compile(pattern, regex), true, pattern);
            assert.equal(regex_match(match, regex), true, pattern);
            assert.equal(regex_match(miss, regex), false, pattern);
        }
    });

test('vpline applies hide, norep, stop, urgent, and override rules', async () => {
    const hidden = messageState('MSGTYPE=hide ".*"\n');
    await ttyPline('hidden', hidden);
    assert.equal(hidden._pending_message, undefined);
    assert.equal(hidden._ttyPreviousMessage, '');

    const repeated = messageState('MSGTYPE=norep "same"\n');
    await ttyPline('same', repeated);
    await ttyPline('same', repeated);
    assert.equal(repeated._pending_message, 'same');
    assert.equal(repeated._ttyPreviousMessage, 'same');

    const shownNorep = messageState('MSGTYPE=show "same"\n');
    await ttyPline('same', shownNorep);
    await ttyNorep('same', shownNorep);
    assert.equal(shownNorep._pending_message, 'same  same');

    const precedence = messageState([
        'MSGTYPE=hide "later"',
        'MSGTYPE=show "later"',
    ].join('\n'));
    await ttyPline('later', precedence);
    assert.equal(precedence._pending_message, 'later');

    const stopped = messageState('MSGTYPE=stop "halt"\n', ' ');
    const boundaries = [];
    stopped._preNhgetchHook = () => boundaries.push({
        row: stopped.nhDisplay.grid[0].map((cell) => cell.ch)
            .join('').trimEnd(),
        cursor: [stopped.nhDisplay.cursorCol, stopped.nhDisplay.cursorRow],
    });
    await ttyPline('halt', stopped);
    assert.deepEqual(boundaries, [{
        row: 'halt--More--',
        cursor: [12, 0],
    }]);
    assert.equal(stopped._pending_message, '');
    assert.equal(stopped._ttyPreviousMessage, 'halt');
    assert.equal(stopped.nhDisplay.grid[0].map((cell) => cell.ch)
        .join('').trimEnd(), '');
    assert.deepEqual(
        [stopped.nhDisplay.cursorCol, stopped.nhDisplay.cursorRow],
        [0, 0],
    );

    const pendingStop = messageState('MSGTYPE=stop "halt"\n', '  ');
    const pendingBoundaries = [];
    pendingStop._preNhgetchHook = () => pendingBoundaries.push({
        row: pendingStop.nhDisplay.grid[0].map((cell) => cell.ch)
            .join('').trimEnd(),
        cursor: [
            pendingStop.nhDisplay.cursorCol,
            pendingStop.nhDisplay.cursorRow,
        ],
    });
    await ttyPline('P'.repeat(68), pendingStop);
    await ttyPline('halt', pendingStop);
    assert.deepEqual(pendingBoundaries, [
        { row: `${'P'.repeat(68)}--More--`, cursor: [76, 0] },
        { row: 'halt--More--', cursor: [12, 0] },
    ]);
    assert.equal(pendingStop.nhDisplay.grid[0].map((cell) => cell.ch)
        .join('').trimEnd(), '');
    assert.deepEqual(
        [pendingStop.nhDisplay.cursorCol, pendingStop.nhDisplay.cursorRow],
        [0, 0],
    );

    const urgent = messageState('MSGTYPE=hide ".*"\n');
    await ttyUrgentPline('urgent', urgent);
    assert.equal(urgent._pending_message, 'urgent');

    const urgentNorep = messageState('MSGTYPE=norep "same"\n');
    await ttyPline('same', urgentNorep);
    await ttyUrgentPline('same', urgentNorep);
    assert.equal(urgentNorep._pending_message, 'same  same');
    assert.equal(urgentNorep._ttyPreviousMessage, 'same');

    const override = messageState('MSGTYPE=hide ".*"\n');
    await ttyCustomPline('override', OVERRIDE_MSGTYPE, override);
    assert.equal(override._pending_message, 'override');
});

test('a fitting same-line STOP waits once, preserves a key, and clears',
    async () => {
        const state = messageState('MSGTYPE=stop "halt"\n', ' X');
        const boundaries = [];
        state._preNhgetchHook = () => boundaries.push({
            row: state.nhDisplay.grid[0].map((cell) => cell.ch)
                .join('').trimEnd(),
            cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        });
        await ttyPline('prior', state);
        await ttyPline('halt', state);
        assert.deepEqual(boundaries, [{
            row: 'prior  halt--More--',
            cursor: [19, 0],
        }]);
        assert.equal(await nhgetch(state), 'X'.charCodeAt(0));
        assert.equal(state._pending_message, '');
        assert.equal(state.nhDisplay.grid[0].map((cell) => cell.ch)
            .join('').trimEnd(), '');
        assert.deepEqual(
            [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
            [0, 0],
        );
    });

test('a same-line append preserves a pending DEC mixed first cell', async () => {
    const state = messageState('', ' ');
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        firstCell: { ...state.nhDisplay.grid[0][0] },
        row: state.nhDisplay.grid[0].map((cell) => cell.ch)
            .join('').trimEnd(),
    });

    // An encglyph() prefix that the caller renders as DECgraphics'
    // S_hwall byte, 0xF1 ('q' with the high bit), and its line-drawing
    // cell; glyph 0 stands for any glyph, as the renderGlyph callback
    // ignores its value.
    await ttyPutmixed(`${encglyph(0, state)}        a wall`, state,
        () => ({ text: '\xF1', cell: '─' }));
    await ttyPline('Pick a monster, object or location.', state);
    await dismissPendingTtyMessage(state);

    assert.deepEqual(boundaries, [{
        firstCell: { ch: '─', color: NO_COLOR, attr: 0 },
        row: '─        a wall  Pick a monster, object or location.--More--',
    }]);
});

test('a mixed line whose first byte is not high prints it as text', async () => {
    // topl.c redotoplin():128 sends a tty_putmixed() line's first byte
    // through g_putch() only when `*str & 0x80`; any other byte reaches the
    // screen through putsyms() like the rest of the line. The callback
    // offers a line-drawing cell with a plain 'q' byte, a pairing C never
    // draws; glyph 0 stands for any glyph, as the callback ignores it.
    const state = messageState();
    await ttyPutmixed(`${encglyph(0, state)}        a wall`, state,
        () => ({ text: 'q', cell: '─' }));

    assert.equal(state.nhDisplay.grid[0].map((cell) => cell.ch)
        .join('').trimEnd(), 'q        a wall');
});

// The Escape answers the --More-- that update_topl() raises for "halt", so
// topl.c still redraws "halt" with skip already computed as FALSE. vpline()'s
// MSGTYP_STOP display_nhwindow(WIN_MESSAGE, TRUE) then returns at once:
// wintty.h gives WIN_CANCELLED and WIN_STOP the same bit. "after" takes the
// suppressed same-line arm. recordings/pline.c/msgtype-stop-after-escape
// shows the patched C program skipping that second --More--.
test('STOP after an Escaped More neither waits nor clears suppression', async () => {
    const state = messageState('MSGTYPE=stop "halt"\n', '\x1b X');
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        row: state.nhDisplay.grid[0].map((cell) => cell.ch)
            .join('').trimEnd(),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        ttyToplines: state._ttyToplines,
    });
    // 68 characters leave no room for "halt" on the same line (CO - 8).
    await ttyPline('P'.repeat(68), state);
    await ttyPline('halt', state);
    await ttyPline('after', state);

    assert.deepEqual(boundaries, [
        {
            row: `${'P'.repeat(68)}--More--`,
            cursor: [76, 0],
            ttyToplines: 'P'.repeat(68),
        },
    ]);
    assert.equal(state.nhDisplay.grid[0].map((cell) => cell.ch)
        .join('').trimEnd(), 'halt');
    assert.equal(winStop(state), true);
    assert.equal(state._ttyPreviousMessage, 'after');
    assert.equal(state._ttyToplines, 'halt  after');
    // tty_nhgetch() clears WIN_STOP before reading the next key.
    assert.equal(await nhgetch(state), ' '.charCodeAt(0));
    assert.equal(winStop(state), false);
});

test('sequential runSegment calls discard the prior MSGTYPE list', async () => {
    const base = [
        'OPTIONS=role:Valkyrie,race:human,gender:female,align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
    ];
    await runSegment({
        seed: 9812451,
        datetime: '20420415145100',
        nethackrc: [...base, 'OPTIONS=name:Hidden', 'MSGTYPE=hide ".*"', '']
            .join('\n'),
        moves: 's',
    });
    assert.notEqual(game.gp.plinemsg_types, null);

    await runSegment({
        seed: 9812453,
        datetime: '20420415145300',
        nethackrc: [...base, 'OPTIONS=name:Shown', ''].join('\n'),
        moves: 's',
    });
    assert.equal(game.gp.plinemsg_types, null);
    assert.match(game._ttyPreviousMessage, /^Velkommen Shown,/u);
    assert.match(game._ttyToplines, /^Velkommen Shown,/u);
});

test('urgent STOP waits once while override STOP consumes no input', async () => {
    const urgent = messageState('MSGTYPE=stop "urgent"\n', ' X');
    let urgentWaits = 0;
    urgent._preNhgetchHook = () => { ++urgentWaits; };
    await ttyUrgentPline('urgent', urgent);
    assert.equal(urgentWaits, 1);
    assert.equal(await nhgetch(urgent), 'X'.charCodeAt(0));
    assert.equal(urgent._ttyPreviousMessage, 'urgent');
    assert.equal(urgent.nhDisplay.grid[0].map((cell) => cell.ch)
        .join('').trimEnd(), '');

    const urgentEscape = messageState('MSGTYPE=stop "urgent"\n', '\x1bX');
    await ttyUrgentPline('urgent', urgentEscape);
    assert.equal(winStop(urgentEscape), true);
    assert.equal(await nhgetch(urgentEscape), 'X'.charCodeAt(0));

    const override = messageState('MSGTYPE=stop "override"\n', 'X');
    let overrideWaits = 0;
    override._preNhgetchHook = () => { ++overrideWaits; };
    await ttyCustomPline('override', OVERRIDE_MSGTYPE, override);
    assert.equal(overrideWaits, 0);
    assert.equal(await nhgetch(override), 'X'.charCodeAt(0));
    assert.equal(override._pending_message, 'override');
    assert.equal(override._ttyPreviousMessage, 'override');
});

test('a STOP message suppressed at entry consumes no prompt input', async () => {
    const state = messageState('MSGTYPE=stop "halt"\n', 'X');
    setWinStop(state, true);
    let waits = 0;
    state._preNhgetchHook = () => { ++waits; };
    await ttyPline('halt', state);
    assert.equal(waits, 0);
    assert.equal(winStop(state), true);
    assert.equal(state._pending_message, undefined);
    assert.equal(state._ttyPreviousMessage, 'halt');
    assert.equal(state._ttyToplines, 'halt');
    assert.equal(await nhgetch(state), 'X'.charCodeAt(0));
});

test('a wrapped STOP consumes one key and leaves the restored cursor',
    async () => {
        const state = messageState('MSGTYPE=stop "^W"\n', ' X');
        let waits = 0;
        state._preNhgetchHook = () => { ++waits; };
        await ttyPline('W'.repeat(90), state);
        assert.equal(waits, 1);
        assert.equal(await nhgetch(state), 'X'.charCodeAt(0));
        assert.equal(state._ttyPreviousMessage, 'W'.repeat(90));
        assert.deepEqual(
            [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
            [0, 0],
        );
    });

test('vpline normalizes one byte string before lookup, output, and history',
    async () => {
        const original = 'a'.repeat(249) + 'REMOVED'
            + 'b'.repeat(41) + 'XYZ';
        const normalized = 'a'.repeat(249) + '...XYZ';
        assert.equal(original.length, 300);
        assert.equal(normalized.length, 255);

        const removedRule = messageState('MSGTYPE=hide "REMOVED"\n', ' X');
        await ttyPline(original, removedRule);
        assert.equal(await nhgetch(removedRule), 'X'.charCodeAt(0));
        assert.equal(removedRule._ttyPreviousMessage, normalized);
        assert.equal(removedRule._ttyToplines, normalized);

        const finalRule = messageState('MSGTYPE=hide "XYZ$"\n');
        await ttyPline(original, finalRule);
        assert.equal(finalRule._pending_message, undefined);
        assert.equal(finalRule._ttyPreviousMessage, '');
    });

test('normalized-equal long messages compare equal before NOREP', async () => {
    const first = 'a'.repeat(249) + 'FIRST-MIDDLE' + 'XYZ';
    const second = 'a'.repeat(249) + 'SECOND-MIDDLE' + 'XYZ';
    const state = messageState('MSGTYPE=norep ".*"\n', '        ');
    let waits = 0;
    state._preNhgetchHook = () => { ++waits; };
    await ttyPline(first, state);
    const before = {
        previous: state._ttyPreviousMessage,
        ttyToplines: state._ttyToplines,
        pending: state._pending_message,
        grid: state.nhDisplay.grid.map(
            (row) => row.map((cell) => ({ ...cell })),
        ),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        waits,
    };
    await ttyPline(second, state);
    assert.equal(state._ttyPreviousMessage, before.previous);
    assert.equal(state._ttyToplines, before.ttyToplines);
    assert.equal(state._pending_message, before.pending);
    assert.deepEqual(state.nhDisplay.grid, before.grid);
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        before.cursor,
    );
    assert.equal(waits, before.waits);
});

test('vpline normalization slices UTF-8 bytes and preserves 255 bytes',
    async () => {
        const split = 'a'.repeat(248) + utf8Text('é') + 'removed' + 'XYZ';
        const splitState = messageState('', '        ');
        await ttyPline(split, splitState);
        assert.deepEqual(textBytes(splitState._ttyPreviousMessage), [
            ...Array(248).fill(0x61), 0xC3, 0x2E, 0x2E, 0x2E,
            0x58, 0x59, 0x5A,
        ]);

        const atLimit = 'b'.repeat(253) + utf8Text('é');
        assert.equal(textBytes(atLimit).length, 255);
        const controlState = messageState('', '        ');
        await ttyPline(atLimit, controlState);
        assert.deepEqual(
            textBytes(controlState._ttyPreviousMessage),
            textBytes(atLimit),
        );
    });

test('custompline refuses every unsupported flag before effects', async () => {
    for (const flags of [
        0,
        PLINE_NOREPEAT,
        URGENT_MESSAGE,
        PLINE_VERBALIZE,
        PLINE_SPEECH,
        NO_CURS_ON_U | PLINE_NOREPEAT,
        0x80,
    ]) {
        const state = messageState('', 'X');
        await assert.rejects(
            ttyCustomPline('unsupported', flags, state),
            (error) => error instanceof UnsupportedCustomPlineFlagsError
                && /custompline\(\).*flags/u.test(error.message),
            String(flags),
        );
        assert.equal(state._pending_message, undefined, String(flags));
        assert.equal(state._ttyPreviousMessage, '', String(flags));
        assert.equal(await nhgetch(state), 'X'.charCodeAt(0), String(flags));
    }
});
