import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {verifyComparisonWorkspace} from './prep-comparison.mjs';
import {digest} from './challenge-results.mjs';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'prep-comparison-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {cwd: root, encoding: 'utf8'}).trim();
    git('init', '-qb', 'main'); git('config', 'user.name', 'Comparison fixture');
    git('config', 'user.email', 'fixture@example.invalid'); git('config', 'commit.gpgsign', 'false');
    mkdirSync(join(root, 'js')); mkdirSync(join(root, 'frozen'));
    writeFileSync(join(root, 'package.json'), '{"type":"module"}\n');
    // A deliberately empty game output makes the comparator report the one
    // recorded C screen as missing, without invoking game logic or C recording.
    writeFileSync(join(root, 'js/jsmain.js'), 'export async function runSegment() { return {}; }\n');
    for (const name of ['isaac64.js', 'terminal.js', 'storage.js']) {
        writeFileSync(join(root, 'js', name), 'export const origin = "contestant";\n');
        writeFileSync(join(root, 'frozen', name), 'export const origin = "official";\n');
    }
    git('add', 'js', 'frozen', 'package.json'); git('commit', '-qm', 'Comparison inputs');
    const commit = git('rev-parse', 'HEAD'), workspace = join(root, '.cache/score');
    mkdirSync(workspace, {recursive: true});
    for (const path of ['js', 'frozen', 'package.json']) cpSync(join(root, path), join(workspace, path), {recursive: true});
    for (const name of ['isaac64.js', 'terminal.js', 'storage.js'])
        cpSync(join(root, 'frozen', name), join(workspace, 'js', name));
    return {root, workspace, commit};
}

test('comparison provenance checks actual workspace bytes, official overlays and extra files', t => {
    const f = fixture(t);
    assert.equal(verifyComparisonWorkspace(f.root, f.workspace, f.commit), f.commit);
    const gamePath = join(f.workspace, 'js/jsmain.js'), original = readFileSync(gamePath);
    writeFileSync(gamePath, '// Unaccepted game edit.\n');
    assert.throws(() => verifyComparisonWorkspace(f.root, f.workspace, f.commit), /workspace differs/u);
    writeFileSync(gamePath, original);
    const extra = join(f.workspace, 'js/extra.js'); writeFileSync(extra, '// Uncommitted input.\n');
    assert.throws(() => verifyComparisonWorkspace(f.root, f.workspace, f.commit), /workspace files differ/u);
    rmSync(extra); // Only the disposable fixture file just created above.
    const link = join(f.workspace, 'js/link.js'); symlinkSync(gamePath, link);
    assert.throws(() => verifyComparisonWorkspace(f.root, f.workspace, f.commit), /regular files/u);
});

test('the existing comparison worker emits recording and commit provenance without a second replay', t => {
    const f = fixture(t), recording = join(f.root, '.cache/case.session.json');
    // One arbitrary startup boundary is sufficient to exercise the real CLI.
    const bytes = JSON.stringify({version: 5, segments: [{seed: 42, datetime: '20000101120000',
        nethackrc: '', moves: '', steps: [{key: '', screen: 'C screen', cursor: [0, 0, 1], rng: []}]}]});
    writeFileSync(recording, bytes);
    const script = fileURLToPath(new URL('./diff-fresh-worker.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [script, recording, f.workspace, f.commit], {cwd: f.root, encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout.split('__FRESH_DIFF_RESULT__\n')[1]);
    assert.equal(result.passed, false); assert.ok(result.screenMismatch);
    assert.deepEqual(result.provenance, {commit: f.commit, recordingSha256: digest(bytes)});
    writeFileSync(join(f.workspace, 'js/jsmain.js'), '// Changed after the snapshot.\n');
    const bad = spawnSync(process.execPath, [script, recording, f.workspace, f.commit], {cwd: f.root, encoding: 'utf8'});
    assert.equal(bad.status, 2, 'input-verification failure is not a game mismatch');
    assert.doesNotMatch(bad.stdout, /__FRESH_DIFF_RESULT__/u);
});
