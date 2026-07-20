import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    formatSummary,
    parseRunnerBundle,
    summarizeBundle,
} from './score-holdout.mjs';

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

test('aggregates metrics without retaining sealed diagnostics', () => {
    // Distinct totals exercise pass/error counting and make a swapped or
    // double-counted screen/RNG field visible in the expected sums.
    const bundle = {
        results: [
            {
                session: 'sealed-alpha.session.json',
                passed: true,
                error: null,
                metrics: {
                    screens: { matched: 3, total: 5 },
                    rngCalls: { matched: 7, total: 11 },
                },
            },
            {
                session: 'sealed-beta.session.json',
                passed: false,
                error: 'sensitive per-session failure',
                metrics: {
                    screens: { matched: 2, total: 6 },
                    rngCalls: { matched: 1, total: 13 },
                },
            },
        ],
    };

    const summary = summarizeBundle(bundle);
    assert.deepEqual(summary, {
        sessions: { passed: 1, total: 2, errored: 1 },
        screens: { matched: 5, total: 11 },
        rngCalls: { matched: 8, total: 24 },
    });

    const output = formatSummary(summary);
    assert.doesNotMatch(output, /sealed-alpha|sealed-beta|sensitive/);
    assert.match(output, /Sessions: 1\/2 passing; 1 replay errors/);
    assert.match(output, /Screens: 5\/11 \(45\.5%\)/);
    assert.match(output, /PRNG: 8\/24 \(33\.3%\)/);
});

test('formats empty metrics without dividing by zero', () => {
    const output = formatSummary({
        sessions: { passed: 0, total: 0, errored: 0 },
        screens: { matched: 0, total: 0 },
        rngCalls: { matched: 0, total: 0 },
    });
    assert.match(output, /Screens: 0\/0 \(0\.0%\)/);
    assert.match(output, /PRNG: 0\/0 \(0\.0%\)/);
});

test('rejects arguments without echoing sealed identifiers', () => {
    const sentinel = 'sealed-session-name-must-not-leak';
    const result = spawnSync(
        process.execPath,
        [join(TEST_DIR, 'score-holdout.mjs'), sentinel],
        { encoding: 'utf8' },
    );

    // Exit status 1 distinguishes an intentional generic rejection from a
    // successful check while the sentinel verifies both output channels.
    assert.equal(result.status, 1);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(sentinel));
    assert.match(result.stderr, /failed without exposing per-session diagnostics/);
});
