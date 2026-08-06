// Covers the fixture's js/wrapper.js and, through it, js/bounds.js. The
// covering-test walk must attribute this file to js/wrapper.js alone. Only
// scripts/mutate-sites.integration.mjs names it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { allowed } from '../js/wrapper.js';

test('allowed forwards to the bound', () => {
    // js/bounds.js sets LIMIT to 4, and forwarded() admits it. Weakening its
    // `>=` to `>` turns this to false, which is the kill that only a test
    // outside js/bounds.js's first wave can make.
    assert.equal(allowed(4), true);
    assert.equal(allowed(3), false);
});
