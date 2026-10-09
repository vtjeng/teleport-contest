import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MON_GOAL_LEVEL_MAP } from '../js/mon_goal_level_data.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { extractMonGoalMap, renderMonGoalMap } from './generate-mon-goal-level.mjs';

const SOURCE = readFileSync('nethack-c/upstream/dat/Mon-goal.lua', 'utf8');

function descriptorCalls() {
    const calls = [];
    const des = {};
    for (const property of ['level_flags', 'level_init', 'region', 'stair',
        'object', 'trap', 'monster', 'altar']) {
        des[property] = async (...args) => calls.push({ property, args });
    }
    des.map = async (...args) => {
        assert.deepEqual(getRngLog(), [], 'the source map precedes its placement draw');
        calls.push({ property: 'map', args });
    };
    des.region = async (...args) => {
        assert.equal(getRngLog().length, 1,
            'the source chooses its shared placement before the unlit region');
        calls.push({ property: 'region', args });
    };
    return { des, calls };
}

test('Mon-goal generated map preserves the complete Lua rectangle', () => {
    const rows = extractMonGoalMap(SOURCE);
    assert.deepEqual(MON_GOAL_LEVEL_MAP, rows);
    assert.equal(renderMonGoalMap(rows), readFileSync('js/mon_goal_level_data.js', 'utf8'));
    // Mon-goal.lua12–24 writes 11 rows with 26 columns, including transparent x cells.
    assert.equal(rows.length, 11);
    assert.ok(rows.every(row => row.length === 26));
});

test('Mon-goal preserves source descriptor order and shares one placement draw', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Mon-goal'], 'function');
    for (const [seed, draw, coord] of [
        [1, 1, [13, 7]], // Seed1 selects Lua's second place entry with its first rn2(2).
        [4, 0, [14, 4]], // Seed4 selects Lua's first place entry with its first rn2(2).
    ]) {
        initRng(seed);
        enableRngLog();
        const { des, calls } = descriptorCalls();
        await QUEST_LEVEL_LOADERS['Mon-goal'](des);

        assert.deepEqual(getRngLog(), [`rn2(2)=${draw}`]);
        assert.deepEqual(calls.slice(0, 4), [
            { property: 'level_flags', args: ['mazelevel'] },
            { property: 'level_init', args: [{ style: 'mines', fg: 'L', bg: '.',
                smoothed: false, joined: false, lit: 0, walled: false }] },
            { property: 'map', args: [MON_GOAL_LEVEL_MAP] },
            { property: 'region', args: [calls[3].args[0], 'unlit'] },
        ]); // Source8–29 omits its commented solidfill call and draws before region.
        assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 25, hy: 10 });
        assert.deepEqual(calls[4], { property: 'stair', args: ['up', 20, 5] });
        assert.deepEqual(calls[5], { property: 'object', args: [{
            id: 'lenses', coord, buc: 'blessed', spe: 0,
            name: 'The Eyes of the Overworld',
        }] });
        assert.equal(calls.filter(call => call.property === 'object').length, 15);
        assert.deepEqual(calls.filter(call => call.property === 'trap').map(call => call.args), [
            ['fire'], ['fire'], ['fire'], ['fire'], [], [],
        ]); // Lua49–54 contains four fixed fire traps and two random traps.
        assert.deepEqual(calls.filter(call => call.property === 'monster').map(call => call.args), [
            ['Master Kaen', coord],
            ...Array.from({ length: 9 }, () => ['earth elemental']),
            ...Array.from({ length: 9 }, () => ['xorn']),
        ]); // Lua56–75 reuses placeidx for Kaen, then adds nine of each monster.
        assert.deepEqual(calls.find(call => call.property === 'altar').args,
            [{ coord, align: 'noalign', type: 'altar' }]); // Lua57 shares the same coordinate.
        assert.deepEqual(calls.map(call => call.property), [
            'level_flags', 'level_init', 'map', 'region', 'stair',
            ...Array(15).fill('object'), ...Array(6).fill('trap'),
            'monster', 'altar', ...Array(18).fill('monster'),
        ]); // Source order includes all top-level descriptors and random calls.
    }
});

test('Mon-goal is registered in the makelevel special-level dispatch', () => {
    const source = readFileSync('js/mklev.js', 'utf8');
    assert.match(source, /import\('\.\/quest_levels\.js'\)/u);
    assert.match(source, /\.\.\.QUEST_LEVEL_LOADERS/u);
    assert.match(source, /await makemaz\(slev\.proto, slev, g\)/u);
});
