// The covering test file for the mutate-sites fixture module. Only
// scripts/mutate-sites.integration.mjs runs it, by naming it explicitly inside a
// workspace; `npm test` globs scripts/*.test.mjs and never reaches this
// directory.
//
// Its coverage is deliberately uneven. js/bounds.js says which sites it pins
// and which it leaves loose.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    LIMIT,
    alwaysReady,
    bothSet,
    nearEdge,
    rowHead,
    withinLimit,
} from '../js/bounds.js';

test('the limit and both sides of its boundary are pinned', () => {
    assert.equal(LIMIT, 4);
    assert.equal(withinLimit(4), true);
    assert.equal(withinLimit(5), false);
});

test('nearEdge is exercised far from its boundary', () => {
    // 0 satisfies the real bound and every mutant of it, which is what leaves
    // the site's mutants alive.
    assert.equal(nearEdge(0), true);
});

test('bothSet requires both operands', () => {
    assert.equal(bothSet(true, false), false);
    assert.equal(bothSet(true, true), true);
});

test('rowHead reads the first row', () => {
    assert.equal(rowHead(0), 3);
});

test('alwaysReady reports readiness', () => {
    assert.equal(alwaysReady(), true);
});
