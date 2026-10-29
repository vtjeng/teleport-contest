import assert from 'node:assert/strict';
import test from 'node:test';

import { PM_BUGBEAR, PM_HILL_GIANT, S_HUMANOID } from '../js/monsters.js';
import { QUEST_LEVEL_LOADERS, selection_randline } from '../js/quest_levels.js';

test('randline narrows the public roughness integer at the C schar boundary', () => {
    // Pinned C nhlsel.c passes an int to selvar.c's signed schar parameter.
    // These values become -128, -1 and 0, so no RNG is needed.
    const baseline = selection_randline(20, 8, 30, 12, 0).points;
    assert.equal(baseline.filter(value => value > 1).length, 11);
    for (const roughness of [128, 255, 256])
        assert.deepEqual(selection_randline(20, 8, 30, 12, roughness).points, baseline);
});

test('Rogue quest filler b loads the same rooms as filler a', async () => {
    // dat/Rog-fila.lua and dat/Rog-filb.lua have identical executable bodies.
    // mklev.c selects -filb for unnamed quest levels at or below Rog-loca.
    const target = [];
    const control = [];
    assert.equal(typeof QUEST_LEVEL_LOADERS['Rog-filb'], 'function');
    await QUEST_LEVEL_LOADERS['Rog-filb'](delayedDescriptor(target));
    await QUEST_LEVEL_LOADERS['Rog-fila'](delayedDescriptor(control));
    assert.deepEqual(target, control);
    assert.equal(target.filter(event => event === 'room:start').length, 6);
    assert.equal(target.filter(event => event === 'random_corridors:start').length, 1);
});

function delayedDescriptor(events) {
    const tick = () => Promise.resolve().then(() => {});
    return new Proxy({}, {
        get(_target, method) {
            if (method === 'room') {
                return async (specification) => {
                    events.push('room:start');
                    await tick();
                    if (typeof specification?.contents === 'function')
                        await specification.contents();
                    events.push('room:end');
                };
            }
            if (method === 'monster') {
                return async (...args) => {
                    events.push('monster:start');
                    await tick();
                    const specification = args[0];
                    if (typeof specification?.inventory === 'function')
                        await specification.inventory();
                    events.push('monster:end');
                };
            }
            return async (...args) => {
                const label = method === 'object' && typeof args[0] === 'string'
                    ? `object:${args[0]}` : `${method}:start`;
                events.push(label);
                await tick();
                if (label.endsWith(':start')) events.push(`${method}:end`);
            };
        },
    });
}

test('Wiz-strt waits for monster inventory before the following descriptor', async () => {
    const events = [];
    await QUEST_LEVEL_LOADERS['Wiz-strt'](delayedDescriptor(events));

    const inventoryObjects = events
        .map((event, index) => [event, index])
        .filter(([event]) => event === 'object:start')
        .map(([, index]) => index);
    const chest = events.indexOf('object:chest');
    assert.equal(inventoryObjects.length >= 2, true);
    assert.ok(chest > inventoryObjects[1]);
    assert.ok(events.indexOf('monster:end') < chest);
});

test('Pri-fila waits for nested room contents before closing each room', async () => {
    const events = [];
    await QUEST_LEVEL_LOADERS['Pri-fila'](delayedDescriptor(events));

    const firstEnd = events.indexOf('room:end');
    const secondStart = events.indexOf('room:start', firstEnd + 1);
    assert.ok(firstEnd > 0);
    assert.ok(secondStart > firstEnd);
    assert.ok(events.indexOf('object:end') < firstEnd);
});

test('Cav-fila registers and follows the Lua program descriptor order', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });

    assert.equal(typeof QUEST_LEVEL_LOADERS['Cav-fila'], 'function');
    await QUEST_LEVEL_LOADERS['Cav-fila'](des);

    // The first three calls mirror Cav-fila.lua lines 6, 8 and 10-12: reset
    // to solid fill, mark a maze level without flipping it, then use mines
    // terrain with '.' floor, space background and all three generation flags.
    assert.deepEqual(calls.slice(0, 3), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { method: 'level_flags', args: ['mazelevel', 'noflip'] },
        {
            method: 'level_init',
            args: [{
                style: 'mines', fg: '.', bg: ' ',
                smoothed: true, joined: true, walled: true,
            }],
        },
    ]);
    // Cav-fila.lua lines 14-15 place an up stair before a down stair.
    assert.deepEqual(calls.slice(3, 5), [
        { method: 'stair', args: ['up'] },
        { method: 'stair', args: ['down'] },
    ]);
    // Cav-fila.lua calls des.object() seven times at source lines 16-22.
    assert.equal(calls.filter(call => call.method === 'object').length, 7);
    // Cav-fila.lua calls des.trap() four times at source lines 24-27.
    assert.equal(calls.filter(call => call.method === 'trap').length, 4);
    // Cav-fila.lua lines 29-35 list five bugbears, one class-h monster and
    // one hill giant; peaceful=0 makes each explicitly hostile.
    assert.deepEqual(
        calls.filter(call => call.method === 'monster').map(call => call.args[0]),
        [
            ...Array(5).fill({ id: PM_BUGBEAR, peaceful: 0 }),
            { class: S_HUMANOID, peaceful: 0 },
            { id: PM_HILL_GIANT, peaceful: 0 },
        ],
    );
});
