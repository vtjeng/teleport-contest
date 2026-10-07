import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveHostedCheckpoint, verifyHostedRun } from './fetch-hosted-checkpoint.mjs';
import { readCheckpointResult } from './checkpoint-results.mjs';

test('fetch accepts only the successful workflow for this repository and candidate', () => {
    const repository = 'fixture/project';
    const commit = 'a'.repeat(40); // Fixed candidate, distinct from the stale revision below.
    const run = { status: 'completed', conclusion: 'success', head_sha: commit,
        repository: { full_name: repository }, head_repository: { full_name: repository },
        path: '.github/workflows/checkpoint-trial.yml', id: 123, run_attempt: 2 };
    assert.deepEqual(verifyHostedRun(run, repository, commit), {
        provider: 'github', repository, id: '123', attempt: '2',
    });
    // GitHub documents a ref suffix, although the exercised run omitted it.
    assert.deepEqual(verifyHostedRun({ ...run,
        path: `${run.path}@integration-checkpoint/candidate` }, repository, commit),
    verifyHostedRun(run, repository, commit));
    for (const changed of [
        { status: 'in_progress' }, { conclusion: 'failure' }, { head_sha: 'b'.repeat(40) },
        { head_repository: { full_name: 'fork/project' } }, { path: 'another-workflow.yml' },
        { path: `${run.path}@` }, { path: 'another-workflow.yml@main' },
        { run_attempt: 0 }, // Attempts start at one.
    ]) assert.throws(() => verifyHostedRun({ ...run, ...changed }, repository, commit), /successful candidate/u);
});

test('hosted evidence reaches the existing closure archive without losing remote provenance', t => {
    const root = mkdtempSync(join(tmpdir(), 'hosted-checkpoint-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '--quiet', root]);
    const output = join(root, 'download');
    mkdirSync(join(output, 'synthetic'), { recursive: true });
    // Distinct content identifies each copied artifact; CI owns their validation.
    for (const name of ['development-standing.json', 'session-results.json', 'scan-cache.json'])
        writeFileSync(join(output, name), JSON.stringify({ artifact: name }));
    writeFileSync(join(output, 'synthetic', 'ci-v1.json'), '{}');
    const commit = 'a'.repeat(40);
    const summary = { commit, executionCommit: commit, allPassed: true,
        hostedRun: { provider: 'github', id: '123', attempt: '2' } };
    const path = archiveHostedCheckpoint(root, output, summary);
    const saved = readCheckpointResult(root, commit);
    assert.deepEqual(saved.hostedRun, summary.hostedRun);
    assert.equal(saved.executionCommit, commit);
    assert.equal(saved.allPassed, true);
    assert.deepEqual(JSON.parse(readFileSync(path)), saved);
    assert.equal(readFileSync(join(saved.artifacts, 'synthetic', 'ci-v1.json'), 'utf8'), '{}');
    assert.equal(readFileSync(join(root, '.cache', 'scan-cache.json'), 'utf8'),
        readFileSync(join(output, 'scan-cache.json'), 'utf8'));
});
