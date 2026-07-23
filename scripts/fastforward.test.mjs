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
        () => pushRngLogEntry('random-monster-generation'),
        () => pushRngLogEntry('hero-movement'),
        () => pushRngLogEntry('initial-level-sounds'),
        () => pushRngLogEntry('engraving-wear'),
    );
    return getRngLog().map((entry) => entry.replace(/=.*/u, ''));
}

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

test('fastforward_step preserves source-owned turn boundaries', async () => {
    assert.deepEqual(await eventsForStep(0), []);
    // Each row pins one residual replay step. The literal bounds distinguish
    // every recorded prefix and step 9's unique pre-engraving rn2(19).
    const expectedRows = [
        ['monster-allocation', 'random-monster-generation', 'hero-movement',
            'initial-level-sounds', 'rn2(20)', 'engraving-wear'],
        ['rn2(5)', 'rn2(5)', 'rn2(5)', 'rn2(5)',
            'monster-allocation', 'random-monster-generation', 'hero-movement',
            'initial-level-sounds', 'rn2(20)', 'engraving-wear'],
        ['rn2(5)', 'rn2(32)', 'rn2(5)', 'rn2(5)', 'rn2(32)',
            'rn2(5)', 'monster-allocation', 'random-monster-generation',
            'hero-movement',
            'initial-level-sounds', 'rn2(20)', 'engraving-wear'],
        ['rn2(5)', 'rn2(24)', 'rn2(5)', 'rn2(5)', 'rn2(24)',
            'rn2(5)', 'monster-allocation', 'random-monster-generation',
            'hero-movement',
            'initial-level-sounds', 'rn2(20)', 'engraving-wear'],
        ['rn2(5)', 'rn2(16)', 'rn2(5)', 'monster-allocation',
            'random-monster-generation', 'hero-movement',
            'initial-level-sounds',
            'rn2(20)', 'engraving-wear'],
        ['rn2(5)', 'rn2(12)', 'rn2(5)', 'rn2(5)', 'rn2(5)',
            'monster-allocation', 'random-monster-generation', 'hero-movement',
            'initial-level-sounds', 'rn2(20)', 'engraving-wear',
            'rn2(31)'],
        ['rn2(5)', 'rn2(16)', 'rn2(5)', 'rn2(5)', 'rn2(16)',
            'rn2(5)', 'monster-allocation', 'random-monster-generation',
            'hero-movement',
            'initial-level-sounds', 'rn2(20)', 'engraving-wear'],
        ['rn2(5)', 'rn2(12)', 'rn2(5)', 'monster-allocation',
            'random-monster-generation', 'hero-movement',
            'initial-level-sounds',
            'rn2(20)', 'engraving-wear'],
        ['rn2(5)', 'rn2(20)', 'rn2(5)', 'rn2(5)', 'rn2(8)', 'rn2(5)',
            'monster-allocation', 'random-monster-generation', 'hero-movement',
            'initial-level-sounds', 'rn2(20)', 'rn2(19)',
            'engraving-wear'],
        ['rn2(5)', 'rn2(12)', 'rn2(5)', 'rn2(5)', 'rn2(20)',
            'rn2(5)', 'monster-allocation', 'random-monster-generation',
            'hero-movement',
            'initial-level-sounds', 'rn2(20)', 'engraving-wear'],
    ];
    for (let step = 1; step <= expectedRows.length; ++step) {
        assert.deepEqual(await eventsForStep(step), expectedRows[step - 1]);
    }

    initRng(918273);
    enableRngLog();
    await fastforward_step(
        11,
        () => pushRngLogEntry('monster-allocation'),
        () => assert.fail('random generation crosses the replay boundary'),
        () => assert.fail('hero movement crosses the replay boundary'),
        () => assert.fail('sounds cross the replay boundary'),
        () => assert.fail('engraving wear crosses the replay boundary'),
    );
    assert.deepEqual(getRngLog(), ['monster-allocation']);
});

test('fastforward_step awaits each source callback before continuing', async () => {
    initRng(918273);
    enableRngLog();
    const monster = deferred();
    const randomMonster = deferred();
    const hero = deferred();
    const sounds = deferred();
    const engraving = deferred();
    const waitAt = (name, gate) => async () => {
        pushRngLogEntry(`${name}:start`);
        await gate.promise;
        pushRngLogEntry(`${name}:end`);
    };

    const execution = fastforward_step(
        1,
        waitAt('monster', monster),
        waitAt('random-monster', randomMonster),
        waitAt('hero', hero),
        waitAt('sounds', sounds),
        waitAt('engraving', engraving),
    );
    await flushMicrotasks();
    assert.deepEqual(getRngLog(), ['monster:start']);

    monster.resolve();
    await flushMicrotasks();
    assert.deepEqual(
        getRngLog().map((entry) => entry.replace(/=.*/u, '')),
        ['monster:start', 'monster:end', 'random-monster:start'],
    );

    randomMonster.resolve();
    await flushMicrotasks();
    assert.deepEqual(
        getRngLog().map((entry) => entry.replace(/=.*/u, '')),
        ['monster:start', 'monster:end', 'random-monster:start',
            'random-monster:end', 'hero:start'],
    );

    hero.resolve();
    await flushMicrotasks();
    assert.deepEqual(
        getRngLog().map((entry) => entry.replace(/=.*/u, '')),
        ['monster:start', 'monster:end', 'random-monster:start',
            'random-monster:end', 'hero:start', 'hero:end', 'sounds:start'],
    );

    sounds.resolve();
    await flushMicrotasks();
    assert.deepEqual(
        getRngLog().map((entry) => entry.replace(/=.*/u, '')),
        ['monster:start', 'monster:end', 'random-monster:start',
            'random-monster:end', 'hero:start', 'hero:end', 'sounds:start',
            'sounds:end', 'rn2(20)', 'engraving:start'],
    );

    engraving.resolve();
    await execution;
    assert.deepEqual(
        getRngLog().map((entry) => entry.replace(/=.*/u, '')),
        ['monster:start', 'monster:end', 'random-monster:start',
            'random-monster:end', 'hero:start', 'hero:end', 'sounds:start',
            'sounds:end', 'rn2(20)', 'engraving:start', 'engraving:end'],
    );
});
