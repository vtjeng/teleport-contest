import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { pmatchi } from '../js/strutil.js';

// strutil.c:pmatch_internal105-142 and pmatchi152-155 use lowc and the
// whole-string '*'/'?' rules; neither helper changes state or consumes RNG.
test('pmatchi preserves source case-insensitive whole-string wildcard results', () => {
    const c = fs.readFileSync('nethack-c/upstream/src/strutil.c', 'utf8');
    assert.match(c, /pmatchi\(const char \*patrn, const char \*strng\)/);
    assert.match(c, /pmatch_internal\(patrn, strng, TRUE, \(const char \*\) 0\)/);
    for (const [pattern, text, expected] of [
        ['', '', true], ['', 'a', false], ['*', '', true], ['?', '', false],
        ['?', 'a', true], ['?', 'ab', false], ['WIZ*', 'wizkill', true],
        ['*kill', 'WIZKILL', true], ['*a?b*', 'ZAABq', true],
        ['**x**', 'abXc', true], ['a*b', 'acbd', false],
        ['[ab]', 'a', false], ['[ab]', '[AB]', true],
        ['a\\*', 'a\\bc', true], ['A', 'a', true], ['a', 'aa', false],
        ['?', 'é', false], ['??', 'é', true], ['????', '😀', true],
        ['é', 'É', false], ['a\0ignored', 'A\0tail', true],
    ]) assert.equal(pmatchi(pattern, text), expected, `${pattern} / ${text}`);
});
