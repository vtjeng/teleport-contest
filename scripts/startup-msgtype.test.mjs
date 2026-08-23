import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MSGTYP_NOREP,
    MSGTYP_NORMAL,
    MSGTYP_NOSHOW,
    MSGTYP_STOP,
    NO_CURS_ON_U,
    OVERRIDE_MSGTYPE,
    PLINE_NOREPEAT,
    PLINE_SPEECH,
    PLINE_VERBALIZE,
    SUPPRESS_HISTORY,
    URGENT_MESSAGE,
} from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { nhgetch } from '../js/input.js';
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
    UnsupportedCustomPlineFlagsError,
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
    assert.equal(recipe.segments.length, 17);
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

test('numeric backreferences follow recorder glibc compile and match rules',
    () => {
        for (const [pattern, matches, misses] of [
            [String.raw`(a)\1`, ['aa', 'zaa'], ['a1', 'a']],
            [String.raw`(a)\10`, ['aa0'], ['a10', 'aa']],
            [String.raw`^(a)\1|(b)\2$`, ['aa', 'bb'], ['ab', 'ba']],
            [String.raw`^(a)?\1|a$`, ['a', 'aa'], ['b']],
            [String.raw`^(X)?\1Hello`, ['XXHello'], ['Hello']],
            [String.raw`^(a)(b)(c)(d)(e)(f)(g)(h)(i)\9$`,
                ['abcdefghii'], ['abcdefghii9']],
            [String.raw`^\0$`, ['0'], ['\\0']],
        ]) {
            const regex = regex_init();
            assert.equal(regex_compile(pattern, regex), true, pattern);
            for (const text of matches)
                assert.equal(regex_match(text, regex), true,
                    JSON.stringify({ pattern, text }));
            for (const text of misses)
                assert.equal(regex_match(text, regex), false,
                    JSON.stringify({ pattern, text }));
        }

        for (const pattern of [
            String.raw`\1`, String.raw`(a)\2`, String.raw`(a\1)`,
        ]) {
            const regex = regex_init();
            assert.equal(regex_compile(pattern, regex), false, pattern);
            assert.equal(regex.error, 'Invalid back reference', pattern);
        }
    });

test('GNU word, space, and boundary escapes use ASCII glibc semantics', () => {
    const cases = [
        [String.raw`^\bfoo\b$`, 'foo', 'foo_'],
        [String.raw`\Boo\B`, 'xooz', 'foo'],
        [String.raw`\<foo\>`, ' foo ', '_foo'],
        [String.raw`^\w+$`, 'abc_123', 'abc-'],
        [String.raw`^\W+$`, ' -', '_'],
        [String.raw`^\s+$`, '\t\n\v\f\r ', 'a'],
        [String.raw`^\S+$`, 'abc_123', 'a b'],
    ];
    for (const [pattern, match, miss] of cases) {
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), true, pattern);
        assert.equal(regex_match(match, regex), true, pattern);
        assert.equal(regex_match(miss, regex), false, pattern);
    }
    for (const boundary of [
        String.raw`\b`, String.raw`\B`, String.raw`\<`, String.raw`\>`,
    ]) {
        for (const quantifier of ['*', '+', '?', '{1}']) {
            const pattern = boundary + quantifier;
            const regex = regex_init();
            assert.equal(regex_compile(pattern, regex), false, pattern);
            assert.equal(
                regex.error,
                'Invalid preceding regular expression',
                pattern,
            );
        }
    }
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

test('a leading literal close bracket can be a range endpoint', () => {
    const accepted = regex_init();
    assert.equal(regex_compile('^[]-a]$', accepted), true);
    for (const text of [']', '^', '_', '`', 'a'])
        assert.equal(regex_match(text, accepted), true, text);
    for (const text of ['\\', 'b', '-'])
        assert.equal(regex_match(text, accepted), false, text);

    const rejected = regex_init();
    assert.equal(regex_compile('[]--]', rejected), false);
    assert.equal(rejected.error, 'Invalid range end');
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

    const override = messageState('MSGTYPE=hide ".*"\n');
    await ttyCustomPline('override', OVERRIDE_MSGTYPE, override);
    assert.equal(override._pending_message, 'override');
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

    const override = messageState('MSGTYPE=stop "override"\n', 'X');
    let overrideWaits = 0;
    override._preNhgetchHook = () => { ++overrideWaits; };
    await ttyCustomPline('override', OVERRIDE_MSGTYPE, override);
    assert.equal(overrideWaits, 0);
    assert.equal(await nhgetch(override), 'X'.charCodeAt(0));
    assert.equal(override._pending_message, 'override');
    assert.equal(override._ttyPreviousMessage, 'override');
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

test('custompline refuses every unsupported flag before effects', async () => {
    for (const flags of [
        0,
        PLINE_NOREPEAT,
        SUPPRESS_HISTORY,
        URGENT_MESSAGE,
        PLINE_VERBALIZE,
        PLINE_SPEECH,
        NO_CURS_ON_U,
        OVERRIDE_MSGTYPE | SUPPRESS_HISTORY,
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
