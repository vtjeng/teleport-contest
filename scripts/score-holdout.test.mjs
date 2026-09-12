import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    formatSummary,
    parseEvaluationArgs,
    parseRunnerBundle,
    summarizeBundle,
} from './score-holdout.mjs';

test('open-corpus evaluation accepts an optional goal label', () => {
    assert.deepEqual(parseEvaluationArgs([]), { goal: null });
    assert.deepEqual(parseEvaluationArgs(['--goal', 'source-fix']), { goal: 'source-fix' });
    assert.throws(() => parseEvaluationArgs(['--goal']), /usage/);
    assert.throws(() => parseEvaluationArgs(['--goal', '--check']), /usage/);
    assert.throws(() => parseEvaluationArgs(['--unknown']), /usage/);
    // The exposure boundary retires the former permission override.
    assert.throws(() => parseEvaluationArgs(['--despite-prior-evaluation', 'reason']), /usage/);
});

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

test('parses the final scorer result bundle', () => {
    const expected = { results: [] };
    const stdout = `diagnostic\n__RESULTS_JSON__\n${JSON.stringify(expected)}\n`;
    assert.deepEqual(parseRunnerBundle(stdout), expected);
});

test('rejects scorer output without a result bundle', () => {
    assert.throws(() => parseRunnerBundle('diagnostic only'));
    assert.throws(() => parseRunnerBundle('__RESULTS_JSON__\n{}'));
});

test('aggregates metrics separately from per-session diagnostics', () => {
    // Distinct totals exercise pass/error counting and make a swapped or
    // double-counted screen/RNG field visible in the expected sums.
    const bundle = {
        results: [
            {
                session: 'case-alpha.session.json',
                passed: true,
                error: null,
                metrics: {
                    screens: { matched: 3, total: 5 },
                    rngCalls: { matched: 7, total: 11 },
                    cursors: { matched: 4, total: 5 },
                },
            },
            {
                session: 'case-beta.session.json',
                passed: false,
                error: 'per-session failure',
                metrics: {
                    screens: { matched: 2, total: 6 },
                    rngCalls: { matched: 1, total: 13 },
                    cursors: { matched: 2, total: 6 },
                },
            },
        ],
    };

    const summary = summarizeBundle(bundle);
    assert.deepEqual(summary, {
        sessions: { passed: 1, total: 2, errored: 1 },
        screens: { matched: 5, total: 11 },
        rngCalls: { matched: 8, total: 24 },
        cursors: { matched: 6, total: 11 },
    });

    const output = formatSummary(summary);
    assert.doesNotMatch(output, /case-alpha|case-beta|per-session failure/);
    assert.match(output, /Sessions: 1\/2 passing; 1 replay errors/);
    assert.match(output, /Screens: 5\/11 \(45\.5%\)/);
    assert.match(output, /PRNG: 8\/24 \(33\.3%\)/);
    assert.match(output, /Cursors: 6\/11 \(54\.5%\)/);
});

test('formats empty metrics without dividing by zero', () => {
    const output = formatSummary({
        sessions: { passed: 0, total: 0, errored: 0 },
        screens: { matched: 0, total: 0 },
        rngCalls: { matched: 0, total: 0 },
        cursors: { matched: 0, total: 0 },
    });
    assert.match(output, /Screens: 0\/0 \(0\.0%\)/);
    assert.match(output, /PRNG: 0\/0 \(0\.0%\)/);
});

test('an unknown argument fails before scoring', () => {
    const result = spawnSync(process.execPath,
        [join(TEST_DIR, 'score-holdout.mjs'), '--unknown'], { encoding: 'utf8' });
    assert.equal(result.status, 1); // CLI rejection, before opening a scoring workspace.
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /usage: score-holdout/);
});
