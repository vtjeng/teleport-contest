import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ASTRAL_LEVEL_MAP } from '../js/astral_level_data.js';
import { convertLine } from '../js/questpgr.js';
import { extractAstralMap, renderAstralMap } from './generate-astral-level.mjs';

const LUA = readFileSync('nethack-c/upstream/dat/astral.lua', 'utf8');

test('generated Astral map preserves the authoritative Lua rectangle', () => {
    const rows = extractAstralMap(LUA);
    assert.deepEqual(ASTRAL_LEVEL_MAP, rows);
    assert.equal(renderAstralMap(rows),
        readFileSync('js/astral_level_data.js', 'utf8'));
    // astral.lua:8-27 declares a fixed 75 by 20 map.
    assert.equal(rows.length, 20);
    assert.ok(rows.every((row) => row.length === 75));
});

test('special-level messages use questpgr conversion for Astral deity text', () => {
    const state = {
        // The independent Knight recipe enters Astral with lawful alignment.
        u: { ualignbase: [0, 1] },
        urole: { lgod: '_Lugh', ngod: '_Ishtar', cgod: '_Tyr' },
    };
    // astral.lua:36 uses %d; questpgr.c:convert_line resolves original deity.
    assert.equal(convertLine('Here the High Temple of %d is located.', state),
        'Here the High Temple of Lugh is located.');
});

test('Astral map extractor rejects a changed rectangle', () => {
    assert.throws(() => extractAstralMap('des.map([[\n..\n]])'), {
        name: 'SyntaxError',
        message: 'astral.lua map is not 20 rows of 75 columns',
    });
});
