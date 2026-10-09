import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SAM_GOAL_LEVEL_MAP } from '../js/sam_goal_level_data.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { extractSamGoalMap, renderSamGoalMap } from './generate-sam-goal-level.mjs';

const source = readFileSync('nethack-c/upstream/dat/Sam-goal.lua', 'utf8');

test('Sam-goal generated map preserves every source row and its spaces', () => {
    const rows = extractSamGoalMap(source);
    assert.deepEqual(SAM_GOAL_LEVEL_MAP, rows);
    assert.equal(renderSamGoalMap(rows), readFileSync('js/sam_goal_level_data.js', 'utf8'));
    // Lua11–30 contains twenty rows, each forty-five characters wide.
    assert.equal(rows.length, 20);
    assert.ok(rows.every(row => row.length === 45));
});

test('Sam-goal preserves all descriptors and four placement draws in source order', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Sam-goal'], 'function');
    // Distinct ISAAC seeds vary the four independent choices; no descriptor
    // stub consumes RNG, so this pins only Lua34/47/50/53's math.random calls.
    for (const seed of [7, 19, 31]) {
        initRng(seed);
        enableRngLog();
        const calls = [];
        const drawCount = [];
        const des = Object.fromEntries(['level_init', 'level_flags', 'map', 'region',
            'door', 'stair', 'terrain', 'non_diggable', 'object', 'trap', 'monster']
            .map(property => [property, async (...args) => {
                calls.push({ property, args });
                drawCount.push(getRngLog().length);
            }]));
        await QUEST_LEVEL_LOADERS['Sam-goal'](des);
        const log = getRngLog();
        assert.equal(log.length, 4);
        for (const [index, bound] of [2, 4, 4, 2].entries())
            assert.match(log[index], new RegExp(`^rn2\\(${bound}\\)=\\d$`, 'u'));
        const draw = log.map(call => Number(call.split('=')[1]));
        assert.deepEqual(calls.slice(0, 3), [
            { property: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
            { property: 'level_flags', args: ['mazelevel', 'noteleport'] },
            { property: 'map', args: [SAM_GOAL_LEVEL_MAP] },
        ]); // Lua7–32 leaves initial lighting unspecified before map and choices.
        assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 44, hy: 19 });
        assert.equal(calls[3].args[1], 'unlit');
        assert.deepEqual(calls.filter(c => c.property === 'door').map(c => c.args), [
            ['closed', 19, 10], ['closed', 22, 8], ['closed', 22, 12], ['closed', 25, 10],
        ]); // Lua38–41 fixes four doors before the selected up stair.
        assert.deepEqual(calls[8], { property: 'stair', args: [{
            dir: 'up', coord: [[2, 11], [42, 9]][draw[0]],
        }] }); // Lua33/43 chooses one of these two positions.
        assert.deepEqual(calls.slice(9, 12).map(c => c.args), [
            [[[22, 14], [30, 10], [22, 6], [14, 10]][draw[1]], '.'],
            [[[22, 4], [35, 10], [22, 16], [9, 10]][draw[2]], '.'],
            [[[22, 2], [22, 18]][draw[3]], '.'],
        ]); // Lua46–54 opens one cell per ring, drawing immediately before each write.
        assert.deepEqual(drawCount.slice(0, 13), [0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 3, 4, 4]);
        assert.deepEqual(calls[12].args[0].bounds(), { lx: 0, ly: 0, hx: 44, hy: 19 });
        assert.deepEqual(calls[13], { property: 'object', args: [{
            id: 'tsurugi', x: 22, y: 10, buc: 'blessed', spe: 0, name: 'The Tsurugi of Muramasa',
        }] }); // Lua59 names the quest artifact before fourteen random objects.
        assert.ok(calls.slice(14, 28).every(c => c.property === 'object' && c.args.length === 0));
        assert.deepEqual(calls.filter(c => c.property === 'trap').map(c => c.args), [
            ['board', 22, 9], ['board', 24, 10], ['board', 22, 11], [], [], [], [], [], [],
        ]); // Lua75–84 supplies three fixed boards and six random traps.
        assert.deepEqual(calls.filter(c => c.property === 'monster').map(c => c.args), [
            ['Ashikaga Takauji', 22, 10],
            ...Array.from({ length: 5 }, () => [{ id: 'samurai', peaceful: 0 }]),
            ...Array.from({ length: 5 }, () => [{ id: 'ninja', peaceful: 0 }]),
            ...Array.from({ length: 4 }, () => ['wolf']), ['d'], ['d'],
            ...Array.from({ length: 9 }, () => ['stalker']),
        ]); // Lua86–111 retains names and classes for canonical gender/name resolution.
        assert.deepEqual(calls.map(c => c.property), [
            'level_init', 'level_flags', 'map', 'region', ...Array(4).fill('door'), 'stair',
            ...Array(3).fill('terrain'), 'non_diggable', ...Array(15).fill('object'),
            ...Array(9).fill('trap'), ...Array(26).fill('monster'),
        ]);
    }
});
