import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    HELL_GENERATORS,
    hell_open_cavern,
    hellfill,
} from '../js/hell_levels.js';
import { ROOM } from '../js/const.js';

const C_SOURCE = readFileSync('nethack-c/upstream/dat/hellfill.lua', 'utf8');

function descriptorLog() {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return (...args) => calls.push({ method, args });
        },
    });
    return { calls, des };
}

function roomState() {
    return {
        invocation_level: false,
        level: { at: () => ({ typ: ROOM }) },
    };
}

test('hellfill keeps all seven source generator slots and selects arm 7', () => {
    assert.match(C_SOURCE, /-- 7: open cavern, "mines" with more space/);
    assert.equal(HELL_GENERATORS.length, 7);
    assert.ok(HELL_GENERATORS.every((generator) => typeof generator === 'function'));
    assert.equal(HELL_GENERATORS[6], hell_open_cavern);
});
test('hellfill runs the open-cavern arm and common population tail', async () => {
    const { calls, des } = descriptorLog();
    let first = true;
    const random = (bound) => {
        if (first) {
            first = false;
            assert.equal(bound, 7);
            return 6;
        }
        return 0;
    };
    await hellfill(des, roomState(), random);

    assert.deepEqual(calls.slice(0, 8).map(({ method, args }) => ({
        method,
        args: method === 'terrain' ? [args[0].typ, args[0].lit] : args,
    })), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ', lit: 0 }] },
        { method: 'level_flags', args: ['mazelevel', 'noflip'] },
        {
            method: 'level_init',
            args: [{
                style: 'mines', fg: '.', bg: ' ', smoothed: true,
                joined: true, lit: 0,
            }],
        },
        { method: 'terrain', args: ['.', 0] },
        { method: 'terrain', args: [' ', 0] },
        { method: 'wallify', args: [] },
        { method: 'stair', args: ['up'] },
        { method: 'stair', args: ['down'] },
    ]);
    assert.equal(calls.filter(({ method }) => method === 'object').length, 15);
    assert.equal(calls.filter(({ method }) => method === 'monster').length, 9);
    assert.equal(calls.filter(({ method }) => method === 'gold').length, 8);
    assert.equal(calls.filter(({ method }) => method === 'trap').length, 8);
    assert.deepEqual(
        calls.filter(({ method }) => method === 'object')
            .slice(0, 12)
            .map(({ args }) => args),
        Array(12).fill(['*']),
    );
    assert.deepEqual(calls[6], { method: 'stair', args: ['up'] });
    assert.deepEqual(calls[7], { method: 'stair', args: ['down'] });
});
