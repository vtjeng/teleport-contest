import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPublishedCI, publicationStatus, PUBLICATION_WORKFLOWS } from './check-published-ci.mjs';

// Two different commits and monotonically increasing IDs model publications and
// retries, with one run for each of the four current publication workflows.
const commit = 'a'.repeat(40), other = 'b'.repeat(40), repository = 'owner/project';
const passing = sha => PUBLICATION_WORKFLOWS.map((path, index) => ({ id: index + 1,
    path, head_sha: sha, event: 'push', head_branch: 'main', status: 'completed', conclusion: 'success',
    repository: { full_name: repository }, head_repository: { full_name: repository } }));
function fixture(t) {
    const directory = mkdtempSync(join(tmpdir(), 'published-ci-'));
    t.after(() => rmSync(directory, { force: true, recursive: true }));
    return join(directory, 'pending.json');
}
const client = runs => args => args[0] === 'repo' ? repository
    : JSON.stringify([{ workflow_runs: runs }]);

test('missing runs remain pending; only all four successful workflows complete a commit', () => {
    assert.equal(publicationStatus(commit, [], repository).passed, false);
    assert.equal(publicationStatus(commit, passing(commit).slice(1), repository).passed, false);
    assert.equal(publicationStatus(commit, passing(commit), repository).passed, true);
    for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped']) {
        const runs = passing(commit);
        runs[0].conclusion = conclusion;
        assert.equal(publicationStatus(commit, runs, repository).failed, true);
    }
});

test('newest run wins per workflow, while manual and checkpoint-branch runs do not count', () => {
    const runs = passing(commit);
    const retry = { ...runs[0], id: 10, status: 'in_progress', conclusion: null };
    assert.equal(publicationStatus(commit, [...runs, retry], repository).passed, false);
    assert.equal(publicationStatus(commit, [...runs, { ...retry, event: 'workflow_dispatch' }], repository).passed, true);
    assert.equal(publicationStatus(commit, runs.map(run => ({ ...run, head_branch: 'integration-checkpoint/test' })), repository).passed, false);
    assert.throws(() => publicationStatus(commit, passing(other), repository), /does not identify/);
    assert.throws(() => publicationStatus(commit, runs, 'wrong/repository'), /does not identify/);
});

test('registers, discovers paginated runs, retains failures and removes successful commits', t => {
    const file = fixture(t);
    const first = checkPublishedCI({ file, commit, task: 'task-a' }, { gh: client([]) });
    assert.equal(first.pending[0].workflows[0].status, 'missing');
    const runs = passing(commit);
    runs[0].conclusion = 'failure';
    assert.equal(checkPublishedCI({ file }, { gh: client(runs) }).failed, true);
    const final = checkPublishedCI({ file }, { gh: args => {
        if (args[0] === 'repo') return repository;
        assert.ok(args.includes('--paginate'));
        assert.ok(args.at(-1).includes(`head_sha=${commit}`));
        return JSON.stringify([{ workflow_runs: passing(commit).slice(0, 2) },
            { workflow_runs: passing(commit).slice(2) }]);
    } });
    assert.deepEqual(final.completed, [commit]);
    assert.deepEqual(JSON.parse(readFileSync(file)).commits, []);
});

test('API failures preserve cache bytes, release locks, and allow retry', t => {
    const file = fixture(t);
    const original = JSON.stringify({ commits: [{ commit, task: 'task-a', runs: [] }] });
    writeFileSync(file, original);
    assert.throws(() => checkPublishedCI({ file }, { gh: () => { throw new Error('offline'); } }), /offline/);
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.equal(existsSync(`${file}.lock`), false);
    assert.equal(checkPublishedCI({ file }, { gh: client(passing(commit)) }).completed.length, 1);
});

test('rejects concurrent changes, competing checkers and malformed API responses', t => {
    const file = fixture(t);
    writeFileSync(file, JSON.stringify({ commits: [{ commit, runs: [] }] }));
    assert.throws(() => checkPublishedCI({ file }, { gh: args => {
        if (args[0] === 'repo') {
            assert.throws(() => checkPublishedCI({ file }, { gh: client([]) }), /EEXIST/);
            return repository;
        }
        writeFileSync(file, 'manual edit');
        return JSON.stringify([{ workflow_runs: passing(commit) }]);
    } }), /changed during/);
    assert.equal(readFileSync(file, 'utf8'), 'manual edit');
    writeFileSync(file, JSON.stringify({ commits: [] }));
    assert.throws(() => checkPublishedCI({ file, commit }, { gh: args => args[0] === 'repo' ? repository : '{}' }), /Invalid workflow/);
    assert.throws(() => checkPublishedCI({ file, commit: 'short' }), /full published/);
});
