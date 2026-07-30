// A test file that fails against the unmutated fixture module, so
// scripts/mutate-range.test.mjs can prove that runMutants() refuses to run
// mutants over a red baseline. Only that test names this file.

import assert from 'node:assert/strict';
import test from 'node:test';

import { LIMIT } from '../js/bounds.js';

test('this expectation is wrong on purpose', () => {
    // js/bounds.js sets LIMIT to 4.
    assert.equal(LIMIT, 5);
});
