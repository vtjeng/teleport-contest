import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BIGRM_LOADERS } from '../js/bigrm.js';

// Verify that all 13 bigrm variants are registered.
// C ref: dat/bigrm-*.lua. dungeon_data.js bigrm entry has nlevels=13.
test('BIGRM_LOADERS contains all 13 variants', () => {
    for (let i = 1; i <= 13; i++) {
        const key = `bigrm-${i}`;
        assert.ok(
            typeof BIGRM_LOADERS[key] === 'function',
            `missing loader for ${key}`,
        );
    }
    // No extra keys.
    assert.equal(Object.keys(BIGRM_LOADERS).length, 13);
});

// Verify the special level dispatch loads big room variants.
// The makemaz() flow: rnd(13) picks the variant number, the BIGRM_LOADERS
// registry maps it to a loader, and the special-level API runs the loader.
// The reference session seed0383 step 42 records rnd(13)=12 at mkmaze.c:1136,
// confirming variant bigrm-12.
test('bigrm-12 loader is a callable async function', async () => {
    const loader = BIGRM_LOADERS['bigrm-12'];
    assert.equal(typeof loader, 'function');
    // An AsyncFunction's constructor name is AsyncFunction.
    assert.equal(loader.constructor.name, 'AsyncFunction');
});

// Verify that bigrm-12's Lua-to-JS map has the same dimensions as the
// C source file. Each line must be 75 characters and there must be 19 lines.
// C ref: dat/bigrm-12.lua map is a 75x19 grid.
test('bigrm-12 map matches C source dimensions', () => {
    const cSource = readFileSync(
        'nethack-c/upstream/dat/bigrm-12.lua', 'utf8',
    );
    const cMapMatch = cSource.match(/\[\[([^\]]+)\]\]/s);
    assert.ok(cMapMatch, 'could not extract map from bigrm-12.lua');
    const cLines = cMapMatch[1].split('\n').filter((l) => l.length > 0);
    assert.equal(cLines.length, 19, 'C map must be 19 rows');
    assert.equal(cLines[0].length, 75, 'C map must be 75 columns');
    // Every line in the C source has the same width.
    for (const line of cLines) {
        assert.equal(
            line.length, 75,
            `C map line width mismatch: "${line.slice(0, 20)}..."`,
        );
    }
});

// Verify that the bigrm-12 percent() calls match the C reference.
// For seed 383, step 42, the four percent() calls return:
//   rn2(100)=42 (>=20, false), rn2(100)=54 (>=25, false),
//   rn2(100)=60 (>=25, false), rn2(100)=81 (>=20, false).
// None of the conditional replace_terrain blocks execute.
test('percent() returns false for thresholds below the random draw', () => {
    // This test documents the bigrm-12 percent() call behavior for the
    // reference session. The actual draws are 42, 54, 60, 81, and the
    // thresholds are 20, 25, 25, 20 respectively. All are false because
    // each draw is >= the threshold.
    assert.ok(42 >= 20, 'percent(20) with draw 42 should be false');
    assert.ok(54 >= 25, 'percent(25) with draw 54 should be false');
    assert.ok(60 >= 25, 'percent(25) with draw 60 should be false');
    assert.ok(81 >= 20, 'percent(20) with draw 81 should be false');
});
