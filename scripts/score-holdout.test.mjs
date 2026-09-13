import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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


test('the CLI scores a disposable corpus without a goal or permission records', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'holdout-cli-fixture-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const path of ['scripts', 'js', 'frozen', 'sessions/holdout', 'tmp'])
        mkdirSync(join(root, path), { recursive: true });
    for (const name of ['score-holdout.mjs', 'scoring-workspace.mjs', 'local-tmpdir.mjs'])
        copyFileSync(join(TEST_DIR, name), join(root, 'scripts', name));
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    for (const name of ['isaac64.js', 'terminal.js', 'storage.js'])
        writeFileSync(join(root, 'frozen', name), '// Synthetic scorer overlay.\n');
    // Eleven newly written fixtures exercise the fixed count without reading
    // any recorded development or holdout game. Distinct screen and RNG
    // fractions expose a swapped aggregate field.
    const fixture = { passed: false, error: null, metrics: {
        screens: { matched: 1, total: 2 },
        rngCalls: { matched: 3, total: 4 },
        cursors: { matched: 1, total: 2 },
    } };
    for (let index = 0; index < 11; index++)
        writeFileSync(join(root, 'sessions', 'holdout', index + '.session.json'), JSON.stringify(fixture));
    writeFileSync(join(root, 'frozen', 'ps_test_runner.mjs'), [
        "import { readdirSync, readFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        'const directory = process.argv[2];',
        'const results = readdirSync(directory).map(file => JSON.parse(readFileSync(join(directory, file), "utf8")));',
        'console.log("__RESULTS_JSON__" + JSON.stringify({ results }));',
    ].join('\n'));
    const result = spawnSync(process.execPath, [join(root, 'scripts', 'score-holdout.mjs')], {
        cwd: root, encoding: 'utf8', env: { ...process.env, TMPDIR: join(root, 'tmp') },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Sessions: 0\/11 passing; 0 replay errors/);
    assert.match(result.stdout, /Screens: 11\/22 \(50\.0%\)/);
    assert.match(result.stdout, /PRNG: 33\/44 \(75\.0%\)/);
    assert.match(result.stdout, /Cursors: 11\/22 \(50\.0%\)/);
    assert.deepEqual(readdirSync(join(root, 'tmp')), []); // Scoring workspace was removed.
});
