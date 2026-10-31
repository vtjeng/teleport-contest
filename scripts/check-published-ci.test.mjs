import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPublishedCI, publicationStatus, PUBLICATION_WORKFLOWS } from './check-published-ci.mjs';

// Two different commits and monotonically increasing IDs model publications and
// retries, with one run for each automatic publication workflow.
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
    : JSON.stringify({ workflow_runs: runs });

test('missing runs remain pending; all automatic workflows must succeed', () => {
    assert.equal(publicationStatus(commit, [], repository).passed, false);
    assert.equal(publicationStatus(commit, passing(commit).slice(1), repository).passed, false);
    assert.equal(publicationStatus(commit, passing(commit), repository).passed, true);
    for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped']) {
        const runs = passing(commit);
        runs[0].conclusion = conclusion;
        assert.equal(publicationStatus(commit, runs, repository).failed, true);
    }
});

test('only Lint runs automatically; manual reports do not gate publication', () => {
    assert.deepEqual(PUBLICATION_WORKFLOWS, ['lint.yml']
        .map(name => `.github/workflows/${name}`));
    for (const name of ['score.yml', 'coverage.yml']) {
        const workflow = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
        const triggers = workflow.split(/^on:\s*$/m)[1]?.split(/^jobs:\s*$/m)[0];
        assert.ok(triggers, `${name} has an explicit trigger section`);
        assert.match(triggers, /^  workflow_dispatch:\s*$/m);
        assert.doesNotMatch(triggers, /^  (?:push|pull_request|schedule):/m);
    }
    const manualReports = ['score.yml', 'coverage.yml'].map((name, index) => ({
        ...passing(commit)[0], id: 50 + index, path: `.github/workflows/${name}`,
        event: 'workflow_dispatch', conclusion: 'failure'
    }));
    assert.equal(publicationStatus(commit, [...passing(commit), ...manualReports], repository).passed, true);
    assert.equal(publicationStatus(commit, manualReports, repository).passed, false);
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
        assert.deepEqual(args.slice(0, -1), ['api'], 'pagination works without optional gh flags');
        assert.ok(args.at(-1).includes(`head_sha=${commit}`));
        const page = new URL(`https://api.github.com/${args.at(-1)}`).searchParams.get('page');
        return JSON.stringify({workflow_runs: page === '1'
            ? Array.from({length: 100}, (_, index) => ({...passing(commit)[0], id: index + 100}))
            : passing(commit).slice(1)});
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
        return JSON.stringify({ workflow_runs: passing(commit) });
    } }), /changed during/);
    assert.equal(readFileSync(file, 'utf8'), 'manual edit');
    writeFileSync(file, JSON.stringify({ commits: [] }));
    assert.throws(() => checkPublishedCI({ file, commit }, { gh: args => args[0] === 'repo' ? repository : '{}' }), /Invalid workflow/);
    assert.throws(() => checkPublishedCI({ file, commit: 'short' }), /full published/);
});

test('a malformed or failed later page preserves the full pending cache and releases its lock', t => {
    const file = fixture(t);
    const original = JSON.stringify({commits: [{commit, task: 'retained', runs: [23]}]});
    for (const failure of ['malformed', 'offline']) {
        writeFileSync(file, original);
        assert.throws(() => checkPublishedCI({file}, {gh: args => {
            if (args[0] === 'repo') return repository;
            if (args.at(-1).endsWith('page=1')) return JSON.stringify({workflow_runs:
                Array.from({length: 100}, (_, index) => ({...passing(commit)[0], id: index + 100}))});
            if (failure === 'offline') throw new Error('second page unavailable');
            return JSON.stringify({workflow_runs: null});
        }}), /Invalid workflow|second page unavailable/);
        assert.equal(readFileSync(file, 'utf8'), original);
        assert.equal(existsSync(`${file}.lock`), false);
    }
});

test('pagination is bounded and excessive page results are refused without cache changes', t => {
    const file = fixture(t);
    const original = JSON.stringify({commits: [{commit, runs: []}]});
    writeFileSync(file, original);
    for (const count of [100, 101]) {
        let requests = 0;
        assert.throws(() => checkPublishedCI({file}, {gh: args => {
            if (args[0] === 'repo') return repository;
            requests++;
            return JSON.stringify({workflow_runs: Array.from({length: count}, () => passing(commit)[0])});
        }}), /pagination limit|Invalid workflow/);
        assert.equal(requests, count === 100 ? 1000 : 1);
        assert.equal(readFileSync(file, 'utf8'), original);
        assert.equal(existsSync(`${file}.lock`), false);
    }
});
