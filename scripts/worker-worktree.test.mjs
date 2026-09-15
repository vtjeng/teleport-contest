import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
    symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { prepareWorkerWorktree } from './worker-worktree.mjs';

const SCRIPT = fileURLToPath(new URL('./worker-worktree.mjs', import.meta.url));

function fixture(t) {
    const parent = mkdtempSync(join(tmpdir(), 'worker-worktree-test-'));
    t.after(() => rmSync(parent, { recursive: true, force: true }));
    const root = join(parent, 'origin');
    const upstream = join(parent, 'upstream');
    const git = (cwd, ...args) => {
        const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr); // All fixture Git operations must succeed.
        return result.stdout.trim();
    };
    for (const path of [root, upstream]) {
        mkdirSync(path);
        git(path, 'init', '-q');
        git(path, 'config', 'user.name', 'Worktree fixture');
        git(path, 'config', 'user.email', 'fixture@example.invalid');
        git(path, 'config', 'commit.gpgsign', 'false');
    }
    mkdirSync(join(upstream, 'src'));
    writeFileSync(join(upstream, 'src/monst.c'), '/* Source fixture, not a game implementation. */\n');
    git(upstream, 'add', 'src/monst.c'); git(upstream, 'commit', '-qm', 'C source fixture');
    git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'nethack-c/upstream');
    writeFileSync(join(root, '.gitignore'), '.cache/\nnethack-c/recorder/\n');
    git(root, 'add', '.gitignore', '.gitmodules', 'nethack-c/upstream');
    git(root, 'commit', '-qm', 'worktree fixture');
    const worktree = join(parent, 'worker');
    const branch = 'worker/test';
    git(root, 'worktree', 'add', '-qb', branch, worktree);
    const sourceInstall = join(parent, 'recorder-install');
    const data = join(sourceInstall, 'games/lib/nethackdir');
    mkdirSync(data, { recursive: true });
    // The injected smoke function below proves orchestration, not real C startup.
    writeFileSync(join(data, 'nethack'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(data, 'nhdat'), 'packed fixture data\n');
    writeFileSync(join(data, 'sysconf'), 'fixture configuration\n');
    const smoke = ({ installDir }) => {
        assert.ok(existsSync(join(installDir, 'nethack')));
        return { rngCalls: 199 }; // Same minimum initialization bound as smoke-recorder.
    };
    const options = { cwd: worktree, branch, sourceInstall, smoke };
    return { root, worktree, branch, sourceInstall, data, options, git };
}

test('a fresh worktree gets pinned C and a private recorder, then invokes smoke', (t) => {
    const f = fixture(t);
    assert.equal(existsSync(join(f.worktree, 'nethack-c/upstream/src/monst.c')), false);
    let called = false;
    const result = prepareWorkerWorktree({ ...f.options, smoke: (options) => {
        called = true;
        assert.ok(options.installDir.startsWith(f.worktree + '/'));
        return f.options.smoke(options);
    } });
    assert.equal(called, true);
    assert.equal(result.ready, true);
    assert.equal(result.branch, f.branch);
    assert.ok(existsSync(join(f.worktree, 'nethack-c/upstream/src/monst.c')));
    assert.equal(f.git(f.worktree, 'status', '--porcelain'), '');
    assert.equal(f.git(f.worktree, 'rev-parse', 'HEAD'), result.head);
    assert.notEqual(result.installDir, f.data); // The source installation is not shared.
});

test('branch and cwd mismatches fail before any source or recorder setup', (t) => {
    const f = fixture(t);
    assert.throws(() => prepareWorkerWorktree({ ...f.options, branch: 'wrong-branch' }), /branch/);
    assert.throws(() => prepareWorkerWorktree({ ...f.options, cwd: join(f.worktree, 'nethack-c') }), /worktree root/);
    assert.equal(existsSync(join(f.worktree, 'nethack-c/upstream/src/monst.c')), false);
    assert.equal(existsSync(join(f.worktree, 'nethack-c/recorder/install')), false);
});

test('missing install and failed smoke are errors, never readiness receipts', (t) => {
    const f = fixture(t);
    assert.throws(() => prepareWorkerWorktree({ ...f.options, sourceInstall: undefined }), /source-install|build-recorder/);
    assert.throws(() => prepareWorkerWorktree({ ...f.options, smoke: () => { throw new Error('startup failed'); } }), /startup failed/);
    assert.equal(existsSync(join(f.worktree, '.cache/worktree-ready.json')), false);
});

test('check is read-only for source/install setup, and an existing install is never overwritten', (t) => {
    const f = fixture(t);
    assert.throws(() => prepareWorkerWorktree({ ...f.options, prepare: false }), /C source/);
    const result = prepareWorkerWorktree(f.options);
    const sentinel = join(result.installDir, 'save/preserve');
    mkdirSync(dirname(sentinel), { recursive: true }); writeFileSync(sentinel, 'existing save');
    prepareWorkerWorktree({ ...f.options, sourceInstall: undefined, prepare: false });
    assert.equal(readFileSync(sentinel, 'utf8'), 'existing save');
    assert.throws(() => prepareWorkerWorktree({ ...f.options, sourceInstall: join(f.sourceInstall, 'missing') }), /already exists/);
});

test('symlinked recorder installations are rejected instead of sharing mutable state', (t) => {
    const f = fixture(t);
    const recorder = join(f.worktree, 'nethack-c/recorder');
    mkdirSync(recorder);
    symlinkSync(f.sourceInstall, join(recorder, 'install'));
    assert.throws(() => prepareWorkerWorktree({ ...f.options, sourceInstall: undefined }), /symlink|private/);
    assert.equal(readFileSync(join(f.data, 'sysconf'), 'utf8'), 'fixture configuration\n');
});

test('the CLI rejects unknown options and wrong branches rather than running smoke', (t) => {
    const f = fixture(t);
    for (const args of [['check', '--root', f.worktree], ['check', '--branch', 'wrong-branch']]) {
        const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: f.worktree, encoding: 'utf8' });
        assert.equal(result.status, 1, result.stdout); // Malformed requests must fail closed.
    }
});
