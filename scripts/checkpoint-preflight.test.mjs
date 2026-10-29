import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkTestLayout, checkCheckpointInputs } from './checkpoint-preflight.mjs';
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
    assert.equal(JSON.parse(result.stdout).passed, false);
    assert.deepEqual(JSON.parse(result.stdout).stray, [bad]);
    assert.equal(checkTestLayout(root, good).passed, true);
    assert.equal(spawnSync(process.execPath, [script, '--commit', good], { cwd: root }).status, 0);
    assert.equal(spawnSync(process.execPath, [script, '--commit', 'missing-ref'], { cwd: root }).status, 1);
    assert.equal(spawnSync(process.execPath, [script, '--unknown'], { cwd: root }).status, 1);
});

test('changed register uses existing schema and committed bytes; dashboard changes select focused tests', t => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-inputs-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null',
        '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
    const put = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
    const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
    git('init', '-q');
    const manifest = { version: 1, repository: 'vtjeng/teleport-contest',
        baseline: { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' },
        trial: { status: 'not-started', plannedHours: 1 }, operations: { waitingHandoffs: [] } };
    const valid = JSON.stringify({ version: 1, repairs: [{ id: 'map', title: 'Quoted "map"', candidates: [] }] });
    put('trial-monitor/manifest.json', JSON.stringify(manifest));
    put('trial-monitor/repairs.json', valid);
    const base = commit();
    assert.equal(checkCheckpointInputs(root, base).register.checked, true);
    assert.equal(checkCheckpointInputs(root, base).passed, true);
    for (const bad of ['{"version":1,"repairs":[{"title":"bad "quote""}]}',
        JSON.stringify({ version: 1, repairs: [{ id: 'map', candidates: [{ sha: 'bad', runs: [] }] }] }),
        JSON.stringify({ version: 2, repairs: [] })]) {
        put('trial-monitor/repairs.json', bad); const sha = commit();
        put('trial-monitor/repairs.json', valid); // dirty repair must not conceal committed failure
        assert.equal(checkCheckpointInputs(root, sha, base).passed, false);
        assert.equal(checkCheckpointInputs(root, sha, base).register.errors.length, 1);
    }
    put('trial-monitor/repairs.json', valid); commit();
    put('scripts/dashboard.template.html', '<h1>shared batch</h1>'); const dashboard = commit();
    const result = checkCheckpointInputs(root, dashboard, base);
    assert.equal(result.passed, true);
    assert.deepEqual(result.focusedTests, ['scripts/dashboard-data.test.mjs', 'scripts/trial-monitor.test.mjs']);
    put('js/unrelated.js', '// change'); const unrelated = commit();
    assert.deepEqual(checkCheckpointInputs(root, unrelated, dashboard).focusedTests, []);
    // A full batch base retains earlier dashboard changes rather than just HEAD^.
    assert.equal(checkCheckpointInputs(root, unrelated, base).focusedTests.length, 2);
    git('rm', 'trial-monitor/repairs.json'); const deleted = commit();
    assert.equal(checkCheckpointInputs(root, deleted, base).passed, false);
});
