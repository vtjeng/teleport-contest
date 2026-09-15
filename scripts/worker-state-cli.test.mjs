import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./worker-state.mjs', import.meta.url));

test('CLI events survive separate invocations and only the coordinator can write', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'worker-state-cli-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = (...args) => {
        const result = spawnSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr); // Disposable Git fixture setup.
        return result.stdout.trim();
    };
    git('init', '-q');
    git('config', 'user.name', 'State fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(root, 'tracked'), 'fixture\n');
    git('add', 'tracked'); git('commit', '-qm', 'fixture');
    const base = git('rev-parse', 'HEAD');
    const worker = join(root, 'worker');
    git('worktree', 'add', '-qb', 'worker/test', worker);
    const run = (args, cwd = root) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
    const succeed = (args) => {
        const result = run(args);
        assert.equal(result.status, 0, result.stderr);
        return JSON.parse(result.stdout);
    };
    succeed(['init', '--run', 'fixture-run']);
    const file = join(root, '.cache/worker-state.json');
    const event = { id: 'register-A', type: 'register', worker: 'A', worktree: worker,
        branch: 'worker/test', base, handle: 'fixture-handle' };
    succeed(['event', '--json', JSON.stringify(event)]);
    const before = readFileSync(file, 'utf8');
    succeed(['event', '--json', JSON.stringify(event)]);
    assert.equal(readFileSync(file, 'utf8'), before); // Retry keeps the original timestamp.
    const recovered = succeed(['status']);
    assert.equal(recovered.workers.A.handle, 'fixture-handle');
    assert.equal(run(['event', '--file', file, '--json', JSON.stringify(event)], worker).status, 1);
    assert.equal(run(['status', '--file', file], worker).status, 0); // Worker inspection remains read-only.
    assert.equal(run(['init', '--run', 'replacement']).status, 1);
    assert.equal(run(['event', '--json', 'null']).status, 1);
    assert.equal(run(['status', '--unknown', 'value']).status, 1);
    assert.equal(readFileSync(file, 'utf8'), before);
});
