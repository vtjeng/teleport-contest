// Run the real checkpoint CLI and Git in disposable repositories. Only the
// expensive checks are replaced; they mutate the checkout while reporting PASS.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-cli-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'scripts'));
    // These modules are loaded by the CLI; the fixture has no game or sessions.
    for (const name of ['checkpoint-checks.mjs', 'score-baseline.mjs',
        'scoring-workspace.mjs', 'local-tmpdir.mjs']) {
        copyFileSync(new URL(name, import.meta.url), join(root, 'scripts', name));
    }
    writeFileSync(join(root, '.gitignore'), '.cache/\n');
    writeFileSync(join(root, 'tracked.txt'), 'starting input\n');
    const guard = join(root, 'checks.cjs');
    writeFileSync(guard, `
const fs = require('node:fs');
const cp = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const originalSpawn = cp.spawnSync;
let gitCalls = 0;
let changed = false;
cp.spawnSync = function(command, args, options) {
    if (command === 'git') {
        gitCalls++;
        if (String(gitCalls) === process.env.CHECKPOINT_FIXTURE_GIT_FAILURE)
            return { status: 128, stdout: '', stderr: 'fixture Git failure' };
        if (String(gitCalls) === process.env.CHECKPOINT_FIXTURE_GIT_ERROR)
            return { status: null, error: new Error('fixture Git launch failure') };
        return originalSpawn(command, args, options);
    }
    fs.appendFileSync('.cache/checks-run', command + '\\n');
    if (!changed) {
        changed = true;
        const git = (...args) => {
            const result = originalSpawn('git', args, { encoding: 'utf8' });
            if (result.status !== 0) throw new Error(result.stderr);
        };
        switch (process.env.CHECKPOINT_FIXTURE_CHANGE) {
        case 'unstaged':
            fs.writeFileSync('tracked.txt', 'changed during validation\\n');
            break;
        case 'staged':
            fs.writeFileSync('tracked.txt', 'staged during validation\\n');
            git('add', 'tracked.txt');
            break;
        case 'untracked':
            fs.writeFileSync('new-input.txt', 'new input during validation\\n');
            break;
        case 'commit':
            git('commit', '--allow-empty', '-qm', 'concurrent commit');
            break;
        case 'submodule':
            fs.writeFileSync('submodule/input.txt', 'dirty source checkout\\n');
            break;
        }
    }
    // Empty output is enough for each summary parser; nonzero status still
    // exercises the CLI's normal failed-check path without running game tests.
    return { status: process.env.CHECKPOINT_FIXTURE_CHECK_FAILURE ? 1 : 0,
        stdout: '', stderr: '' };
};
syncBuiltinESMExports();
`);
    const git = (...args) => {
        const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr); // Fixture setup must succeed.
        return result.stdout.trim();
    };
    git('init', '-q');
    git('config', 'user.name', 'Checkpoint fixture');
    git('config', 'user.email', 'checkpoint@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    git('add', '.gitignore', 'tracked.txt', 'checks.cjs', 'scripts');
    git('commit', '-qm', 'fixture');
    const commit = git('rev-parse', 'HEAD');
    mkdirSync(join(root, '.cache'));
    const summaryPath = join(root, '.cache/checkpoint-summary.json');
    // A failed new attempt must not leave this earlier passing summary usable.
    writeFileSync(summaryPath, JSON.stringify({ commit, allPassed: true,
        tests: { passed: true }, recordings: { passed: true }, stale: true }));
    return {
        root, git, commit, summaryPath,
        run: (env = {}, cwd = root) => spawnSync(process.execPath,
            ['--require', guard, join(root, 'scripts/checkpoint-checks.mjs')],
            { cwd, encoding: 'utf8', env: { ...process.env, ...env } }),
    };
}

test('checkpoint attributes a clean run to its starting commit', (t) => {
    const f = fixture(t);
    const result = f.run();
    assert.equal(result.status, 0, result.stderr); // All fixture checks pass.
    const summary = JSON.parse(readFileSync(f.summaryPath, 'utf8'));
    assert.equal(summary.commit, f.commit);
    assert.equal(summary.allPassed, true);
    assert.equal(summary.tests.passed, true);
    assert.equal(summary.recordings.passed, true);
    assert.equal(summary.stale, undefined); // The old result was replaced.
    assert.equal(f.git('status', '--porcelain'), '');
});

// A commit can leave a clean tree while changing HEAD. The other cases keep
// HEAD fixed while changing each category that Git status must catch.
for (const change of ['commit', 'unstaged', 'staged', 'untracked']) {
    test(`checkpoint rejects changes during validation: ${change}`, (t) => {
        const f = fixture(t);
        const result = f.run({ CHECKPOINT_FIXTURE_CHANGE: change });
        assert.equal(result.status, 1, result.stderr); // Invalid attribution fails the CLI.
        assert.match(result.stderr, /changed during checkpoint|working tree is not clean/u);
        assert.equal(existsSync(f.summaryPath), false); // No stale or new pass survives.
        assert.equal(existsSync(join(f.root, '.cache/checks-run')), true);
        if (change === 'commit') {
            assert.notEqual(f.git('rev-parse', 'HEAD'), f.commit);
            assert.equal(f.git('status', '--porcelain'), '');
        }
    });
}

test('checkpoint detects untracked inputs even when Git config hides them', (t) => {
    const f = fixture(t);
    f.git('config', 'status.showUntrackedFiles', 'no');
    const result = f.run({ CHECKPOINT_FIXTURE_CHANGE: 'untracked' });
    assert.equal(result.status, 1, result.stderr); // Config must not weaken the check.
    assert.match(result.stderr, /working tree is not clean/u);
    assert.equal(existsSync(f.summaryPath), false);
});

test('checkpoint detects a dirty submodule even when Git config hides it', (t) => {
    const f = fixture(t);
    // A tiny local gitlink stands in for the C checkout; no C or session data
    // is needed to test Git's dirty-submodule reporting.
    mkdirSync(join(f.root, 'submodule'));
    f.git('-C', 'submodule', 'init', '-q');
    writeFileSync(join(f.root, 'submodule/input.txt'), 'source input\n');
    f.git('-C', 'submodule', 'add', 'input.txt');
    f.git('-C', 'submodule', '-c', 'user.name=Checkpoint fixture',
        '-c', 'user.email=checkpoint@example.invalid', '-c', 'commit.gpgsign=false',
        'commit', '-qm', 'source fixture');
    writeFileSync(join(f.root, '.gitmodules'),
        '[submodule "source"]\n\tpath = submodule\n\turl = ./submodule\n');
    f.git('add', '.gitmodules', 'submodule');
    f.git('commit', '-qm', 'source gitlink');
    f.git('config', 'submodule.source.ignore', 'all');
    const result = f.run({ CHECKPOINT_FIXTURE_CHANGE: 'submodule' });
    assert.equal(result.status, 1, result.stderr); // A dirty C checkout invalidates attribution.
    assert.match(result.stderr, /working tree is not clean/u);
    assert.equal(existsSync(f.summaryPath), false);
});

test('checkpoint checks its own worktree when invoked from another repository', (t) => {
    const f = fixture(t);
    const other = fixture(t);
    // A different HEAD distinguishes an accidental inspection of the caller's
    // repository from validation of the worktree that contains the script.
    other.git('commit', '--allow-empty', '-qm', 'unrelated caller');
    const result = f.run({}, other.root);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(readFileSync(f.summaryPath, 'utf8'));
    assert.equal(summary.commit, f.commit);
    assert.notEqual(summary.commit, other.git('rev-parse', 'HEAD'));
    assert.equal(existsSync(join(f.root, '.cache/checks-run')), true);
    assert.equal(existsSync(join(other.root, '.cache/checks-run')), false);
    assert.equal(JSON.parse(readFileSync(other.summaryPath, 'utf8')).stale, true);
});

test('a dirty starting tree fails before any check and invalidates the old summary', (t) => {
    const f = fixture(t);
    writeFileSync(join(f.root, 'tracked.txt'), 'dirty before validation\n');
    const result = f.run();
    assert.equal(result.status, 1, result.stderr); // Precondition failure.
    assert.match(result.stderr, /working tree is not clean/u);
    assert.equal(existsSync(join(f.root, '.cache/checks-run')), false);
    assert.equal(existsSync(f.summaryPath), false);
});

// Two Git reads at each boundary: HEAD and status before checks, then status
// and HEAD after checks. Every failure must be checked, including launch errors.
for (const failureKind of ['FAILURE', 'ERROR']) {
    for (const call of [1, 2, 3, 4]) {
        test(`checkpoint rejects Git ${failureKind.toLowerCase()} at boundary call ${call}`, (t) => {
            const f = fixture(t);
            const result = f.run({ [`CHECKPOINT_FIXTURE_GIT_${failureKind}`]: String(call) });
            assert.equal(result.status, 1, result.stderr); // Fail closed on unreadable Git state.
            assert.match(result.stderr, /fixture Git (?:launch )?failure/u);
            assert.equal(existsSync(f.summaryPath), false);
            assert.equal(existsSync(join(f.root, '.cache/checks-run')), call > 2);
        });
    }
}

test('ordinary check failures retain an attributed failing summary', (t) => {
    const f = fixture(t);
    const result = f.run({ CHECKPOINT_FIXTURE_CHECK_FAILURE: 'yes' });
    assert.equal(result.status, 1, result.stderr); // Check failure, not attribution failure.
    const summary = JSON.parse(readFileSync(f.summaryPath, 'utf8'));
    assert.equal(summary.commit, f.commit);
    assert.equal(summary.allPassed, false);
    assert.equal(summary.tests.passed, false);
    assert.equal(summary.recordings.passed, false);
});
