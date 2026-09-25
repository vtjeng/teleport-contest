import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { TRIBUTE_DATA } from '../js/tribute_data.js';

test('tribute data is the byte-for-byte checked-in C data file', () => {
    const source = readFileSync(new URL(
        '../nethack-c/upstream/dat/tribute', import.meta.url,
    ), 'utf8');

    assert.equal(TRIBUTE_DATA, source);
});
