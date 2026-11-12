// C refs: sys/share/posixregex.c regex_compile()/regex_match() over glibc
// 2.39 posix/regcomp.c and regexec.c (js/regcomp.js, js/regexec.js).
//
// glibc decides a backreference with its own algorithm: get_subexp()
// collects candidate group spans and prune_impossible_nodes() sifts the
// state log backwards. Its answers differ from the ideal POSIX semantics in
// both directions, so each expected value here is the answer of a
// regcomp(REG_EXTENDED | REG_NOSUB)/regexec() probe built against the
// recorder's glibc (2.39) and run without setlocale(). The earlier
// hand-written evaluator answered every pattern below differently (or
// refused it), so these pin the classes where it disagreed with glibc.
// The recipes under recipes/posixregex.c show two of them in a game.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    regex_compile,
    regex_init,
    regex_match,
} from '../js/posixregex.js';

function assertMatches(cases) {
    for (const [pattern, ...texts] of cases) {
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), true, pattern);
        for (const [text, expected] of texts) {
            assert.equal(regex_match(text, regex), expected,
                JSON.stringify({ pattern, text }));
        }
    }
}

test('a fixed-text body repeated at least once matches as glibc does', () => {
    assertMatches([
        // MSGTYPE=hide "((There is) )+\2": group 2 is "There is" in every
        // iteration, so the pattern needs "There is " at least once and
        // then "There is".
        [String.raw`((There is) )+\2`,
            ['There is There is a door.', true],
            // One "There is" leaves nothing for the backreference.
            ['There is a door.', false],
            // Two spaces break the iteration before the backreference.
            ['There is  There is', false]],
        // A one-letter group: "oo" then 'k'. "Brok" has a single 'o';
        // "oook" shows a later start position still matches.
        [String.raw`(o)+\1k`, ['Hello Brook', true], ['Hello Brok', false],
            ['oook', true]],
        // Ambiguous context before the repeat.
        [String.raw`.*(ab)+\1`, ['abab', true], ['ab', false]],
        [String.raw`^(a|bb)*(b)+\2`, ['bbb', true], ['b', false]],
        // A nested group: \2 is 'y' in every iteration of "xy".
        [String.raw`(x(y))+\2z`, ['xyyz', true], ['xyxyyz', true],
            ['xyz', false]],
        // With a minimum of two, glibc misses "bb" + "b" after `.*` but
        // finds it when the repeat is anchored.
        [String.raw`.*(b){2,}\1`, ['bbb', false], ['bbbb', false]],
        [String.raw`^(b){2,}\1`, ['bbb', true], ['bb', false]],
    ]);
});

test('a finite repeat of a referenced group follows glibc', () => {
    // A count or {m,n} copies the group; glibc misses decompositions the
    // ideal semantics accept. "abbbaba": "abbb"+"ab"+... has no "\1a" for
    // glibc. "aaaaaaa ": "aaa","a" then "a" would fit.
    assertMatches([
        [String.raw`(a{0,2}b+){0,2}\1a`, ['abbbaba', false], ['bbba', false]],
        [String.raw`^(a*a|ab ){2,3}\1`, ['aaaaaaa ', false],
            ['aaaabaab ', false]],
        [String.raw` {1,3}(a|b+){2}\1`, ['  bbbbbb', false],
            [' bbbba ', false]],
        [String.raw`(.{2,}){0,2}\1{1,}`, ['ba a a a ', false],
            ['b bb bb bb bb bb', false]],
    ]);
});

test('an unbounded repeat with a quantified body follows glibc', () => {
    // The group's nonempty body is itself quantified; glibc keeps later
    // spans too, where the earlier evaluator took only the first.
    assertMatches([
        [String.raw`^(b*bb|a)+\1+a$`, ['bbbaaa', true],
            ['bbbaaabbbba', true]],
        [String.raw`(b(a)*)+ \1`, ['bba ba ', true]],
        [String.raw`^(aa?)+ b\1\1?$`, ['aaa baa', true],
            ['aaaaaa baaa', true]],
        [String.raw`((b(a){2,}))+\1`, ['baaabaaaabaaaa', true],
            ['baaaabaaaabaaaaabaaaaa', true]],
    ]);
});

test('a repeat of an empty group follows glibc', () => {
    // {0} removes the subtree, and (()) or (()?) can only capture "".
    assertMatches([
        [String.raw`((())?){2,}a\1`, ['a', false], [' a ', false]],
        [String.raw`b{1}(a{0}){2,}b?\1`, ['bb', false], ['b', false]],
        [String.raw`^a(a{0}){2,}b\1{1,}$`, ['ab', false]],
        [String.raw`^((a?)?){1,}\2$`, ['a', false], ['', true],
            ['aa', true]],
    ]);
});

test('an optional or alternated capture follows glibc', () => {
    // No repeat copies these groups. A backreference to a group that did
    // not participate can still epsilon-transit in glibc's initial state,
    // and repeated groups keep spans the ideal semantics would drop.
    assertMatches([
        [String.raw`^(([^a]?) )?\2`, ['', true], ['ab b', true]],
        [String.raw`((b(a|b)?\3)*b)\3$`, ['baabbbbbbbba', true]],
        [String.raw`^(((a|a)+))*a(\1b)\1$`, ['aaaaabaaa', true],
            ['aaaaaabaaa', true]],
        [String.raw`(([ab])*)*(b?)\2\3$`, ['bbaaba', true]],
    ]);
});

test('a compiled regex keeps its DFA states across matches', () => {
    // glibc caches DFA states in the regex_t for its whole life. Matching
    // the same compiled pattern again, in either order, gives the same
    // answers as fresh compiles.
    const pattern = String.raw`^(b*bb|a)+\1+a$`;
    const regex = regex_init();
    assert.equal(regex_compile(pattern, regex), true);
    for (const [text, expected] of [
        ['bbbaaa', true], ['bbba', false], ['bbbaaabbbba', true],
        ['bbbaaa', true], ['ab', false],
    ]) assert.equal(regex_match(text, regex), expected, text);
});
