import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { BOOKKEEPING_FILES, executionTree } from './checkpoint-reuse.mjs';

test('only the four regular bookkeeping files are excluded from execution inputs', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-inputs-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null',
        '-c', 'user.name=Reuse fixture', '-c', 'user.email=reuse@example.invalid',
        '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' }).trim();
    const commitFile = (name, content) => {
        mkdirSync(dirname(join(root, name)), { recursive: true });
        writeFileSync(join(root, name), content);
        git('add', name);
        git('commit', '-qm', 'change fixture input');
        return executionTree(root, 'HEAD');
    };
    git('init', '-q');
    const original = commitFile('tracked.txt', 'fixed input');
    for (const name of BOOKKEEPING_FILES) {
        assert.equal(commitFile(name, 'initial metadata'), original, name);
        assert.equal(commitFile(name, 'changed metadata'), original, name);
    }
    // Every other category invalidates reuse, including similarly named files
    // below a subdirectory. The development session here is synthetic.
    let before = original;
    for (const name of ['js/game.js', 'scripts/check.test.mjs', 'package-lock.json',
        'README.md', 'score-baseline.json', 'recordings/fixture.session.json',
        'sessions/development.session.json', 'nested/GOALS.json']) {
        const after = commitFile(name, 'new execution input');
        assert.notEqual(after, before, name);
        before = after;
    }
    // A metadata symlink can redirect validation outside the four-file class.
    rmSync(join(root, 'GOALS.json'));
    symlinkSync('tracked.txt', join(root, 'GOALS.json'));
    git('add', 'GOALS.json');
    git('commit', '-qm', 'metadata symlink');
    assert.throws(() => executionTree(root, 'HEAD'), /regular file/u);
});
