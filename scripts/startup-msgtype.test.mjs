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
import { encodeUtf8ByteString } from '../js/hacklib.js';
import { nhgetch } from '../js/input.js';
import { runSegment } from '../js/jsmain.js';
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
    assert.equal(recipe.segments.length, 37);
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

test('rejected empty-reference candidates retain every valid candidate', () => {
    for (const [pattern, text] of [
        [String.raw`(a|(b))b?\2`, 'abb'],
        [String.raw`((a)?\2x.x|a)`, 'xax'],
        [String.raw`((a)?\2|a)`, 'a'],
    ]) {
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), true, pattern);
        assert.equal(regex_match(text, regex), true,
            JSON.stringify({ pattern, text }));
    }
});

test('backreferences explore same-start paths and retain participating groups',
    () => {
        for (const [pattern, matches, misses] of [
            [String.raw`(|())\2`, ['', 'x'], []],
            [String.raw`^((a)|b)*\2`, ['aab'], ['abb']],
            [String.raw`^((a)|b)*\2$`, ['aba'], ['abb']],
            [String.raw`^((a)|b){0,2}\2$`, ['aba'], ['aa', 'abb']],
            [String.raw`^(()|a){1,2}\2$`, ['a'], []],
            [String.raw`^(()|a){3}\2$`, ['', 'aa'], ['a']],
            [String.raw`^((a)?b?){0,2}\2$`, ['aa', 'aaa'], ['a', 'aaaa']],
            [String.raw`^((a?)?){0,2}\2$`, [], ['a']],
            [String.raw`^((a?)?){0,3}\2$`, ['aa'], ['a']],
            [String.raw`^((a?)|){0,4}\2$`, [], ['a']],
            [String.raw`^(){0,2}\1$`, [''], ['a']],
            [String.raw`^((a)|b){1,3}\2$`, ['aba'], ['aaa', 'abb']],
            [String.raw`^((a)|b?){1,3}\2$`, ['aaa'], ['a']],
            [String.raw`^((a?)?){1,3}\2$`, [], ['a']],
            [String.raw`^((a?)?){2}\2$`, [], ['a']],
            [String.raw`^(a?){0,2}\1$`, ['', 'aaa'], ['a', 'aa']],
            [String.raw`^(()*)\2$`, [''], ['a']],
            [String.raw`^(()){2}\2$`, [''], ['a']],
            [String.raw`^(()){2,}\2$`, [''], ['a']],
            [String.raw`^((a|c)|b)*\2$`, ['abcc'], ['abca']],
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
    });

test('sibling alternatives expose only captures on their current path', () => {
    const invalid = regex_init();
    assert.equal(regex_compile(String.raw`(a)|\1`, invalid), false);
    assert.equal(invalid.error, 'Invalid back reference');

    const valid = regex_init();
    assert.equal(regex_compile(String.raw`(a)|(b)\2`, valid), true);
    assert.equal(regex_match('a', valid), true);
    assert.equal(regex_match('bb', valid), true);
    assert.equal(regex_match('b', valid), false);
});

test('backreferences follow recorder repetition and finite-interval selection',
    () => {
        for (const [pattern, matches, misses] of [
            [String.raw`^(a+)*\1$`, ['aaa'], ['b']],
            [String.raw`^(a+){0,}\1$`, ['aaa'], ['b']],
            [String.raw`^(a){0,2}\1$`, ['aaa'], ['aa', 'aaaa']],
            [String.raw`^(a){1,3}\1$`, ['aa', 'aaaa'], ['aaa']],
            [String.raw`^(a+)+\1$`, ['aa'], ['aaa', 'aaaa']],
            [String.raw`(l){0,2}\1`, ['Hlllo'], ['Hello']],
            [String.raw`^(a){2,3}\1$`, ['aaa', 'aaaa'], ['aa', 'aaaaa']],
        ]) {
            const regex = regex_init();
            assert.equal(regex_compile(pattern, regex), true, pattern);
            assert.equal(regex.kind, 'reference-aware', pattern);
            for (const text of matches)
                assert.equal(regex_match(text, regex), true,
                    JSON.stringify({ pattern, text }));
            for (const text of misses)
                assert.equal(regex_match(text, regex), false,
                    JSON.stringify({ pattern, text }));
        }
    });

test('reference-aware classes and anchors exercise their parsed-tree arms', () => {
    for (const [pattern, matches, misses] of [
        [String.raw`^([[:digit:]])\1$`, ['44'], ['45']],
        [String.raw`\`(a)\1\'`, ['aa'], ['baa', 'aab']],
        [String.raw`(()^b)\1`, [], ['\nbb']],
        [String.raw`(.+^b)(x)\2`, ['\nbxx'], ['\nbx']],
    ]) {
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), true, pattern);
        assert.equal(regex.kind, 'reference-aware', pattern);
        for (const text of matches)
            assert.equal(regex_match(text, regex), true,
                JSON.stringify({ pattern, text }));
        for (const text of misses)
            assert.equal(regex_match(text, regex), false,
                JSON.stringify({ pattern, text }));
    }
});

test('variable-width captures overwrite and retain recorder values', () => {
    const pattern = String.raw`^((ab|c)|x)*\2$`;
    const regex = regex_init();
    assert.equal(regex_compile(pattern, regex), true);
    assert.equal(regex.kind, 'reference-aware');
    for (const text of ['abab', 'abxab', 'abcc', 'cc', 'xabxabab'])
        assert.equal(regex_match(text, regex), true, text);
    for (const text of ['ababc', 'xc', 'abxc'])
        assert.equal(regex_match(text, regex), false, text);
});

test('compiled regex states use one explicit representation discriminant', () => {
    const regex = regex_init();
    assert.equal(regex.kind, 'uncompiled');
    assert.equal(regex_compile('[z-a]', regex), false);
    assert.equal(regex.kind, 'rejected');
    assert.equal(regex_compile('é', regex), true);
    assert.equal(regex.kind, 'locale-boundary');
    assert.equal(regex_compile('a+', regex), true);
    assert.equal(regex.kind, 'direct');
    assert.equal(regex_compile(String.raw`(a)\1`, regex), true);
    assert.equal(regex.kind, 'reference-aware');
    regex.kind = 'unknown';
    assert.throws(
        () => regex_match('aa', regex),
        /invalid compiled regex state: unknown/u,
    );
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
        ')', '()', '(|)', 'a{,}', 'a{,2}', 'a{2,}', 'a{2}{3}', 'a**', 'a?+',
        '[]a]', '[a-]', '[[:punct:]]', '[[=a=]]', '[[.a.]]',
        String.raw`\(\)\{\}\+\?\|\.\^\$`,
    ]) {
        const regex = regex_init();
        assert.doesNotThrow(() => regex_compile(pattern, regex), pattern);
        assert.equal(regex_compile(pattern, regex), true, pattern);
    }
});

test('accepted interval and final-hyphen forms match their libc languages',
    () => {
        for (const [pattern, matches, misses] of [
            ['^a{,}$', ['', 'a', 'aaaa'], ['b']],
            ['^a{,2}$', ['', 'a', 'aa'], ['aaa', 'b']],
            ['^a{2}{3}$', ['aaaaaa'], ['', 'aa', 'aaaaa']],
            ['^[a-]$', ['a', '-'], ['b', 'aa']],
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
    });

test('GNU buffer anchors and contextual line anchors match recorder glibc',
    () => {
        for (const [pattern, matches, misses] of [
            [String.raw`\`a`, ['a', 'ab'], ['ba']],
            [String.raw`a\'`, ['a', 'ba'], ['ab', 'a\n']],
            ['$.', ['\n', 'a\n'], ['', 'a']],
            ['a$.', ['a\n', 'a\nb'], ['a', 'b\n']],
            ['.+^', ['\n', 'a\n'], ['', 'a']],
            ['^end$', ['end'], ['end\n', 'xend']],
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

        for (const anchor of [String.raw`\``, String.raw`\'`]) {
            for (const quantifier of ['*', '+', '?', '{1}']) {
                const pattern = anchor + quantifier;
                const regex = regex_init();
                assert.equal(regex_compile(pattern, regex), false, pattern);
                assert.equal(regex.error,
                    'Invalid preceding regular expression', pattern);
            }
        }
    });

test('configured internal dollar classifies a live newline message',
    async () => {
        const state = messageState('MSGTYPE=hide "$."\n');
        await ttyPline('line\n', state);
        assert.equal(state._pending_message, undefined);
        assert.equal(state._ttyPreviousMessage, '');
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

test('internal caret requires the current candidate to consume its newline',
    () => {
        for (const [pattern, text, expected] of [
            ['()^b', '\nb', false],
            ['a*^b', 'a\nb', false],
            ['.+^b', '\nb', true],
            ['.*^b$', 'x\nb', true],
        ]) {
            const regex = regex_init();
            assert.equal(regex_compile(pattern, regex), true, pattern);
            assert.equal(regex.kind, 'direct', pattern);
            assert.equal(regex_match(text, regex), expected, pattern);
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

test('STOP Space clears suppression set by a prior Escape', async () => {
    const state = messageState('MSGTYPE=stop "halt"\n', '\x1b X');
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        row: state.nhDisplay.grid[0].map((cell) => cell.ch)
            .join('').trimEnd(),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        toplines: state._ttyToplines,
    });
    await ttyPline('P'.repeat(68), state);
    await ttyPline('halt', state);
    await ttyPline('after', state);

    assert.deepEqual(boundaries, [
        {
            row: `${'P'.repeat(68)}--More--`,
            cursor: [76, 0],
            toplines: 'P'.repeat(68),
        },
        {
            row: 'halt--More--',
            cursor: [12, 0],
            toplines: 'halt',
        },
    ]);
    assert.equal(state._ttyMessageStopped, false);
    assert.equal(state._ttyPreviousMessage, 'after');
    assert.equal(state._ttyToplines, 'after');
    assert.equal(state._pending_message, 'after');
    assert.equal(state.nhDisplay.topMessage, 'after');
    assert.equal(await nhgetch(state), 'X'.charCodeAt(0));
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
    assert.equal(urgentEscape._ttyMessageStopped, true);
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
    state._ttyMessageStopped = true;
    let waits = 0;
    state._preNhgetchHook = () => { ++waits; };
    await ttyPline('halt', state);
    assert.equal(waits, 0);
    assert.equal(state._ttyMessageStopped, true);
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
        toplines: state._ttyToplines,
        pending: state._pending_message,
        grid: state.nhDisplay.grid.map(
            (row) => row.map((cell) => ({ ...cell })),
        ),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        waits,
    };
    await ttyPline(second, state);
    assert.equal(state._ttyPreviousMessage, before.previous);
    assert.equal(state._ttyToplines, before.toplines);
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
        const split = 'a'.repeat(248) + 'é' + 'removed' + 'XYZ';
        const splitState = messageState('', '        ');
        await ttyPline(split, splitState);
        assert.deepEqual(encodeUtf8ByteString(splitState._ttyPreviousMessage), [
            ...Array(248).fill(0x61), 0xC3, 0x2E, 0x2E, 0x2E,
            0x58, 0x59, 0x5A,
        ]);

        const atLimit = 'b'.repeat(253) + 'é';
        assert.equal(encodeUtf8ByteString(atLimit).length, 255);
        const controlState = messageState('', '        ');
        await ttyPline(atLimit, controlState);
        assert.deepEqual(
            encodeUtf8ByteString(controlState._ttyPreviousMessage),
            encodeUtf8ByteString(atLimit),
        );
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
