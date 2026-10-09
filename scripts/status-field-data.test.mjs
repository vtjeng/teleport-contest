import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateStatusFieldData } from './generate-status-field-data.mjs';
test('botl.c menu metadata matches its complete source tables', () => {
    assert.equal(readFileSync(new URL('../js/status_field_data.js', import.meta.url), 'utf8'), generateStatusFieldData());
});
