import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {integrateTaskCommits} from './integration-commits.mjs';
import {deliveryGit} from './worker-delivery.mjs';
import {digest} from './challenge-results.mjs';

test('integration preserves an initially empty submitted metadata commit between source changes', t => {
    const root = mkdtempSync(join(tmpdir(), 'integration-empty-metadata-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args],
        {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    git('init', '-qb', 'main');
    git('config', 'user.name', 'Empty metadata fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    // Distinct before/after text exposes any missing or repeated source patch.
    writeFileSync(join(root, 'source.txt'), 'baseline\n');
    git('add', 'source.txt'); git('commit', '-qm', 'Baseline');
    const base = git('rev-parse', 'HEAD');
    git('switch', '-qc', 'worker');
    writeFileSync(join(root, 'source.txt'), 'implementation\n');
    git('add', 'source.txt'); git('commit', '-qm', 'Source implementation');
    git('commit', '--allow-empty', '-qm', 'Saved metadata correction');
    writeFileSync(join(root, 'source.txt'), 'corrected implementation\n');
    git('add', 'source.txt'); git('commit', '-qm', 'Source correction');
    const source = deliveryGit(root, base, 'HEAD');
    const packet = JSON.stringify({git: source});
    mkdirSync(join(root, '.cache'));
    const evidence = join(root, '.cache', `${digest(packet)}.json`);
    writeFileSync(evidence, packet);
    const state = {tasks: {task: {deliveries: [source.head]}}, deliveries: {
        [source.head]: {delivery: source.head, base, commits: source.commits, evidence},
    }};
    git('switch', '-q', 'main');
    assert.deepEqual(integrateTaskCommits(root, state, 'task'), source.commits);
    assert.equal(readFileSync(join(root, 'source.txt'), 'utf8'), 'corrected implementation\n');
    assert.deepEqual(git('log', '--reverse', '--format=%s', `${base}..HEAD`).split('\n'),
        ['Source implementation', 'Saved metadata correction', 'Source correction']);
    assert.deepEqual(integrateTaskCommits(root, state, 'task'), [], 'retry does not duplicate submitted commits');
});
