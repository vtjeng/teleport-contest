// Covers the fixture's js/wrapper.js and, through it, js/bounds.js. The
// covering-test walk must attribute this file to js/wrapper.js alone. Only
// scripts/mutate-sites.test.mjs names it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { allowed } from '../js/wrapper.js';

test('allowed forwards to the bound', () => {
    // js/bounds.js sets LIMIT to 4.
    assert.equal(allowed(4), true);
});
