import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildQueue, fileOrder, formatQueue, parseCaller, queueEntry,
} from './divergence-queue.mjs';

// Row shapes copied from a real `scan-sessions.mjs --json` run at 9a8d2f6a,
// trimmed to the fields the queue reads.
const rngFirst = {
    file: 'seed0014-dequa-fountain-explore.session.json',
    screensEmitted: 426,
    recordedSteps: 714,
    divergence: {
        screen: { index: 416 },
        rng: { index: 16768, cCaller: 'dog_move(dogmove.c:1255)', stepIndex: 418 },
    },
    boundary: null,
};
const stopOnly = {
    file: 'seed0030-ten-diverse-deaths.session.json',
    screensEmitted: 227,
    recordedSteps: 1953,
    divergence: null,
    boundary: 'unsupported hero command: an unported branch of this command: '
        + 'eating requires poison_strdmg()',
};
const screenOnly = {
    file: 'seed2200-wizard-quaff-zap-read.session.json',
    screensEmitted: 230,
    recordedSteps: 230,
    divergence: { screen: { index: 158 }, rng: null },
    boundary: null,
};
const passing = {
    file: 'seed8000-tourist-starter.session.json',
    screensEmitted: 23,
    recordedSteps: 23,
    divergence: null,
    boundary: null,
};
const owners = new Map([['poison_strdmg', 'attrib.c']]);

test('parseCaller splits the recorded annotation into function, file, line', () => {
    assert.deepEqual(parseCaller('dog_move(dogmove.c:1255)'),
        { function: 'dog_move', cFile: 'dogmove.c', line: 1255 });
    assert.equal(parseCaller(null), null);
    assert.equal(parseCaller('rn2(5)=2'), null);
});

test('queueEntry takes the earliest mismatch and names its C function', () => {
    // The screen mismatch at 416 precedes the RNG mismatch at 418, so the
    // entry is a display difference and names no function.
    assert.deepEqual(queueEntry(rngFirst, owners), {
        session: 'seed0014-dequa-fountain-explore',
        step: 416,
        kind: 'screen',
        function: null,
        cFile: null,
        line: null,
        message: null,
        recordedSteps: 714,
        remaining: 298,
    });
    // At the same step the RNG mismatch wins, because the drawn value
    // precedes the screen it changes.
    const sameStep = structuredClone(rngFirst);
    sameStep.divergence.screen.index = 418;
    const entry = queueEntry(sameStep, owners);
    assert.equal(entry.kind, 'rng');
    assert.equal(entry.function, 'dog_move');
    assert.equal(entry.cFile, 'dogmove.c');
    assert.equal(entry.line, 1255);

    // A refusal counts at the step the port stopped, and the `name()` in its
    // message resolves to the C file that defines it.
    const stop = queueEntry(stopOnly, owners);
    assert.equal(stop.kind, 'stop');
    assert.equal(stop.step, 227);
    assert.equal(stop.function, 'poison_strdmg');
    assert.equal(stop.cFile, 'attrib.c');
    assert.equal(stop.remaining, 1726);

    assert.equal(queueEntry(screenOnly, owners).kind, 'screen');
    assert.equal(queueEntry(passing, owners), null);
});

test('fileOrder ranks by session count, then by the earliest step', () => {
    const entries = [
        { session: 's1', step: 300, cFile: 'attrib.c' },
        { session: 's2', step: 50, cFile: 'dogmove.c' },
        { session: 's3', step: 400, cFile: 'attrib.c' },
        { session: 's4', step: 10, cFile: null },
    ];
    const counts = () => ({ functionsTotal: 10, functionsPorted: 4 });
    assert.deepEqual(fileOrder(entries, counts).map((file) => file.cFile),
        ['attrib.c', 'dogmove.c']);
    assert.equal(fileOrder(entries, counts)[0].earliestStep, 300);
});

test('buildQueue and formatQueue cover the whole scan', () => {
    const scan = { rows: [passing, screenOnly, stopOnly, rngFirst] };
    const counts = () => ({ functionsTotal: 10, functionsPorted: 4 });
    const queue = buildQueue(scan, owners, counts);
    assert.deepEqual(queue.sessions.map((entry) => entry.session), [
        'seed2200-wizard-quaff-zap-read',
        'seed0030-ten-diverse-deaths',
        'seed0014-dequa-fountain-explore',
    ]);
    assert.deepEqual(queue.files.map((file) => file.cFile), ['attrib.c']);
    const text = formatQueue(queue);
    assert.ok(text.includes('seed0030-ten-diverse-deaths: step 227 (stop), '
        + 'poison_strdmg() in attrib.c, 1726 of 1953 screens remain'));
    assert.ok(text.includes('attrib.c: 1 session(s), earliest step 227, '
        + '4 of 10 functions ported'));
});
