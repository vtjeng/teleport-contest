import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
    rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertInstrumentationParity, functionCoverage,
    parseReplayCoverageArgs, selectWorkerCoverage } from './replay-coverage.mjs';

const CLI = fileURLToPath(new URL('./replay-coverage.mjs', import.meta.url));
// This value tests full-SHA syntax only; it never identifies a real commit.
const SYNTACTIC_SHA = 'a'.repeat(40);
const argsFor = (session) => ['--sha', SYNTACTIC_SHA, '--session', session,
    '--target', 'js/jsmain.js:target'];

test('unsafe references are rejected before any repository or session read', () => {
    // These are rejected strings, not fixture paths. Nothing creates or opens
    // a restricted directory. The nonexistent repo makes read order observable.
    for (const session of ['sessions/holdout/nested/game.session.json',
        'sessions/nested/game.session.json', 'sessions/../game.session.json',
        '/sessions/game.session.json', 'recordings/../game.session.json',
        'recordings/a\\game.session.json']) {
        assert.throws(() => parseReplayCoverageArgs(argsFor(session)), /--session/u);
        const child = spawnSync(process.execPath, [CLI, '--repo',
            '/does-not-exist-replay-coverage-fixture', ...argsFor(session)], { encoding: 'utf8' });
        assert.equal(child.status, 2);
        assert.match(child.stderr, /--session/u);
        assert.doesNotMatch(child.stderr, /ENOENT/u);
    }
    assert.throws(() => parseReplayCoverageArgs([...argsFor('sessions/game.session.json'),
        '--target', 'js/../elsewhere.js:target']), /invalid target/u);
    assert.throws(() => parseReplayCoverageArgs([...argsFor('sessions/game.session.json'),
        '--target', 'js/terminal.js:target']), /scorer-supplied/u);
    // Opening permits diagnostics on a direct holdout file; nesting stays invalid.
    assert.equal(parseReplayCoverageArgs(argsFor('sessions/holdout/example.session.json')).session,
        'sessions/holdout/example.session.json');
    assert.equal(parseReplayCoverageArgs(argsFor('recordings/rooms.c/entry.session.json')).session,
        'recordings/rooms.c/entry.session.json');
});

test('function coverage retains nested zero ranges and separates missing states', () => {
    const source = 'function target(flag) {\n  if (flag) {\n    return "unvisited";\n  }\n  return "visited";\n}\n';
    const zeroStart = source.indexOf('{', source.indexOf('if'));
    const zeroEnd = source.indexOf('}', zeroStart) + 1;
    const fn = { functionName: 'target', isBlockCoverage: true, ranges: [
        { startOffset: 0, endOffset: source.length - 1, count: 1 },
        { startOffset: zeroStart, endOffset: zeroEnd, count: 0 },
    ] };
    const report = functionCoverage({ functions: [fn] }, 'target', source);
    assert.equal(report.status, 'executed');
    assert.equal(report.outerCount, 1);
    assert.deepEqual(report.ranges.map(({ kind, count }) => ({ kind, count })),
        [{ kind: 'function', count: 1 }, { kind: 'block', count: 0 }]);
    assert.equal(report.ranges[1].startLine, 2);
    assert.equal(report.ranges[1].endLine, 4);
    assert.equal(report.ranges[1].snippet, '{ return "unvisited"; }');
    assert.equal(functionCoverage(null, 'target', source).status, 'module-not-loaded');
    assert.equal(functionCoverage({ functions: [fn] }, 'other', source).status, 'function-not-found');
    const neverCalled = { ...fn, ranges: [{ ...fn.ranges[0], count: 0 }] };
    assert.equal(functionCoverage({ functions: [neverCalled] }, 'target', source).status, 'zero');
    assert.throws(() => functionCoverage({ functions: [fn, fn] }, 'target', source),
        /ambiguous coverage/u);
});

test('missing or incomplete worker coverage cannot look like an unexecuted target', () => {
    const root = '/tmp/synthetic-coverage-snapshot';
    const worker = { path: '/tmp/synthetic-worker.json', data: { result: [
        { url: pathToFileURL(join(root, 'js/jsmain.js')).href, functions: [] },
    ] } };
    assert.equal(selectWorkerCoverage([worker], root), worker);
    assert.throws(() => selectWorkerCoverage([], root), /found 0/u);
    assert.throws(() => selectWorkerCoverage([worker], `${root}-different`), /found 0/u);
    assert.throws(() => selectWorkerCoverage([worker, { ...worker, path: 'other.json' }], root),
        /found 2/u);
    assert.throws(() => selectWorkerCoverage([{ path: 'incomplete.json', data: {} }], root),
        /malformed/u);
});

test('instrumentation may change elapsed time only', () => {
    // One screen and one move suffice to distinguish scorer data from timing.
    const plain = { passed: true, error: null, metrics: { screens: { matched: 1, total: 1 } },
        time: { ms: 1, moves: 1 } };
    const instrumented = structuredClone(plain);
    instrumented.time.ms = 2;
    assert.doesNotThrow(() => assertInstrumentationParity(plain, instrumented));
    for (const changed of [
        { ...instrumented, passed: false },
        { ...instrumented, error: 'worker error' },
        { ...instrumented, metrics: { screens: { matched: 0, total: 1 } } },
        { ...instrumented, time: { ms: 2, moves: 2 } },
    ]) assert.throws(() => assertInstrumentationParity(plain, changed), /instrumentation changed/u);
});

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'teleport-replay-coverage-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const repo = join(root, 'repo');
    const artifacts = join(root, 'artifacts');
    mkdirSync(repo);
    mkdirSync(artifacts);
    const files = {
        'package.json': JSON.stringify({ type: 'module' }),
        'js/jsmain.js': `import { marker as rng } from './isaac64.js';
import { marker as terminal } from './terminal.js';
import { marker as storage } from './storage.js';
export function target(flag) {
    if (flag) { return 'unvisited branch'; }
    return [rng, terminal, storage].join(',');
}
export function unused() { return 'uncalled function'; }
export function runSegment(input) { return target(input.flag); }
`,
        'js/unloaded.js': "export function negative() { return 'unloaded module'; }\n",
        // These originals must be replaced by the frozen modules for the
        // fixture worker to report a passing replay.
        'js/isaac64.js': "export const marker = 'original-rng';\n",
        'js/terminal.js': "export const marker = 'original-terminal';\n",
        'js/storage.js': "export const marker = 'original-storage';\n",
        'frozen/isaac64.js': "export const marker = 'frozen-rng';\n",
        'frozen/terminal.js': "export const marker = 'frozen-terminal';\n",
        'frozen/storage.js': "export const marker = 'frozen-storage';\n",
        'frozen/ps_test_runner.mjs': `import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { runSegment } from '../js/jsmain.js';
const file = process.argv.find(arg => arg.startsWith('--worker-session=')).split('=')[1];
const input = JSON.parse(readFileSync(file, 'utf8'));
const passed = runSegment(input) === 'frozen-rng,frozen-terminal,frozen-storage';
const matched = input.instrumentationMismatch && process.env.NODE_V8_COVERAGE ? 0 : 1;
console.log('__RESULT_ONE__' + JSON.stringify({ session: basename(file), passed, error: null,
    metrics: { screens: { matched, total: 1 } }, time: { ms: performance.now(), moves: 1 } }));
`,
        'sessions/fixture.session.json': JSON.stringify({ flag: false }),
        'recordings/fixture/mismatch.session.json': JSON.stringify({ flag: false, instrumentationMismatch: true }),
        // These committed files prove the archive excludes other recordings
        // and unrelated repository paths without enumerating a real corpus.
        'sessions/unselected.session.json': '{}',
        'scripts/unrelated.txt': 'must not enter the snapshot',
    };
    for (const [path, body] of Object.entries(files)) {
        mkdirSync(dirname(join(repo, path)), { recursive: true });
        writeFileSync(join(repo, path), body);
    }
    const git = (...args) => {
        const child = spawnSync('git', ['-C', repo, '-c', 'user.name=Coverage fixture',
            '-c', 'user.email=coverage-fixture@example.invalid', '-c', 'commit.gpgsign=false',
            '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8' });
        assert.equal(child.status, 0, child.stderr);
        return child.stdout.trim();
    };
    git('init', '--quiet');
    git('add', '--', ...Object.keys(files));
    git('commit', '--quiet', '-m', 'Coverage fixture');
    const sha = git('rev-parse', 'HEAD');
    const run = (session = 'sessions/fixture.session.json', commit = sha) => spawnSync(process.execPath,
        [CLI, '--repo', repo, '--sha', commit, '--session', session,
            '--target', 'js/jsmain.js:target', '--target', 'js/jsmain.js:unused',
            '--target', 'js/jsmain.js:missing', '--target', 'js/unloaded.js:negative'],
        { encoding: 'utf8', env: { ...process.env, TMPDIR: artifacts } });
    return { repo, artifacts, sha, git, run };
}

test('the CLI archives a pinned fixture, overlays the scorer, and preserves diagnostic evidence', (t) => {
    const f = fixture(t);
    const child = f.run();
    assert.equal(child.status, 0, child.stderr);
    const printed = JSON.parse(child.stdout);
    const summary = JSON.parse(readFileSync(printed.summary, 'utf8'));
    assert.equal(summary.status, 'complete');
    assert.equal(summary.snapshot.commit, f.sha);
    assert.equal(summary.instrumentationParity, true);
    assert.equal(summary.plain.result.passed, true);
    assert.equal(summary.snapshot.sessionBlob, f.git('rev-parse', `${f.sha}:sessions/fixture.session.json`));
    assert.equal(summary.targets[0].sourceBlob, f.git('rev-parse', `${f.sha}:js/jsmain.js`));
    assert.deepEqual(summary.targets.map(({ status, outerCount }) => ({ status, outerCount })), [
        { status: 'executed', outerCount: 1 }, { status: 'zero', outerCount: 0 },
        { status: 'function-not-found', outerCount: null }, { status: 'module-not-loaded', outerCount: null },
    ]);
    assert.ok(summary.targets[0].ranges.some(({ count, snippet }) => count === 0 && snippet.includes('unvisited branch')));
    assert.equal(summary.coverageDumps.length, 1);
    assert.ok(existsSync(summary.workerCoverageDump));
    assert.ok(existsSync(summary.plain.process.stdout));
    assert.ok(existsSync(summary.instrumented.process.stderr));
    assert.ok(existsSync(join(summary.snapshot.root, 'sessions/fixture.session.json')));
    assert.equal(existsSync(join(summary.snapshot.root, 'sessions/unselected.session.json')), false);
    assert.equal(existsSync(join(summary.snapshot.root, 'recordings/fixture/mismatch.session.json')), false);
    assert.equal(existsSync(join(summary.snapshot.root, 'scripts/unrelated.txt')), false);

    // A second run owns fresh artifacts, and keeps both raw results when
    // instrumentation changes a scorer field instead of presenting coverage.
    const mismatch = f.run('recordings/fixture/mismatch.session.json');
    assert.equal(mismatch.status, 2, mismatch.stderr);
    assert.match(mismatch.stderr, /instrumentation changed/u);
    const mismatchPath = /artifacts: (.+\/summary\.json)/u.exec(mismatch.stderr)?.[1];
    assert.ok(mismatchPath);
    assert.notEqual(dirname(mismatchPath), dirname(printed.summary));
    const invalid = JSON.parse(readFileSync(mismatchPath, 'utf8'));
    assert.equal(invalid.status, 'invalid');
    assert.equal(invalid.instrumentationParity, false);
    assert.equal(invalid.plain.result.metrics.screens.matched, 1);
    assert.equal(invalid.instrumented.result.metrics.screens.matched, 0);
    assert.equal(invalid.targets, undefined);
    assert.equal(readFileSync(printed.summary, 'utf8'), JSON.stringify(summary, null, 2) + '\n');
});

test('a selected Git symlink is rejected before extracting a snapshot or running a worker', (t) => {
    const f = fixture(t);
    symlinkSync('../sessions/fixture.session.json', join(f.repo, 'recordings/alias.session.json'));
    f.git('add', '--', 'recordings/alias.session.json');
    f.git('commit', '--quiet', '-m', 'Symlink rejection fixture');
    const child = f.run('recordings/alias.session.json', f.git('rev-parse', 'HEAD'));
    assert.equal(child.status, 2, child.stderr);
    assert.match(child.stderr, /symlink/u);
    assert.doesNotMatch(child.stderr, /Running plain worker/u);
    assert.deepEqual(readdirSync(f.artifacts), []);
});
