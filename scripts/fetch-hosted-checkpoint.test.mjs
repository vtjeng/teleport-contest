import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyHostedRun } from './fetch-hosted-checkpoint.mjs';

test('fetch accepts only the successful workflow for this repository and candidate', () => {
    const repository = 'fixture/project';
    const commit = 'a'.repeat(40); // Fixed candidate, distinct from the stale revision below.
    const run = { status: 'completed', conclusion: 'success', head_sha: commit,
        repository: { full_name: repository }, head_repository: { full_name: repository },
        path: '.github/workflows/checkpoint-trial.yml', id: 123, run_attempt: 2 };
    assert.deepEqual(verifyHostedRun(run, repository, commit), {
        provider: 'github', repository, id: '123', attempt: '2',
    });
    for (const changed of [
        { status: 'in_progress' }, { conclusion: 'failure' }, { head_sha: 'b'.repeat(40) },
        { head_repository: { full_name: 'fork/project' } }, { path: 'another-workflow.yml' },
        { run_attempt: 0 }, // Attempts start at one.
    ]) assert.throws(() => verifyHostedRun({ ...run, ...changed }, repository, commit), /successful candidate/u);
});
