import assert from 'node:assert/strict';
import test from 'node:test';
import { ROOM, STONE } from '../js/const.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

test('Mon-loca has a production loader for the whole Monk locate program', () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Mon-loca'], 'function');
});

import { readFileSync } from 'node:fs';
import { initRng, enableRngLog, getRngLog, rn2 } from '../js/rng.js';
import { selection_negate } from '../js/themerooms.js';
import { MON_LOCA_LEVEL_MAP } from '../js/mon_loca_level_data.js';
import { extractMonLocaData, renderMonLocaData } from './generate-mon-loca-level.mjs';
const source = readFileSync('nethack-c/upstream/dat/Mon-loca.lua', 'utf8');

test('generated Monk locate map retains all source rows and spaces', () => {
    const data = extractMonLocaData(source);
    assert.deepEqual(data, MON_LOCA_LEVEL_MAP);
    assert.equal(renderMonLocaData(data), readFileSync('js/mon_loca_level_data.js', 'utf8'));
});

function harness(pending) {
    const calls = [];
    // Deliberately nonzero map origin exercises nhlsel.c relative conversion.
    const frame = { xstart: 2, ystart: 0 };
    const state = { level: { at(x, y) {
        return { typ: MON_LOCA_LEVEL_MAP[y]?.[x - frame.xstart] === '.' ? ROOM : STONE };
    } } };
    const des = new Proxy({ frame }, { get(target, method) {
        if (method === 'frame') return frame;
        return async (...args) => {
            calls.push({ method, args });
            if (method === 'object' && args[0]?.id === 'tin') await pending;
        };
    } });
    return { des, state, calls };
}

test('whole Monk locate orders descriptors and shares one nonremoved tin coordinate', async () => {
    initRng(172031); // Fixed arbitrary seed; no runtime branch search.
    const { des, state, calls } = harness();
    const places = selection_negate().filter_mapchar(ROOM, (x, y) => state.level.at(x, y));
    const count = places.numpoints();
    assert.ok(count > 0); // Source cave floors must be eligible before the draw.
    const expected = places.rndcoord(false, rn2, { x: des.frame.xstart, y: des.frame.ystart });
    assert.equal(places.numpoints(), count); // Lua63 rndcoord(0) does not remove.
    initRng(172031);
    enableRngLog();
    await QUEST_LEVEL_LOADERS['Mon-loca'](des, state);
    assert.deepEqual(calls.map(c => c.method), [
        'level_init', 'level_flags', 'map', 'region', 'stair', 'stair', 'non_diggable',
        ...Array(16).fill('object'), 'engraving', ...Array(6).fill('trap'),
        ...Array(23).fill('monster'),
    ]); // All Lua statements: 15 random objects, paired tin/engraving, six traps, 14+9 monsters.
    assert.deepEqual(calls.slice(0, 3).map(c => c.args), [
        [{ style: 'solidfill', fg: ' ' }], ['mazelevel'], [MON_LOCA_LEVEL_MAP],
    ]);
    assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 20 });
    assert.equal(calls[3].args[1], 'lit');
    assert.deepEqual(calls.slice(4, 6).map(c => c.args), [['up'], ['down']]);
    assert.deepEqual(calls[6].args[0].bounds(), calls[3].args[0].bounds());
    const tin = calls[22].args[0];
    const engraving = calls[23].args[0];
    assert.deepEqual(tin, { id: 'tin', coord: expected, quantity: 2, buc: 'blessed', montype: 'spinach' });
    assert.equal(engraving.coord, tin.coord); // Lua65–66 reuses the same returned table.
    assert.deepEqual(engraving, { coord: expected, type: 'burn', text: 'Elbereth' });
    assert.deepEqual(calls.slice(30).map(c => c.args[0]), [
        ...Array(14).fill('earth elemental'), ...Array(9).fill('xorn'),
    ]);
    assert.deepEqual(getRngLog().map(s => s.split('=')[0]), [`rn2(${count})`]);
});

test('Monk locate awaits tin creation before engraving and population', async () => {
    initRng(172032); // Separate source-only async-order fixture.
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const { des, state, calls } = harness(pending);
    let settled = false;
    const loading = QUEST_LEVEL_LOADERS['Mon-loca'](des, state).then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(calls.at(-1).args[0].id, 'tin');
    assert.equal(calls.some(c => c.method === 'engraving'), false);
    release();
    await loading;
    assert.equal(settled, true);
    assert.equal(calls.at(-1).args[0], 'xorn');
});
