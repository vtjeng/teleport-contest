import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildQueue, fileOrder, formatQueue, parseCaller, queueEntry,
} from './mismatch-queue.mjs';

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
        functionPorted: false,
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
    assert.equal(entry.functionPorted, false);
    assert.equal(entry.cFile, 'dogmove.c');
    assert.equal(entry.line, 1255);

    // When the named function appears in portedNames, functionPorted is true.
    const portedEntry = queueEntry(sameStep, owners, new Set(['dog_move']));
    assert.equal(portedEntry.functionPorted, true);

    // A refusal counts at the step the port stopped, and the `name()` in its
    // message resolves to the C file that defines it.
    const stop = queueEntry(stopOnly, owners);
    assert.equal(stop.kind, 'stop');
    assert.equal(stop.step, 227);
    assert.equal(stop.function, 'poison_strdmg');
    assert.equal(stop.functionPorted, false);
    assert.equal(stop.cFile, 'attrib.c');
    assert.equal(stop.remaining, 1726);

    assert.equal(queueEntry(screenOnly, owners).kind, 'screen');
    assert.equal(queueEntry(passing, owners), null);
});

test('fileOrder ranks by forfeited screens, then by the earliest step', () => {
    const entries = [
        // attrib.c: 2 sessions, 100+200 = 300 forfeited screens.
        { session: 's1', step: 300, remaining: 100, cFile: 'attrib.c' },
        // dogmove.c: 1 session, 500 forfeited screens — ranks first.
        { session: 's2', step: 50, remaining: 500, cFile: 'dogmove.c' },
        { session: 's3', step: 400, remaining: 200, cFile: 'attrib.c' },
        // No C file: excluded from the order.
        { session: 's4', step: 10, remaining: 900, cFile: null },
    ];
    const counts = () => ({ functionsTotal: 10, functionsPorted: 4 });
    const order = fileOrder(entries, counts);
    assert.deepEqual(order.map((file) => file.cFile),
        ['dogmove.c', 'attrib.c']);
    assert.equal(order[0].forfeitedScreens, 500);
    assert.equal(order[1].forfeitedScreens, 300);
    assert.equal(order[1].earliestStep, 300);
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
    // The stop entry names an unported function, so no [divergence] tag.
    assert.ok(text.includes('seed0030-ten-diverse-deaths: step 227 (stop), '
        + 'poison_strdmg() in attrib.c, 1726 of 1953 screens remain'));
    assert.ok(!text.includes('[divergence]'));
    // The file has unported functions, so it appears under file ports.
    assert.ok(text.includes('Goal order — file ports'));
    assert.ok(text.includes('attrib.c: 1726 forfeited screens across 1 session(s), '
        + 'earliest step 227, 4 of 10 functions ported'));
});

test('formatQueue labels divergences and separates fully-ported files', () => {
    const scan = { rows: [stopOnly] };
    // All functions ported: the file is a divergence-fix candidate.
    const allPorted = () => ({ functionsTotal: 5, functionsPorted: 5 });
    const portedNames = new Set(['poison_strdmg']);
    const queue = buildQueue(scan, owners, allPorted, portedNames);
    assert.equal(queue.sessions[0].functionPorted, true);
    const text = formatQueue(queue);
    // The session line carries the [divergence] tag.
    assert.ok(text.includes('poison_strdmg() in attrib.c [divergence]'));
    // The file appears under divergence fixes, not file ports.
    assert.ok(text.includes('Goal order — divergence fixes'));
    assert.ok(text.includes('attrib.c: 1726 forfeited screens across 1 session(s)'));
    assert.ok(!text.includes('Goal order — file ports\n  attrib.c'));
});
