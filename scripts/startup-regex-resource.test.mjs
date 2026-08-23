import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

import {
    EXACT_BOUNDARY_REGEX_CASES,
    FINITE_MAXIMUM_FRONTIER_RESOURCE_CASE,
    FINITE_ZERO_WIDTH_MAXIMUM_RESOURCE_CASE,
    FINITE_ZERO_WIDTH_REGEX_RESOURCE_CASE,
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
    'finite-zero-width-repeat-fixed-point',
    'finite-zero-width-maximum-projection',
    'finite-maximum-projected-frontier',
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

test('the fixture catalog completely owns exact and fixed-point resources', () => {
    assert.deepEqual(REGEX_RESOURCE_OUTPUT_NAMES, REQUIRED_RESOURCE_NAMES);
    assert.deepEqual(REGEX_RESOURCE_CASES, [
        ...EXACT_BOUNDARY_REGEX_CASES,
        FIXED_POINT_REGEX_RESOURCE_CASE,
        FINITE_ZERO_WIDTH_REGEX_RESOURCE_CASE,
        FINITE_ZERO_WIDTH_MAXIMUM_RESOURCE_CASE,
        FINITE_MAXIMUM_FRONTIER_RESOURCE_CASE,
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
    assert.equal(FINITE_ZERO_WIDTH_REGEX_RESOURCE_CASE.kind,
        'finite-zero-width-fixed-point');
    assert.equal(FINITE_ZERO_WIDTH_REGEX_RESOURCE_CASE.expected, false);
    assert.equal(FINITE_ZERO_WIDTH_REGEX_RESOURCE_CASE.input.length,
        REGEX_EXACT_BOUNDARY_BYTES);
    assert.equal(FINITE_ZERO_WIDTH_MAXIMUM_RESOURCE_CASE.expected, true);
    assert.equal(FINITE_MAXIMUM_FRONTIER_RESOURCE_CASE.input.length,
        REGEX_EXACT_BOUNDARY_BYTES);
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
