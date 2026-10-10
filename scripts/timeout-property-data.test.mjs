import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateTimeoutPropertyData } from './generate-timeout-property-data.mjs';
import { TIMEOUT_PROPERTY_NAMES } from '../js/timeout_property_data.js';

test('generated property table exactly follows timeout.c and keeps its sentinel', () => {
    const generated = readFileSync('js/timeout_property_data.js', 'utf8');
    assert.equal(generateTimeoutPropertyData(), generated);
    assert.equal(TIMEOUT_PROPERTY_NAMES[0].prop_name, 'invulnerable');
    assert.equal(TIMEOUT_PROPERTY_NAMES.at(-1).prop_num, 0);
    assert.equal(TIMEOUT_PROPERTY_NAMES.at(-1).prop_name, null);
    assert.ok(TIMEOUT_PROPERTY_NAMES.every(Object.isFrozen));
});
