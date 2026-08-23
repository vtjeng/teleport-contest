import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MSGTYP_NOREP,
    MSGTYP_NORMAL,
    MSGTYP_NOSHOW,
    MSGTYP_STOP,
    OVERRIDE_MSGTYPE,
} from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { allopt } from '../js/optlist_data.js';
import {
    msgtype_parse_add,
    msgtype_type,
    optionValue,
    parseNethackrc,
} from '../js/options.js';
import {
    regex_compile,
    regex_init,
    regex_match,
    UnsupportedPosixLocaleMatchError,
} from '../js/posixregex.js';
import {
    ttyCustomPline,
    ttyNorep,
    ttyPline,
    ttyUrgentPline,
} from '../js/tty_message.js';
import {
    loadStartupMsgtypeRecipe,
    STARTUP_MSGTYPE_CASES,
} from './run-startup-msgtype.mjs';

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
    game.iflags = { cbreak: true };
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
    assert.equal(recipe.segments.length, 12);
    assert.equal(STARTUP_MSGTYPE_CASES.filter(({ errors }) => errors).length, 3);
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
    assert.match(parsed.configErrorFrame.output[1],
        /MSGTYPE regex error: Invalid range end/u);
    assert.match(parsed.configErrorFrame.output[3],
        /Unknown message type 'unknown'/u);
});

test('regex_match implements the ASCII POSIX ERE forms MSGTYPE consumes', () => {
    const cases = [
        ['[[:digit:]]+ wand', '12 wand', true],
        ['[[:digit:]]+ wand', 'twelve wand', false],
        ['^(foo|bar){1,2}$', 'foobar', true],
        ['^(foo|bar){1,2}$', 'xfoobar', false],
        ['[[=a=]][[.b.]]', 'ab', true],
        [String.raw`\(literal\)\{braces\}`, '(literal){braces}', true],
        [String.raw`\d+`, 'ddd', true],
        [String.raw`\d+`, '123', false],
        ['(|wand)', 'anything', true],
        ['wand|', 'anything', true],
        ['|wand', 'anything', true],
        [String.raw`^[\\]$`, '\\', true],
        [String.raw`^[\\]$`, ']', false],
        [String.raw`^[\]]$`, '\\]', true],
        [String.raw`^[\]]$`, ']', false],
        [String.raw`^[a\-c]$`, '\\', true],
        [String.raw`^[a\-c]$`, 'b', true],
        [String.raw`^[a\-c]$`, '-', false],
        ['^a.b$', 'a\nb', true],
        ['^end$', 'end\n', false],
        ['a^b', 'a^b', false],
        ['a$b', 'a$b', false],
        ['(^a|b$)', 'xb', true],
        [String.raw`\^a\$`, '^a$', true],
        ['^(a+?)$', '', true],
        ['^(a+?)$', 'aaa', true],
        ['^(a++)$', '', false],
        ['^(a++)$', 'aaa', true],
    ];
    for (const [pattern, text, expected] of cases) {
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), true, pattern);
        assert.equal(regex_match(text, regex), expected,
            JSON.stringify({ pattern, text }));
    }
});

test('every source-accepted translator edge compiles without a JS leak', () => {
    for (const pattern of [
        ')', '()', '(|)', 'a{,2}', 'a{2,}', 'a{2}{3}', 'a**', 'a?+',
        '[]a]', '[a-]', '[[:punct:]]', '[[=a=]]', '[[.a.]]',
        String.raw`\(\)\{\}\+\?\|\.\^\$`,
    ]) {
        const regex = regex_init();
        assert.doesNotThrow(() => regex_compile(pattern, regex), pattern);
        assert.equal(regex_compile(pattern, regex), true, pattern);
    }
});

test('regex_match names its unported C.UTF-8 locale boundary', () => {
    for (const [pattern, text] of [['é', 'é'], ['.*', 'é']]) {
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), true);
        assert.throws(
            () => regex_match(text, regex),
            (error) => error instanceof UnsupportedPosixLocaleMatchError
                && /regex_match.*C\.UTF-8/u.test(error.message),
        );
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

    const urgent = messageState('MSGTYPE=hide ".*"\n');
    await ttyUrgentPline('urgent', urgent);
    assert.equal(urgent._pending_message, 'urgent');

    const override = messageState('MSGTYPE=hide ".*"\n');
    await ttyCustomPline('override', OVERRIDE_MSGTYPE, override);
    assert.equal(override._pending_message, 'override');
});
