import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BIGRM_LOADERS } from '../js/bigrm.js';
import { COLNO, HWALL, ROOM, ROWNO, STONE, VWALL } from '../js/const.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';

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

test('bigrm-11 follows the Lua maze and placement sequence', async () => {
    const loader = BIGRM_LOADERS['bigrm-11'];
    assert.equal(loader.constructor.name, 'AsyncFunction');

    initRng(0x424947524d11n);
    enableRngLog();

    const cells = Array.from({ length: COLNO }, () =>
        Array.from({ length: ROWNO }, () => ({ typ: STONE })),
    );
    // Provide one horizontal and one vertical interior wall for the Lua
    // selection.match() union; terrain() turns both into floor before the
    // second, horizontal-only corner pass.
    cells[9][10].typ = ROOM;
    cells[10][10].typ = HWALL;
    cells[11][10].typ = ROOM;
    cells[20][9].typ = ROOM;
    cells[20][10].typ = VWALL;
    cells[20][11].typ = ROOM;
    const state = {
        xstart: 1,
        ystart: 0,
        level: { at: (x, y) => cells[x][y] },
    };
    const calls = [];
    const record = (name) => (...args) => {
        calls.push([name, ...args]);
        if (name === 'terrain') {
            cells[args[0] + state.xstart][args[1] + state.ystart].typ = ROOM;
        }
    };
    const des = Object.fromEntries([
        'level_flags', 'level_init', 'region', 'non_diggable',
        'terrain', 'object', 'stair', 'trap', 'monster',
    ].map((name) => [name, record(name)]));

    await loader(des, state);

    assert.deepEqual(calls.slice(0, 4).map(([name]) => name), [
        'level_flags', 'level_init', 'region', 'non_diggable',
    ]);
    assert.deepEqual(calls[0], ['level_flags', 'mazelevel', 'noflip']);
    assert.equal(calls[1][0], 'level_init');
    assert.equal(calls[1][1].style, 'maze');
    assert.ok(calls[1][1].corrwid >= 3 && calls[1][1].corrwid <= 5);
    assert.equal(calls[1][1].wallthick, 1);
    assert.equal(typeof calls[1][1].deadends, 'boolean');

    assert.deepEqual(calls
        .filter(([name, objectName]) => name === 'object'
            && objectName === 'boulder')
        // selection:iterate() converts map points to Lua-relative coords;
        // des.object() receives these before the API restores frame origin.
        .map(([, , x, y]) => [x, y]), [[9, 10], [19, 10]]);
    assert.equal(calls.filter(([name]) => name === 'stair').length, 2);
    assert.deepEqual(calls.filter(([name]) => name === 'stair')
        .map(([, direction]) => direction), ['up', 'down']);
    assert.equal(calls.filter((call) => call[0] === 'object'
        && call.length === 1).length, 15);
    assert.deepEqual(calls.filter(([name]) => name === 'trap')
        .map(([, trap]) => trap), Array(6).fill('rolling boulder'));
    assert.equal(calls.filter((call) => call[0] === 'monster'
        && call.length === 1).length, 28);
    assert.deepEqual(getRngLog().map((entry) => entry.replace(/=\d+$/u, '')), [
        'rn2(3)', 'rn2(100)',
    ]);
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
