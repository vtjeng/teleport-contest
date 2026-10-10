import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { KNOX_LEVEL_LOADERS } from '../js/knox_levels.js';
import { KNOX_LEVEL_MAP } from '../js/knox_level_data.js';
import {
    extractKnoxLevelMap,
    renderKnoxLevelMap,
} from './generate-knox-level.mjs';

const source = readFileSync('nethack-c/upstream/dat/knox.lua', 'utf8');

test('generated Fort Ludios map exactly matches dat/knox.lua', () => {
    const rows = extractKnoxLevelMap(source);
    assert.deepEqual(KNOX_LEVEL_MAP, rows);
    assert.equal(rows.length, 20); // knox.lua:12-33.
    assert.ok(rows.every(row => row.length === 76));
    assert.equal(
        renderKnoxLevelMap(rows),
        readFileSync('js/knox_level_data.js', 'utf8'),
    );
});

test('Fort Ludios special-level registry uses the source prototype name', () => {
    assert.deepEqual(Object.keys(KNOX_LEVEL_LOADERS), ['knox']);
    assert.equal(typeof KNOX_LEVEL_LOADERS.knox, 'function');
});
