import assert from 'node:assert/strict';
import test from 'node:test';

import { fastforward_step } from '../js/fastforward.js';
import {
    enableRngLog,
    getRngLog,
    initRng,
    pushRngLogEntry,
} from '../js/rng.js';

async function eventsForStep(stepNum) {
    initRng(918273);
    enableRngLog();
    await fastforward_step(
        stepNum,
        () => pushRngLogEntry('monster-allocation'),
        () => pushRngLogEntry('hero-movement'),
        () => pushRngLogEntry('initial-level-sounds'),
        () => pushRngLogEntry('engraving-wear'),
    );
    return getRngLog().map((entry) => entry.replace(/=.*/u, ''));
}

test('fastforward_step preserves source-owned turn boundaries', async () => {
    assert.deepEqual(await eventsForStep(0), []);
    assert.deepEqual(await eventsForStep(1), [
        'monster-allocation',
        'rn2(70)', 'hero-movement',
        'initial-level-sounds', 'rn2(20)', 'engraving-wear',
    ]);
    assert.deepEqual(await eventsForStep(2), [
        'rn2(5)', 'rn2(5)', 'rn2(5)', 'rn2(5)',
        'monster-allocation',
        'rn2(70)', 'hero-movement',
        'initial-level-sounds', 'rn2(20)', 'engraving-wear',
    ]);
    assert.deepEqual(await eventsForStep(6), [
        'rn2(5)', 'rn2(12)', 'rn2(5)', 'rn2(5)', 'rn2(5)',
        'monster-allocation',
        'rn2(70)', 'hero-movement',
        'initial-level-sounds', 'rn2(20)', 'engraving-wear', 'rn2(31)',
    ]);
    assert.deepEqual(
        await eventsForStep(11),
        ['monster-allocation', 'hero-movement', 'initial-level-sounds'],
    );
});
