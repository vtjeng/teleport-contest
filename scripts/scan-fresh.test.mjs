import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    firstFailureDescription,
    formatScanReport,
    loadScanPlan,
    parseScanArgs,
    runFreshCaseWorker,
    scanFreshCases,
    summarizeScan,
    validateScanPlan,
} from './scan-fresh.mjs';

function segment(seed, moves = '') {
    return {
        seed,
        datetime: '20320304050607',
        nethackrc: '',
        moves,
    };
}

function passingResult() {
    return {
        passed: true,
        error: null,
        lengths: {
            rng: { c: 0, js: 0 },
            screens: { c: 0, js: 0 },
            cursors: { c: 0, js: 0 },
        },
        rngMismatch: null,
        screenMismatch: null,
        cursorMismatch: null,
    };
}

function errorResult(message) {
    return { ...passingResult(), passed: false, error: message };
}

test('parses one plan path and bounded concurrency', () => {
    assert.deepEqual(
        parseScanArgs(['cases.json', '--concurrency', '4']),
        { help: false, planPath: 'cases.json', concurrency: 4 },
    );
    assert.throws(
        () => parseScanArgs(['cases.json', '--concurrency', '9']),
        /must not exceed 8/u,
    );
    assert.throws(() => parseScanArgs([]), /exactly one/u);
});

test('validates labeled replay-only cases without changing their inputs', () => {
    const plan = {
        version: 1,
        cases: [
            {
                label: 'single segment',
                // This arbitrary seed and move distinguish the preserved input.
                segments: [segment(91001, ' .')],
            },
            {
                label: 'persisted pair',
                // These arbitrary segments exercise one case spanning storage.
                segments: [segment(91002, ' '), segment(91003, '.')],
            },
        ],
    };
    const cases = validateScanPlan(plan);

    assert.deepEqual(cases.map(({ label }) => label), [
        'single segment',
        'persisted pair',
    ]);
    assert.deepEqual(cases[0].recipe, {
        version: 5,
        segments: plan.cases[0].segments,
    });
    assert.equal(cases[1].recipe.segments.length, 2);
});

test('rejects recorded answers, duplicate labels, and sealed paths', () => {
    const recorded = segment(92001);
    recorded.steps = [];
    assert.throws(
        () => validateScanPlan({
            version: 1,
            cases: [{ label: 'recorded', segments: [recorded] }],
        }),
        /must not contain recorded steps/u,
    );
    assert.throws(
        () => validateScanPlan({
            version: 1,
            cases: [
                { label: 'same', segments: [segment(92002)] },
                { label: 'same', segments: [segment(92003)] },
            ],
        }),
        /repeats label/u,
    );
    assert.throws(
        () => loadScanPlan('sessions/holdout/example.json'),
        /sealed holdout paths/u,
    );
});

test('groups matching first failures and keeps the first original case', () => {
    const cases = validateScanPlan({
        version: 1,
        cases: [
            { label: 'pass', segments: [segment(93001)] },
            { label: 'first trap', segments: [segment(93002, ' .')] },
            { label: 'same trap', segments: [segment(93003, ' h')] },
            { label: 'random call', segments: [segment(93004, ' .')] },
        ],
    });
    const rngFailure = {
        ...passingResult(),
        passed: false,
        rngMismatch: {
            index: 12,
            cEntry: 'rn2(6)=4',
            cCaller: 'owner(source.c:10)',
            jsEntry: 'rn2(4)=2',
        },
    };
    const summary = summarizeScan(cases, [
        passingResult(),
        errorResult('UnsupportedTrapError: trap type 20'),
        errorResult('UnsupportedTrapError: trap type 20'),
        rngFailure,
    ]);

    assert.deepEqual(
        {
            total: summary.total,
            passed: summary.passed,
            failed: summary.failed,
            groups: summary.groups.length,
        },
        { total: 4, passed: 1, failed: 3, groups: 2 },
    );
    assert.equal(summary.groups[0].count, 2);
    assert.equal(summary.groups[0].representative.label, 'first trap');
    assert.equal(summary.groups[0].representative.recipe.segments[0].seed, 93002);
    assert.equal(
        firstFailureDescription(rngFailure),
        'PRNG: rn2(6) at owner(source.c:10); JS rn2(4)',
    );
    const report = formatScanReport(summary);
    assert.match(report, /Representative: first trap/u);
    assert.match(report, /"seed": 93002/u);
    assert.match(report, /2 failure groups/u);
});

test('limits concurrent cases while preserving result order', async () => {
    const cases = validateScanPlan({
        version: 1,
        // Six arbitrary cases are enough to exceed the requested three workers.
        cases: Array.from({ length: 6 }, (_, index) => ({
            label: `case ${index + 1}`,
            segments: [segment(94001 + index)],
        })),
    });
    let active = 0;
    let maximum = 0;
    const completed = [];

    const summary = await scanFreshCases(cases, {
        concurrency: 3,
        runCase: async () => {
            active++;
            maximum = Math.max(maximum, active);
            // A short delay makes overlap observable without slowing the suite.
            await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
            active--;
            return passingResult();
        },
        onComplete: ({ index }) => completed.push(index),
    });

    assert.equal(maximum, 3);
    assert.equal(completed.length, 6);
    assert.equal(summary.passed, 6);
    assert.equal(summary.failed, 0);
});

test('worker protocol passes the exact recipe through an isolated file', async (t) => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fresh-scan-test-'));
    t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
    const workerPath = path.join(tempRoot, 'fake-worker.mjs');
    await fs.writeFile(workerPath, `
import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
const recipe = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const result = {
    passed: recipe.segments[0].seed === 95001,
    error: null,
    lengths: {
        rng: { c: 0, js: 0 },
        screens: { c: 0, js: 0 },
        cursors: { c: 0, js: 0 }
    },
    rngMismatch: null,
    screenMismatch: null,
    cursorMismatch: null
};
writeFileSync(process.argv[3], JSON.stringify(result));
`);
    const recipe = {
        version: 5,
        // This arbitrary seed lets the fake worker prove it received the case.
        segments: [segment(95001, ' .')],
    };

    const result = await runFreshCaseWorker(recipe, {
        workerScript: workerPath,
        env: {
            ...process.env,
            NODE_TEST_CONTEXT: undefined,
        },
    });
    assert.equal(result.passed, true);
});
