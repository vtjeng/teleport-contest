// Exercise checkout, local C initialization, result publication, and cleanup
// with real Git. A small committed check replaces the expensive game suite.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REUSE_VERSION } from './checkpoint-reuse.mjs';
import { once } from 'node:events';
import test from 'node:test';
import { parseCheckpointOptions } from './checkpoint.mjs';
import { checkpointResultsDirectory, readCheckpointResult } from './checkpoint-results.mjs';

const CHECK = `
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(readFileSync('tracked.txt', 'utf8'), 'committed input\\n');
assert.equal(readFileSync('nethack-c/upstream/input.c', 'utf8'), 'committed C\\n');
assert.equal(existsSync('sessions/development.session.json'), true);
assert.equal(existsSync('sessions/holdout/holdout.session.json'), true);
assert.equal(existsSync('sessions/excluded-fixture'), false);
const commit = git('rev-parse', 'HEAD');
const reuseIndex = process.argv.indexOf('--reuse');
const reused = reuseIndex < 0 ? null : JSON.parse(readFileSync(process.argv[reuseIndex + 1]));
console.log(reused ? 'BOOKKEEPING_EXECUTION' : 'FULL_EXECUTION');
console.log('FIXTURE_READY');
if (process.env.CHECKPOINT_FIXTURE_WAIT) {
    await new Promise(resolve => process.stdin.once('data', resolve));
    process.stdin.pause();
}
if (process.env.CHECKPOINT_FIXTURE_ADVANCE) {
    const origin = process.env.CHECKPOINT_FIXTURE_ORIGIN;
    writeFileSync(join(origin, 'tracked.txt'), 'new main input\\n');
    git('-C', origin, 'add', 'tracked.txt');
    git('-C', origin, 'commit', '-qm', 'main continued during validation');
}
mkdirSync('.cache', { recursive: true });
const passed = !process.env.CHECKPOINT_FIXTURE_FAIL
    && (!existsSync('GOALS.json') || readFileSync('GOALS.json', 'utf8') !== 'invalid');
writeFileSync('.cache/checkpoint-summary.json', JSON.stringify({ commit,
    reuseVersion: ${REUSE_VERSION}, executionCommit: reused?.executionCommit ?? commit,
    results: [{ label: 'fixture', passed }],
    timestamp: new Date().toISOString(), allPassed: passed,
    tests: { passed }, recordings: { passed }, score: { fixture: true } }));
writeFileSync('.cache/development-standing.json', JSON.stringify({ score: { sha: reused?.executionCommit ?? commit } }));
writeFileSync('.cache/session-results.json', JSON.stringify({ results: [] }));
process.exitCode = passed ? 0 : 1;
`;

function fixture(t) {
    const parent = mkdtempSync(join(tmpdir(), 'checkpoint-worktree-test-'));
    let verifyCleanup = () => {};
    t.after(() => {
        try { verifyCleanup(); }
        finally { rmSync(parent, { recursive: true, force: true }); }
    });
    const root = join(parent, 'origin');
    const cRoot = join(parent, 'C');
    const git = (cwd, ...args) => {
        const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args],
            { cwd, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr); // Fixture Git setup must succeed.
        return result.stdout.trim();
    };
    for (const cwd of [root, cRoot]) {
        mkdirSync(cwd);
        git(cwd, 'init', '-q');
        git(cwd, 'config', 'user.name', 'Checkpoint fixture');
        git(cwd, 'config', 'user.email', 'checkpoint@example.invalid');
        git(cwd, 'config', 'commit.gpgsign', 'false');
    }
    writeFileSync(join(cRoot, 'input.c'), 'committed C\n');
    git(cRoot, 'add', 'input.c');
    git(cRoot, 'commit', '-qm', 'C fixture');
    mkdirSync(join(root, 'scripts'));
    for (const name of ['checkpoint.mjs', 'checkpoint-results.mjs', 'checkpoint-reuse.mjs', 'local-tmpdir.mjs'])
        copyFileSync(new URL(name, import.meta.url), join(root, 'scripts', name));
    writeFileSync(join(root, 'scripts/checkpoint-checks.mjs'), CHECK);
    writeFileSync(join(root, '.gitignore'), '.cache/\n');
    writeFileSync(join(root, 'tracked.txt'), 'committed input\n');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module',
        scripts: { checkpoint: 'node scripts/checkpoint.mjs' } }));
    git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', cRoot, 'nethack-c/upstream');
    // The promoted local holdout is included, while unrelated nested session
    // directories remain excluded from the checkpoint worktree.
    mkdirSync(join(root, 'sessions/holdout'), { recursive: true });
    writeFileSync(join(root, 'sessions/holdout/holdout.session.json'), '{}\n');
    mkdirSync(join(root, 'sessions/excluded-fixture'), { recursive: true });
    writeFileSync(join(root, 'sessions/development.session.json'), '{}\n');
    writeFileSync(join(root, 'sessions/excluded-fixture/sentinel'), 'excluded\n');
    git(root, 'add', '.gitignore', 'tracked.txt', 'package.json', 'scripts', 'sessions');
    git(root, 'commit', '-qm', 'checkpoint fixture');
    const commit = git(root, 'rev-parse', 'HEAD');
    const config = readFileSync(join(root, '.git/config'), 'utf8');
    const worktrees = () => git(root, 'worktree', 'list', '--porcelain')
        .split('\n').filter(line => line.startsWith('worktree ')).join('\n');
    const initialWorktrees = worktrees();
    const env = (extra) => ({ ...process.env, CHECKPOINT_FIXTURE_ORIGIN: root, ...extra });
    const latest = () => JSON.parse(readFileSync(join(root, '.cache/checkpoint-summary.json'), 'utf8'));
    const run = (extra = {}, args = []) => spawnSync(process.execPath,
        ['scripts/checkpoint.mjs', ...args], { cwd: root, encoding: 'utf8', env: env(extra) });
    const runAsync = (extra = {}) => {
        const child = spawn(process.execPath, ['scripts/checkpoint.mjs'],
            { cwd: root, env: env(extra), stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '';
        let errors = '';
        child.stderr.on('data', data => { errors += data; });
        const ready = new Promise((resolveReady, reject) => {
            child.stdout.on('data', data => {
                output += data;
                if (output.includes('FIXTURE_READY')) resolveReady();
            });
            child.once('error', reject);
            child.once('close', () => reject(new Error(`exited before ready: ${errors}`)));
        });
        const done = once(child, 'close').then(([code]) => ({ code, output, errors }));
        return { child, ready, done };
    };
    verifyCleanup = () => {
        assert.equal(worktrees(), initialWorktrees); // No temporary registrations survive.
        assert.equal(readFileSync(join(root, '.git/config'), 'utf8'), config);
    };
    return { root, commit, git, run, runAsync, latest };
}

test('checkpoint options select a revision and preserve verbose mode', () => {
    assert.deepEqual(parseCheckpointOptions([]), { revision: 'HEAD', verbose: false, force: false });
    assert.deepEqual(parseCheckpointOptions(['--commit', 'HEAD^', '--verbose']),
        { revision: 'HEAD^', verbose: true, force: false }); // Select a previous committed state.
    assert.equal(parseCheckpointOptions(['--force']).force, true);
    for (const args of [['--commit'], ['--unknown'], ['--commit', '--verbose'],
        ['--commit', 'HEAD', '--commit', 'HEAD^']]) {
        assert.throws(() => parseCheckpointOptions(args), /usage:/u);
    }
});

test('checkpoint ignores dirty origin files and uses committed local C', (t) => {
    const f = fixture(t);
    writeFileSync(join(f.root, 'tracked.txt'), 'uncommitted input\n');
    writeFileSync(join(f.root, 'nethack-c/upstream/input.c'), 'uncommitted C\n');
    const result = f.run();
    assert.equal(result.status, 0, result.stderr); // The committed fixture still passes.
    const summary = f.latest();
    assert.equal(summary.commit, f.commit);
    assert.equal(summary.allPassed, true);
    assert.equal(readFileSync(join(f.root, 'tracked.txt'), 'utf8'), 'uncommitted input\n');
    assert.equal(readFileSync(join(f.root, 'nethack-c/upstream/input.c'), 'utf8'), 'uncommitted C\n');
    assert.deepEqual(JSON.parse(readFileSync(join(summary.artifacts, 'session-results.json'))), { results: [] });
    assert.equal(existsSync(join(f.root, '.cache/session-results.json')), false);
    assert.equal(JSON.parse(readFileSync(join(f.root, '.cache/development-standing.json'))).score.sha, f.commit);
});

test('advancing origin HEAD does not fail or relabel a successful checkpoint', (t) => {
    const f = fixture(t);
    const result = f.run({ CHECKPOINT_FIXTURE_ADVANCE: 'yes' });
    assert.equal(result.status, 0, result.stderr); // Main advancing is not a check failure.
    assert.notEqual(f.git(f.root, 'rev-parse', 'HEAD'), f.commit);
    assert.equal(f.latest().commit, f.commit);
    assert.equal(f.latest().allPassed, true);
    assert.match(result.stdout, /Current HEAD is .*this result remains for/u);
});

test('a failed later run preserves the earlier successful run', (t) => {
    const f = fixture(t);
    assert.equal(f.run().status, 0); // Establish historical passing evidence.
    const earlier = f.latest();
    assert.equal(f.run({ CHECKPOINT_FIXTURE_FAIL: 'yes' }).status, 1);
    assert.equal(f.latest().allPassed, false);
    assert.notEqual(f.latest().artifacts, earlier.artifacts);
    assert.equal(JSON.parse(readFileSync(join(earlier.artifacts, 'summary.json'))).allPassed, true);
});

test('an explicit commit is tested even when HEAD contains different code', (t) => {
    const f = fixture(t);
    writeFileSync(join(f.root, 'tracked.txt'), 'later committed input\n');
    f.git(f.root, 'add', 'tracked.txt');
    f.git(f.root, 'commit', '-qm', 'later input');
    const result = f.run({}, ['--commit', f.commit]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.latest().commit, f.commit);
});

test('overlapping runs keep separate results when the older run finishes last', async (t) => {
    const f = fixture(t);
    const earlier = f.runAsync({ CHECKPOINT_FIXTURE_WAIT: 'yes' });
    await earlier.ready;
    f.git(f.root, 'commit', '--allow-empty', '-qm', 'next commit');
    const newerCommit = f.git(f.root, 'rev-parse', 'HEAD');
    const later = f.run();
    assert.equal(later.status, 0, later.stderr);
    earlier.child.stdin.end('finish\n');
    assert.equal((await earlier.done).code, 0);
    for (const commit of [f.commit, newerCommit]) {
        const summary = readCheckpointResult(f.root, commit);
        assert.equal(summary.commit, commit);
        assert.equal(summary.allPassed, true);
        assert.equal(existsSync(join(summary.artifacts, 'summary.json')), true);
    }
});

test('interrupting a run cleans up and retains earlier evidence', async (t) => {
    const f = fixture(t);
    assert.equal(f.run().status, 0);
    const earlier = f.latest();
    const interrupted = f.runAsync({ CHECKPOINT_FIXTURE_WAIT: 'yes' });
    await interrupted.ready;
    interrupted.child.kill('SIGTERM');
    assert.equal((await interrupted.done).code, 143); // Conventional 128 + SIGTERM.
    assert.equal(f.latest().allPassed, false);
    assert.equal(JSON.parse(readFileSync(join(earlier.artifacts, 'summary.json'))).allPassed, true);
});

test('an invalid revision fails without replacing completed results', (t) => {
    const f = fixture(t);
    assert.equal(f.run().status, 0);
    const earlier = f.latest();
    const result = f.run({}, ['--commit', 'not-a-revision']);
    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(f.latest(), earlier);
});

test('missing local C objects fail before checkout and preserve the previous result', (t) => {
    const f = fixture(t);
    assert.equal(f.run().status, 0);
    const earlier = f.latest();
    // This syntactically valid gitlink names an object absent from the local
    // C fixture. Setup must fail locally rather than trying a remote fetch.
    const missing = 'a'.repeat(40);
    f.git(f.root, 'update-index', '--cacheinfo', `160000,${missing},nethack-c/upstream`);
    f.git(f.root, 'commit', '-qm', 'unavailable C revision');
    const result = f.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /cat-file/u);
    assert.deepEqual(f.latest(), earlier);
});

test('results survive removal of the worktree that launched checkpoint', (t) => {
    const f = fixture(t);
    const linked = join(f.root, '..', 'linked');
    f.git(f.root, 'worktree', 'add', '--quiet', '--detach', linked, f.commit);
    try {
        const result = spawnSync(process.execPath, ['scripts/checkpoint.mjs'],
            { cwd: linked, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(checkpointResultsDirectory(linked), checkpointResultsDirectory(f.root));
    } finally {
        f.git(f.root, 'worktree', 'remove', '--force', linked);
    }
    const summary = readCheckpointResult(f.root, f.commit);
    assert.equal(summary.allPassed, true);
    assert.equal(existsSync(join(summary.artifacts, 'summary.json')), true);
});

test('an archive write failure keeps the tested checkout for recovery', (t) => {
    const f = fixture(t);
    // A file where the shared archive directory belongs makes mkdir fail
    // deterministically, including when the test runs with elevated privileges.
    writeFileSync(checkpointResultsDirectory(f.root), 'blocked archive\n');
    const result = f.run();
    assert.equal(result.status, 1, result.stderr);
    const retained = /Results were not archived; checkout retained at (.+)/u.exec(result.stderr)?.[1];
    assert.ok(retained, result.stderr);
    try {
        const summary = JSON.parse(readFileSync(join(retained, '.cache/checkpoint-summary.json')));
        assert.equal(summary.allPassed, true); // The passing evidence was not deleted.
        assert.equal(summary.commit, f.commit);
    } finally {
        f.git(f.root, 'worktree', 'remove', '--force', retained);
        rmSync(join(retained, '..'), { recursive: true });
    }
});

test('a local cache write failure cannot fail an archived checkpoint', (t) => {
    const f = fixture(t);
    writeFileSync(join(f.root, '.cache'), 'blocked local cache\n');
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /local cache refresh failed/u);
    assert.equal(readCheckpointResult(f.root, f.commit).allPassed, true);
});

test('bookkeeping commits reuse execution and preserve its measured SHA', (t) => {
    const f = fixture(t);
    assert.equal(f.run().status, 0); // Establish full execution evidence.
    const original = f.latest();
    writeFileSync(join(f.root, 'GOALS.json'), '{"goals":[]}');
    f.git(f.root, 'add', 'GOALS.json');
    f.git(f.root, 'commit', '-qm', 'bookkeeping only');
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /BOOKKEEPING_EXECUTION/u);
    assert.doesNotMatch(result.stdout, /FULL_EXECUTION/u);
    assert.equal(f.latest().commit, f.git(f.root, 'rev-parse', 'HEAD'));
    assert.equal(f.latest().executionCommit, original.commit);
    assert.equal(JSON.parse(readFileSync(join(f.latest().artifacts,
        'development-standing.json'))).score.sha, original.commit);
    const forced = f.run({}, ['--force']);
    assert.match(forced.stdout, /FULL_EXECUTION/u);
    assert.equal(f.latest().executionCommit, f.latest().commit);
});

test('changed non-bookkeeping inputs and environment require full execution', (t) => {
    const f = fixture(t);
    assert.equal(f.run().status, 0);
    writeFileSync(join(f.root, 'README.md'), 'new instructions\n');
    f.git(f.root, 'add', 'README.md');
    f.git(f.root, 'commit', '-qm', 'not bookkeeping');
    assert.match(f.run().stdout, /FULL_EXECUTION/u);
    // A changed environment is a different execution even for identical code.
    assert.match(f.run({ CHECKPOINT_ENV_TEST: 'different' }).stdout, /FULL_EXECUTION/u);
});

test('missing or corrupted artifacts require full execution', (t) => {
    const f = fixture(t);
    assert.equal(f.run().status, 0);
    rmSync(join(f.latest().artifacts, 'session-results.json'));
    assert.match(f.run().stdout, /FULL_EXECUTION/u);
    // Valid JSON is insufficient: it must match the archived artifact digest.
    writeFileSync(join(f.latest().artifacts, 'session-results.json'), '{}');
    assert.match(f.run().stdout, /FULL_EXECUTION/u);
});

test('invalid bookkeeping fails without erasing historical execution evidence', (t) => {
    const f = fixture(t);
    assert.equal(f.run().status, 0);
    const original = f.latest();
    writeFileSync(join(f.root, 'GOALS.json'), 'invalid');
    f.git(f.root, 'add', 'GOALS.json');
    f.git(f.root, 'commit', '-qm', 'invalid metadata');
    const result = f.run();
    assert.match(result.stdout, /BOOKKEEPING_EXECUTION/u);
    assert.equal(result.status, 1); // A reused pass cannot hide failed current checks.
    assert.equal(f.latest().allPassed, false);
    assert.equal(JSON.parse(readFileSync(join(original.artifacts, 'summary.json'))).allPassed, true);
    // A forced failure disables reuse even after the metadata is fixed.
    assert.equal(f.run({}, ['--force']).status, 1);
    writeFileSync(join(f.root, 'GOALS.json'), '{"goals":[]}');
    f.git(f.root, 'add', 'GOALS.json');
    f.git(f.root, 'commit', '-qm', 'repair metadata');
    assert.match(f.run().stdout, /FULL_EXECUTION/u);
});
