// zap.c wish_history[] holds `char *` slots, and C tests each slot as a
// pointer: NULL is a free slot and "" is a stored wish. These tests pin
// wish_history_add() (zap.c 6224-6253) to that rule and fail if js/zap.js
// goes back to testing a slot by truthiness, which treats "" as free.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { wish_history_add } from '../js/zap.js';

// wish_history_add() returns at once unless `wizard` is set (6231-6232).
const debugState = () => ({ wizard: true });

test('an empty line is stored and blocks every later line', () => {
    const state = debugState();
    // "dagger" is the first wish, so it fills slot 0.
    wish_history_add('dagger', state);
    // "dagger" is not a prefix of "", so the empty line fills slot 1.
    wish_history_add('', state);
    assert.equal(state.wish_history[0], 'dagger');
    assert.equal(state.wish_history[1], '');
    assert.equal(state.wish_history_idx, 2);
    // 6240: strncmpi(entry, buf, strlen(entry)) compares zero characters
    // for the "" entry, so "scalpel" matches it and is not added.
    wish_history_add('scalpel', state);
    assert.equal(state.wish_history_idx, 2);
    assert.equal(state.wish_history[2], null);
});

test('an empty first line fills slot 0, the slot makewish() tests', () => {
    const state = debugState();
    wish_history_add('', state);
    assert.equal(state.wish_history[0], '');
    wish_history_add('chest', state);
    assert.equal(state.wish_history[1], null);
});

test('a line is skipped only when a stored line is its prefix', () => {
    const state = debugState();
    wish_history_add('dagger', state);
    // Same letters in upper case: strncmpi() ignores case, so it matches.
    wish_history_add('DAGGER', state);
    // "dagger" is a prefix of "daggers", so it matches too.
    wish_history_add('daggers', state);
    assert.equal(state.wish_history_idx, 1);
    // "dagger" is not a prefix of the shorter "dag", so "dag" is added.
    wish_history_add('dag', state);
    assert.equal(state.wish_history[1], 'dag');
});

test('the twenty-first line replaces the oldest', () => {
    const state = debugState();
    // MAX_WISH_HISTORY is 20 (6221). Each line starts with a different
    // letter, so none is a prefix of another.
    const letters = 'abcdefghijklmnopqrstu'; // 21 letters
    for (const letter of letters) wish_history_add(`${letter}x`, state);
    assert.equal(state.wish_history.length, 20);
    // The 21st line wraps to slot 0 and wish_history_idx advances to 1.
    assert.equal(state.wish_history[0], 'ux');
    assert.equal(state.wish_history_idx, 1);
});

test('js/zap.js never tests a wish history slot by truthiness', () => {
    const source = readFileSync(new URL('../js/zap.js', import.meta.url), 'utf8');
    const slot = String.raw`(?:history\[idx\]|wish_history\?\.\[0\])`;
    // A slot used as a whole condition, negated, or as an operand of && or
    // || is a truthiness test. Comparisons with null are the pointer test.
    const truthiness = new RegExp(
        String.raw`(?:\(\s*!?\s*${slot}\s*\))|(?:!\s*${slot}(?!\.))`
        + String.raw`|(?:${slot}\s*(?:&&|\|\||\?[^.?]))|(?:(?:&&|\|\|)\s*${slot}\s*(?:&&|\|\||\)))`,
        'u',
    );
    const offending = source.split('\n')
        .map((text, index) => ({ line: index + 1, text }))
        .filter(({ text }) => !text.trimStart().startsWith('//') && truthiness.test(text));
    assert.deepEqual(offending, []);
    // The scan must still see the four pointer tests it guards.
    const pointerTests = source.match(new RegExp(String.raw`${slot}(?: \?\? null\))? [!=]== null`, 'gu'));
    assert.equal(pointerTests?.length, 4);
});
