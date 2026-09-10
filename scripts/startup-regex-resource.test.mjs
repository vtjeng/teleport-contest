import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

import { runBoundedChild } from './run-startup-regex-resource.mjs';
import {
    EXACT_BOUNDARY_REGEX_CASES,
    FIXED_POINT_REGEX_RESOURCE_CASE,
    REGEX_EXACT_BOUNDARY_BYTES,
    REGEX_RESOURCE_CASES,
    REGEX_RESOURCE_OUTPUT_NAMES,
} from './startup-regex-fixtures.mjs';

const RUNNER = resolve('scripts/run-startup-regex-resource.mjs');
const REQUIRED_RESOURCE_NAMES = Object.freeze([
    'literal-suffix-guard',
    'suffix-reaching-direct-memo',
    'suffix-reaching-reference-memo',
    'suffix-reaching-zero-minimum',
    'suffix-reaching-correlated-frontier',
    'adjacent-repeat-fixed-point',
]);

test('regex adversaries satisfy exact resource and fixed-point bounds', () => {
    const result = spawnSync(process.execPath, [RUNNER], {
        encoding: 'utf8',
        timeout: 12_000,
        maxBuffer: 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
        assert.fail(result.error?.message || result.stderr.trim()
            || `resource runner exited ${result.status}`);
    }
    const outputNames = result.stdout.trim().split('\n').map((line) => (
        line.slice(0, line.indexOf(':'))
    ));
    assert.deepEqual(outputNames, REGEX_RESOURCE_OUTPUT_NAMES);
});

test('the resource gate allows scheduling delay and reports CPU and wall time',
    () => {
        // Use the adversary that exceeded its wall budget in parallel tests.
        const entry = REGEX_RESOURCE_CASES.find(
            ({ name }) => name === 'suffix-reaching-correlated-frontier',
        );
        const output = [];
        runBoundedChild(entry.name, entry, {
            run(command, args, options) {
                assert.equal(command, process.execPath);
                assert.deepEqual(args, [RUNNER, '--case', entry.name]);
                // Preserve the existing two-second process-startup allowance
                // and finite watchdog even though the work budget uses CPU.
                assert.equal(options.timeout, entry.budgetCpuMs + 2000);
                return {
                    status: 0,
                    stdout: JSON.stringify({
                        name: entry.name,
                        // Exact CPU and RSS limits remain inclusive. One
                        // extra wall millisecond represents scheduling delay.
                        cpuMs: entry.budgetCpuMs,
                        elapsedMs: entry.budgetCpuMs + 1,
                        maxRssKiB: entry.budgetMaxRssKiB,
                    }),
                };
            },
            output: (line) => output.push(line),
        });
        assert.equal(output.join(''), `${entry.name}: `
            + `${entry.budgetCpuMs.toFixed(1)} ms CPU, `
            + `${(entry.budgetCpuMs + 1).toFixed(1)} ms wall, `
            + `${entry.budgetMaxRssKiB} KiB maxRSS `
            + `(budgets ${entry.budgetCpuMs} ms CPU/`
            + `${entry.budgetMaxRssKiB} KiB)\n`);
    });

test('the resource gate rejects excess CPU work and memory independently', () => {
    // The smallest fixture provides real catalog bounds for both failures.
    const entry = REGEX_RESOURCE_CASES[0];
    const atLimit = {
        name: entry.name,
        cpuMs: entry.budgetCpuMs,
        elapsedMs: entry.budgetCpuMs,
        maxRssKiB: entry.budgetMaxRssKiB,
    };
    for (const [excess, diagnostic] of [
        // Cross each limit by one unit while holding the other at its limit.
        [{ cpuMs: entry.budgetCpuMs + 1 }, /ms CPU/u],
        [{ maxRssKiB: entry.budgetMaxRssKiB + 1 }, /KiB maxRSS/u],
    ]) {
        assert.throws(() => runBoundedChild(entry.name, entry, {
            run: () => ({
                status: 0,
                stdout: JSON.stringify({ ...atLimit, ...excess }),
            }),
            output: () => assert.fail('a failed case must not report success'),
        }), diagnostic);
    }
});

test('the resource gate fails when the child watchdog expires', () => {
    const entry = FIXED_POINT_REGEX_RESOURCE_CASE;
    assert.throws(() => runBoundedChild(entry.name, entry, {
        run(command, args, options) {
            assert.equal(command, process.execPath);
            assert.deepEqual(args, [RUNNER, '--case', entry.name]);
            // The fixed-point child retains its original three-second limit.
            assert.equal(options.timeout, 3000);
            return {
                error: new Error('spawnSync ETIMEDOUT'),
                status: null,
                stderr: '',
            };
        },
        output: () => assert.fail('a timed-out child must not report success'),
    }), /ETIMEDOUT/u);
});

test('the fixture catalog completely owns exact and fixed-point resources', () => {
    assert.deepEqual(REGEX_RESOURCE_OUTPUT_NAMES, REQUIRED_RESOURCE_NAMES);
    assert.deepEqual(REGEX_RESOURCE_CASES, [
        ...EXACT_BOUNDARY_REGEX_CASES,
        FIXED_POINT_REGEX_RESOURCE_CASE,
    ]);
    assert.equal(new Set(REGEX_RESOURCE_OUTPUT_NAMES).size,
        REGEX_RESOURCE_CASES.length);
    for (const entry of EXACT_BOUNDARY_REGEX_CASES) {
        assert.equal(entry.kind, 'exact-boundary');
        assert.equal(Buffer.byteLength(entry.pattern),
            REGEX_EXACT_BOUNDARY_BYTES, entry.name);
        assert.equal(Buffer.byteLength(entry.input),
            REGEX_EXACT_BOUNDARY_BYTES, entry.name);
    }
    assert.equal(FIXED_POINT_REGEX_RESOURCE_CASE.kind, 'fixed-point');
    assert.ok(FIXED_POINT_REGEX_RESOURCE_CASE.cases.length > 0);
});

test('suffix-reaching fixtures enter the evaluator paths their names claim',
    () => {
        const fixture = Object.fromEntries(EXACT_BOUNDARY_REGEX_CASES.map(
            (entry) => [entry.name, entry],
        ));
        for (const name of [
            'suffix-reaching-direct-memo',
            'suffix-reaching-reference-memo',
            'suffix-reaching-correlated-frontier',
        ]) {
            assert.ok(fixture[name].pattern.endsWith('b$'), name);
            assert.ok(fixture[name].input.endsWith('b'), name);
        }
        assert.ok(fixture['literal-suffix-guard'].pattern.endsWith('b$'));
        assert.ok(!fixture['literal-suffix-guard'].input.endsWith('b'));
        assert.equal(fixture['literal-suffix-guard'].expected, false);
        assert.ok(!fixture['suffix-reaching-zero-minimum'].pattern
            .endsWith('b$'));
        assert.equal(fixture['suffix-reaching-zero-minimum'].expected, true);
    });
