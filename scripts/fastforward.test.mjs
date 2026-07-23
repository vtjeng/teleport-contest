import assert from 'node:assert/strict';
import test from 'node:test';

import { fastforward_step } from '../js/fastforward.js';
import {
    enableRngLog,
    getRngLog,
    initRng,
    pushRngLogEntry,
} from '../js/rng.js';

function eventsForStep(stepNum) {
    initRng(918273);
    enableRngLog();
    fastforward_step(
        stepNum,
        () => pushRngLogEntry('monster-allocation'),
        () => pushRngLogEntry('hero-movement'),
    );
    return getRngLog().map((entry) => entry.replace(/=.*/u, ''));
}

test('fastforward_step preserves the movement-allocation boundary', () => {
    assert.deepEqual(eventsForStep(0), []);
    assert.deepEqual(eventsForStep(1), [
        'monster-allocation',
        'rn2(70)', 'hero-movement',
        'rn2(300)', 'rn2(20)', 'rn2(82)',
    ]);
    assert.deepEqual(eventsForStep(2), [
        'rn2(5)', 'rn2(5)', 'rn2(5)', 'rn2(5)',
        'monster-allocation',
        'rn2(70)', 'hero-movement',
        'rn2(300)', 'rn2(20)', 'rn2(82)',
    ]);
    assert.deepEqual(eventsForStep(6), [
        'rn2(5)', 'rn2(12)', 'rn2(5)', 'rn2(5)', 'rn2(5)',
        'monster-allocation',
        'rn2(70)', 'hero-movement',
        'rn2(300)', 'rn2(20)', 'rn2(82)', 'rn2(31)',
    ]);
    assert.deepEqual(
        eventsForStep(11),
        ['monster-allocation', 'hero-movement'],
    );
});
