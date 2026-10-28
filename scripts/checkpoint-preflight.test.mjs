import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkTestLayout } from './checkpoint-preflight.mjs';
import { strayTestFiles } from './test-suites.mjs';

const script = fileURLToPath(new URL('./checkpoint-preflight.mjs', import.meta.url));
test('committed layout guard matches discovery and ignores dirty fixes and untracked files', t => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-layout-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null',
        '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
    git('init', '-q');
    const put = path => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), ''); };
    const valid = ['scripts/good.test.mjs', 'diagnostics/check.mjs', '.cache/ignored.test.mjs',
        'node_modules/dep/ignored.test.mjs', 'nethack-c/ignored.test.mjs', 'sessions/ignored.test.mjs'];
    valid.forEach(put);
    symlinkSync('check.mjs', join(root, 'diagnostics/link.test.mjs'));
    git('add', ...valid, 'diagnostics/link.test.mjs'); git('commit', '-qm', 'valid layout');
    const good = git('rev-parse', 'HEAD');
    assert.deepEqual(checkTestLayout(root).stray, strayTestFiles(root));
    assert.equal(checkTestLayout(root).passed, true);
    const bad = 'diagnostics/reviews/space and\ttab/check.test.mjs';
    put(bad); git('add', bad); git('commit', '-qm', 'misplaced test');
    const candidate = git('rev-parse', 'HEAD');
    assert.deepEqual(checkTestLayout(root).stray, [bad]);
    assert.deepEqual(checkTestLayout(root).stray, strayTestFiles(root));
    rmSync(join(root, bad)); // A dirty correction cannot certify the committed candidate.
    put('untracked.test.mjs');
    const result = spawnSync(process.execPath, [script, '--commit', candidate], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout), { commit: candidate, passed: false, stray: [bad] });
    assert.equal(checkTestLayout(root, good).passed, true);
    assert.equal(spawnSync(process.execPath, [script, '--commit', good], { cwd: root }).status, 0);
    assert.equal(spawnSync(process.execPath, [script, '--commit', 'missing-ref'], { cwd: root }).status, 1);
    assert.equal(spawnSync(process.execPath, [script, '--unknown'], { cwd: root }).status, 1);
});
