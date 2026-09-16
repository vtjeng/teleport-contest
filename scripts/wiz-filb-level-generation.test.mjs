import assert from 'node:assert/strict';
import test from 'node:test';

import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

function recordingDes() {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, name) {
            return (...args) => {
                calls.push({ name, args });
                args[0]?.contents?.();
            };
        },
    });
    return { des, calls };
}

test('Wiz-filb preserves the source room and content order', async () => {
    const { des, calls } = recordingDes();
    await QUEST_LEVEL_LOADERS['Wiz-filb'](des);

    assert.deepEqual(calls, [
        { name: 'room', args: [{ type: 'ordinary', contents: calls[0].args[0].contents }] },
        { name: 'stair', args: ['up'] },
        { name: 'object', args: [] },
        { name: 'monster', args: [{ class: 'X', peaceful: 0 }] },
        { name: 'room', args: [{ type: 'ordinary', contents: calls[4].args[0].contents }] },
        { name: 'object', args: [] },
        { name: 'object', args: [] },
        { name: 'monster', args: [{ class: 'i', peaceful: 0 }] },
        { name: 'room', args: [{ type: 'ordinary', contents: calls[8].args[0].contents }] },
        { name: 'object', args: [] },
        { name: 'trap', args: [] },
        { name: 'object', args: [] },
        { name: 'monster', args: [{ class: 'X', peaceful: 0 }] },
        { name: 'room', args: [{ type: 'ordinary', contents: calls[13].args[0].contents }] },
        { name: 'stair', args: ['down'] },
        { name: 'object', args: [] },
        { name: 'trap', args: [] },
        { name: 'monster', args: [{ class: 'i', peaceful: 0 }] },
        { name: 'monster', args: ['vampire bat'] },
        { name: 'room', args: [{ type: 'ordinary', contents: calls[19].args[0].contents }] },
        { name: 'object', args: [] },
        { name: 'object', args: [] },
        { name: 'trap', args: [] },
        { name: 'monster', args: [{ class: 'i', peaceful: 0 }] },
        { name: 'room', args: [{ type: 'ordinary', contents: calls[24].args[0].contents }] },
        { name: 'object', args: [] },
        { name: 'trap', args: [] },
        { name: 'monster', args: ['vampire bat'] },
        { name: 'random_corridors', args: [] },
    ]);
});
