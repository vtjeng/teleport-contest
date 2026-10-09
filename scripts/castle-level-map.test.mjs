import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CASTLE_LEVEL_LOADERS } from '../js/castle_levels.js';

function castleMapFromSource() {
    const source = readFileSync(
        new URL('../nethack-c/upstream/dat/castle.lua', import.meta.url),
        'utf8',
    );
    const match = source.match(/des\.map\(\[\[\r?\n([\s\S]*?)\r?\n\]\]\);/u);
    assert.ok(match, 'upstream castle.lua should have a long-string des.map');
    return match[1].split(/\r?\n/u);
}

async function castleMapFromLoader() {
    const stop = Symbol('captured Castle map');
    let rows;
    const des = {
        async level_init() {},
        async level_flags() {},
        async map(value) {
            rows = value;
            throw stop;
        },
    };
    await assert.rejects(CASTLE_LEVEL_LOADERS.castle(des),
        (error) => error === stop);
    return rows;
}

test('Castle loader map matches upstream castle.lua exactly', async () => {
    const upstreamRows = castleMapFromSource();
    const loaderRows = await castleMapFromLoader();

    assert.equal(upstreamRows.length, 17);
    assert.ok(upstreamRows.every((row) => row.length === 63));
    assert.deepEqual(loaderRows, upstreamRows);
    assert.equal(loaderRows[8][36], '\\');
    assert.equal(loaderRows[8][37], '.');
});
