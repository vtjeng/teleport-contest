import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

const SOURCE = readFileSync('nethack-c/upstream/dat/Wiz-loca.lua', 'utf8');

function recordingDes(wallChoices) {
    const calls = [];
    const choices = [...wallChoices];
    const des = new Proxy({
        random: {
            rn2(bound) {
                calls.push({ name: 'rn2', args: [bound] });
                assert.ok(choices.length, 'unexpected random wall choice');
                return choices.shift();
            },
        },
    }, {
        get(target, name) {
            if (name in target) return target[name];
            return (...args) => {
                calls.push({ name, args });
                args[0]?.contents?.();
            };
        },
    });
    return { des, calls, choices };
}

test('Wiz-loca map preserves every source character', async () => {
    // Choose the first wall of each source list; randomness is checked below.
    const { des, calls } = recordingDes([0, 0]);
    await QUEST_LEVEL_LOADERS['Wiz-loca'](des);
    const sourceRows = SOURCE.match(/des\.map\(\[\[\n([\s\S]*?)\n\]\]/u)[1].split('\n');
    assert.deepEqual(calls.find(({ name }) => name === 'map').args[0], sourceRows);
});

test('Wiz-loca selects each chamber wall before creating its secret door', async () => {
    // Lua lists north/south/west for the western chamber and north/south/east
    // for the eastern one. Exercise all three offsets in both lists.
    const westWalls = ['north', 'south', 'west'];
    const eastWalls = ['north', 'south', 'east'];
    for (const [index, westWall] of westWalls.entries()) {
        const { des, calls, choices } = recordingDes([index, index]);
        await QUEST_LEVEL_LOADERS['Wiz-loca'](des);
        assert.deepEqual(choices, []);
        const wallCalls = calls.filter(({ name, args }) => name === 'rn2'
            || (name === 'door' && args[0]?.state === 'secret'));
        assert.deepEqual(wallCalls, [
            { name: 'door', args: [{ state: 'secret', wall: 'random' }] },
            { name: 'door', args: [{ state: 'secret', wall: 'random' }] },
            { name: 'rn2', args: [westWalls.length] },
            { name: 'door', args: [{ state: 'secret', wall: westWall }] },
            { name: 'rn2', args: [eastWalls.length] },
            { name: 'door', args: [{ state: 'secret', wall: eastWalls[index] }] },
            { name: 'door', args: [{ state: 'secret', wall: 'random' }] },
        ]);
    }
});
