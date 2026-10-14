import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {integrateTaskCommits} from './integration-commits.mjs';
import {deliveryGit} from './worker-delivery.mjs';
import {digest} from './challenge-results.mjs';

function fixture(t) {
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
    const submit = () => {
        const source = deliveryGit(root, base, 'HEAD'), packet = JSON.stringify({git: source});
        mkdirSync(join(root, '.cache'));
        const evidence = join(root, '.cache', `${digest(packet)}.json`);
        writeFileSync(evidence, packet);
        const state = {tasks: {task: {deliveries: [source.head]}}, deliveries: {
            [source.head]: {delivery: source.head, base, commits: source.commits, evidence},
        }};
        return {source, state};
    };
    return {root, git, base, submit};
}

test('integration preserves an initially empty submitted metadata commit between source changes', t => {
    const {root, git, base, submit} = fixture(t);
    git('switch', '-qc', 'worker');
    writeFileSync(join(root, 'source.txt'), 'implementation\n');
    git('add', 'source.txt'); git('commit', '-qm', 'Source implementation');
    git('commit', '--allow-empty', '-qm', 'Saved metadata correction');
    writeFileSync(join(root, 'source.txt'), 'corrected implementation\n');
    git('add', 'source.txt'); git('commit', '-qm', 'Source correction');
    const {source, state} = submit();
    git('switch', '-q', 'main');
    assert.deepEqual(integrateTaskCommits(root, state, 'task'), source.commits);
    assert.equal(readFileSync(join(root, 'source.txt'), 'utf8'), 'corrected implementation\n');
    assert.deepEqual(git('log', '--reverse', '--format=%s', `${base}..HEAD`).split('\n'),
        ['Source implementation', 'Saved metadata correction', 'Source correction']);
    assert.deepEqual(integrateTaskCommits(root, state, 'task'), [], 'retry does not duplicate submitted commits');
});

test('retry recognizes a manually resolved report add only when every changed file matches the submission', async t => {
    for (const partial of [false, true]) await t.test(partial ? 'source differs' : 'all changed files match', t => {
        const {root, git, submit} = fixture(t);
        git('switch', '-qc', 'worker');
        // The source edit keeps the proof from relying only on the report blob.
        writeFileSync(join(root, 'source.txt'), 'implementation\n');
        writeFileSync(join(root, 'report.json'), '{"diagnosis":"submitted"}\n');
        git('add', 'source.txt', 'report.json'); git('commit', '-qm', 'Submitted source and diagnosis');
        const {source, state} = submit();
        git('switch', '-q', 'main');
        writeFileSync(join(root, 'report.json'), '{"diagnosis":"earlier"}\n');
        git('add', 'report.json'); git('commit', '-qm', 'Preserve earlier diagnosis');
        assert.throws(() => git('cherry-pick', source.head), /could not apply/);
        // Selecting the exact submitted report resolves add/add as a modification.
        writeFileSync(join(root, 'report.json'), '{"diagnosis":"submitted"}\n');
        git('add', 'report.json'); git('cherry-pick', '--continue');
        assert.ok(git('cherry', 'HEAD', source.head, source.base).startsWith('+'),
            'the resolved modification has a different patch identity from the original add');
        if (partial) {
            writeFileSync(join(root, 'source.txt'), 'different implementation\n');
            git('add', 'source.txt'); git('commit', '-qm', 'Source no longer matches the submission');
            assert.throws(() => integrateTaskCommits(root, state, 'task'), /could not apply/);
            assert.equal(git('rev-parse', 'CHERRY_PICK_HEAD'), source.head, 'a partial match does not silently skip the source patch');
        } else {
            const before = git('rev-parse', 'HEAD');
            assert.deepEqual(integrateTaskCommits(root, state, 'task'), []);
            assert.equal(git('rev-parse', 'HEAD'), before, 'a proven complete snapshot adds no duplicate commit');
            assert.deepEqual(integrateTaskCommits(root, state, 'task'), [], 'repeated retry remains idempotent');
        }
    });
});
