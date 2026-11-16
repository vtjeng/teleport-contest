// botl.c noneoftheabove() (2336-2344) decides whether a status-highlight
// text rule on the title is a catch-all for a polymorphed hero. It makes
// three fuzzymatch() calls, each with its own ignore set, so a spelling that
// is valid for one target is not valid for another. The function is pure; the
// values below are read from the C source and checked against the recorder by
// recordings/botl.c/noneoftheabove-*.

import assert from 'node:assert/strict';
import test from 'node:test';

import { noneoftheabove } from '../js/display.js';

test('noneoftheabove accepts the three spellings botl.c names', () => {
    // The literal strings of the three fuzzymatch() calls.
    assert.equal(noneoftheabove('none of the above'), true);
    assert.equal(noneoftheabove('(polymorphed)'), true);
    assert.equal(noneoftheabove('none of the above (polymorphed)'), true);
});

test('noneoftheabove applies each ignore set with case folded', () => {
    // First call ignores `" -_`: underscores, hyphens and capitals.
    assert.equal(noneoftheabove('None_Of-The_Above'), true);
    // Second call ignores `"()`: the bare word without parentheses.
    assert.equal(noneoftheabove('POLYMORPHED'), true);
    // Third call ignores all of `" -_()`: words run together.
    assert.equal(noneoftheabove('noneoftheabove(polymorphed)'), true);
});

test('noneoftheabove rejects spellings no single ignore set allows', () => {
    // "(polymorphed)" does not ignore hyphens or spaces, so these differ
    // from it; the other two targets begin with "none".
    assert.equal(noneoftheabove('poly-morphed'), false);
    assert.equal(noneoftheabove('poly morphed'), false);
    // "none of the above" does not ignore parentheses, and the third target
    // needs the trailing "polymorphed".
    assert.equal(noneoftheabove('(none)of-the-above'), false);
    // An ordinary rank title is no catch-all.
    assert.equal(noneoftheabove('Stripling'), false);
});
