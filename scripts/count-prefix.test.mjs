import assert from 'node:assert/strict';
import test from 'node:test';

import { loadCountPrefixRecipe } from './run-count-prefix.mjs';

// cmd.c parse():5112-5119 sends the command byte straight to get_count() when
// num_pad is off, so a digit anywhere before the committing byte is what makes
// a segment a count case at all.
const DIGITS = /[0-9]/u;

test('count-prefix matrix contains only source-selected count inputs', () => {
    const recipe = loadCountPrefixRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 9);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.match(segment.moves, DIGITS);
    }
    // Distinct hero names keep each segment's recorder lock and save file
    // separate, so one segment stopped at a prompt cannot restore into another.
    const names = recipe.segments.map(
        (segment) => /name:([^,]+)/u.exec(segment.nethackrc)[1],
    );
    assert.equal(new Set(names).size, recipe.segments.length);
});

test('count-prefix matrix covers every get_count arm it claims', () => {
    const moves = loadCountPrefixRecipe().segments.map(
        (segment) => segment.moves,
    );
    const covering = (key) => moves.filter((keys) => keys.includes(key)).length;
    // get_count():5054 accepts two erase characters, '\b' and the source's
    // STANDBY_erase_char, and 5058 accepts Escape. Each needs its own segment,
    // because each takes a different arm out of the collecting loop.
    assert.ok(covering('\b') > 0, 'backspace edits a count');
    assert.ok(covering('\x7f') > 0, 'delete edits a count');
    assert.ok(covering('\x1b') > 0, 'escape cancels a count');
    // The two extcmdlist[] rows carrying occupation text, cmd.c:1846-1847 and
    // :1930-1931, are the rows rhack():3728 would spend a count on. Both take
    // a count here, so the counts that leave gm.multi 0 are proved harmless on
    // exactly the rows where a larger count would not be.
    assert.ok(covering('s') > 0, 'the searching row takes a count');
    assert.ok(covering('.') > 0, 'the waiting row takes a count');
});
