// C refs: sys/share/posixregex.c regex_compile(), regex_error_desc() and
// regex_match(); Apple Libc (tag Libc-1752.120.2) regcomp(), regexec() and
// regerror(), which js/regcomp.js, js/regexec.js and js/regerror.js port.
//
// The judge's recorder ran on macOS, so the port answers as macOS's C
// library does. experiments/host-parity/regex-oracle/ asked macOS itself:
// regex-oracle.c calls regcomp(REG_EXTENDED | REG_NOSUB), regexec() and
// regerror() as posixregex.c does, without setlocale(), for every pattern in
// cases.jsonl against every text there, and
// results/macos-44628090866.tsv holds the answers from macOS 26.7.2 in run
// 44628090866. This file fails if the port's compile result, error code,
// error text or match differs from macOS's for any of them, which includes
// a return to glibc's behaviour: glibc differs from macOS on 10,422 of the
// 17,700 patterns.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { utf8Text } from '../js/hacklib.js';
import {
    regex_compile,
    regex_error_desc,
    regex_init,
    regex_match,
} from '../js/posixregex.js';
import { regcomp } from '../js/regcomp.js';
import { regerror } from '../js/regerror.js';
import { regexec } from '../js/regexec.js';
import { MAX_POSITIONS, MAX_WORK } from '../js/tre_compile.js';

const ORACLE = new URL('../experiments/host-parity/regex-oracle/', import.meta.url);
const [HEADER, ...CASES] = readFileSync(new URL('cases.jsonl', ORACLE), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line));
// id -> [macOS milliseconds, regex-oracle.c output line]
const MACOS = new Map(readFileSync(new URL('results/macos-44628090866.tsv', ORACLE), 'utf8')
    .trim().split('\n').map((line) => {
        const [id, ms, ...result] = line.split('\t');
        return [Number(id), [Number(ms), result.join('\t')]];
    }));

// What regex-oracle.c prints for a pattern, computed with the port.
function portAnswer(pattern) {
    const { err, preg } = regcomp(pattern);
    if (err) return `err\t${err}\t${regerror(err)}`;
    return `ok\t${HEADER.texts.map((text) => (regexec(preg, text) === 0 ? '1' : '0')).join('')}`;
}

// Isolated cases that take the port more than a second each, because
// tre_expand_ast() builds 65,025 positions; macOS took 9.3 and 7.5
// seconds to compile each and match it against the texts.
// scripts/startup-regex-resource.test.mjs runs the first under a budget
// instead.
const SLOW = new Set(['(a{0,255}){0,255}', '([ab]{0,255}){0,255}']);

test('the oracle table covers every case once', () => {
    assert.equal(CASES.length, 17_700);
    assert.equal(MACOS.size, CASES.length);
    assert.equal(HEADER.texts.length, 76);
    for (const { id } of CASES) assert.ok(MACOS.has(id), `case ${id}`);
});

test('regcomp, regerror and regexec answer as macOS does for every oracle case', () => {
    const differences = [];
    for (const { id, pattern } of CASES) {
        if (SLOW.has(pattern)) continue;
        const expected = MACOS.get(id)[1];
        const actual = portAnswer(pattern);
        if (actual !== expected) differences.push({ pattern, actual, expected });
    }
    assert.deepEqual(differences.slice(0, 10), []);
});

test('the slow oracle cases are the ones macOS also compiled', () => {
    for (const pattern of SLOW) {
        const id = CASES.find((c) => c.pattern === pattern).id;
        // Both match every text that holds an "a" or a "b", and the empty
        // string: the pattern is nullable.
        assert.match(MACOS.get(id)[1], /^ok\t[01]{76}$/u, pattern);
    }
});

// The examples below restate oracle answers that matter to players, so a
// failure names the construct. Each expected value is in the table above.
const EXAMPLES = [
    // The sample's typed patterns: an operator with no operand.
    ['+1', null, 'repetition-operator operand invalid'],
    ['*dagger', null, 'repetition-operator operand invalid'],
    // Empty alternatives and stacked repetition, which glibc accepts.
    ['spear|', null, 'empty (sub)expression'],
    ['(a|)', null, 'empty (sub)expression'],
    ['a**', null, 'repetition-operator operand invalid'],
    ['a{1,2}{3}', null, 'repetition-operator operand invalid'],
    // An empty pattern, which glibc accepts and matches everywhere.
    ['', null, 'empty (sub)expression'],
    // A bound past RE_DUP_MAX (255).
    ['a{256}', null, 'maximum repetition exceeds 255'],
    // Every other error code's text.
    ['(', null, 'parentheses not balanced'],
    ['[a', null, 'brackets ([ ]) not balanced'],
    ['a{1', null, 'braces not balanced'],
    ['a{2,1}', null, 'invalid repetition count(s)'],
    ['[z-a]', null, 'invalid character range'],
    ['[[:word:]]', null, 'invalid character class'],
    ['[[.foo.]]', null, 'invalid collating element'],
    ['a\\', null, 'trailing backslash (\\)'],
    // A backslash makes the next character literal: \w is "w", \1 is "1".
    ['\\w', [['w', true], ['a', false]]],
    ['(a)\\1', [['a1', true], ['aa', false]]],
    ['\\<a', [['<a', true], ['a', false]]],
    // "{" without a digit after it is a literal brace.
    ['a{,2}', [['a{,2}', true], ['aa', false]]],
    ['{,1}', [['{,1}', true], ['', false]]],
    // BSD word boundaries and character names.
    ['[[:<:]]a', [['b a', true], ['ba', false]]],
    ['[[.space.]]a', [['b a', true], ['ba', false]]],
    // TRE attaches the assertions of a union's left empty path, so ^
    // binds the empty x* branch too.
    ['(^|x*)a', [['a', true], ['xa', true], ['ba', false]]],
    // The "C" locale: one byte per character and no class above 0x7f.
    ['^..$', [[utf8Text('é'), true]]],
    ['[[:alpha:]]', [[utf8Text('é'), false]]],
];

test('player-facing constructs answer as macOS does', () => {
    for (const [pattern, matches, error] of EXAMPLES) {
        const regex = regex_init();
        const compiled = regex_compile(pattern, regex);
        if (matches === null) {
            assert.equal(compiled, false, pattern);
            assert.equal(regex_error_desc(regex), error, pattern);
            continue;
        }
        assert.equal(compiled, true, pattern);
        for (const [text, expected] of matches)
            assert.equal(regex_match(text, regex), expected, `${pattern} on ${JSON.stringify(text)}`);
    }
});

test('nested bounds past the port\'s position limit report out of memory', () => {
    // macOS returned REG_ESPACE for this pattern of 255^3 positions in run
    // 44628090866; it is case 17692 of the oracle table.
    // The port's budgets (js/tre_compile.js): (a{0,255}){0,255}, which
    // macOS compiled, needs 41,810,820 units of MAX_WORK.
    assert.equal(MAX_POSITIONS, 1 << 20);
    assert.equal(MAX_WORK, 1 << 26);
    const regex = regex_init();
    assert.equal(regex_compile('((a{255}){255}){255}', regex), false);
    assert.equal(regex_error_desc(regex), 'out of memory');
});
