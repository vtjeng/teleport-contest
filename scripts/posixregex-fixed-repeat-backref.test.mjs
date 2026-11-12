// C refs: sys/share/posixregex.c regex_compile()/regex_match(). A
// backreference to a group inside an unbounded repeat whose body is fixed
// text, such as MSGTYPE=hide "((There is) )+\2". Every expected value is the
// answer of a regcomp(REG_EXTENDED | REG_NOSUB)/regexec() probe built against
// the recorder's glibc (2.39) and run without setlocale(). The recipe
// recipes/posixregex.c/msgtype-fixed-repeat-backref shows the shape in a game.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    regex_compile,
    regex_init,
    regex_match,
    UnsupportedPosixDuplicatedCaptureError,
} from '../js/posixregex.js';

// [pattern, [text, matches]...]
const MATCHES = [
    // The batch 13 shape: group 2 is "There is" in every iteration, so the
    // pattern needs "There is " at least once and then "There is".
    [String.raw`((There is) )+\2`,
        ['There is There is a door.', true],
        // One "There is" leaves nothing for the backreference.
        ['There is a door.', false],
        // Two spaces break the iteration before the backreference.
        ['There is  There is', false]],
    // A one-letter group: "oo" then 'k'. "Brok" has a single 'o'; "oook"
    // shows a later start position still matches.
    [String.raw`(o)+\1k`, ['Hello Brook', true], ['Hello Brok', false],
        ['oook', true]],
    // Ambiguous context before the repeat: `.*` may take any prefix, and
    // `(a|bb)*` may take "bb" or nothing before the repeated 'b'.
    [String.raw`.*(ab)+\1`, ['abab', true], ['ab', false]],
    [String.raw`^(a|bb)*(b)+\2`, ['bbb', true], ['b', false]],
    // A nested group: \2 is 'y' in every iteration of "xy".
    [String.raw`(x(y))+\2z`, ['xyyz', true], ['xyxyyz', true],
        ['xyz', false]],
];

test('a fixed-text body repeated at least once matches as glibc does', () => {
    for (const [pattern, ...cases] of MATCHES) {
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), true, pattern);
        assert.equal(regex.kind, 'reference-aware', pattern);
        for (const [text, expected] of cases) {
            assert.equal(regex_match(text, regex), expected,
                JSON.stringify({ pattern, text }));
        }
    }
});

test('a fixed-text body with a minimum of two stays refused', () => {
    // glibc answers "no match" for `.*(b){2,}\1` on "bbb", although
    // "bb" + "b" fits; `^(b){2,}\1` on the same text matches. The evaluator
    // does not model that, so the shape keeps its refusal.
    const regex = regex_init();
    assert.equal(regex_compile(String.raw`.*(b){2,}\1`, regex), true);
    assert.equal(regex.kind, 'duplicated-capture-boundary');
    assert.throws(() => regex_match('bbb', regex),
        UnsupportedPosixDuplicatedCaptureError);
});
