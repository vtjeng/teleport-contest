import assert from 'node:assert/strict';
import test from 'node:test';

import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

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
