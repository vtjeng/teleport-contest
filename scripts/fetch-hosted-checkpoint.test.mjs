import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveHostedCheckpoint, fetchHostedCheckpoint, requireReportOnlyImportTree, verifyHostedRun } from './fetch-hosted-checkpoint.mjs';
import { readCheckpointResult } from './checkpoint-results.mjs';

test('hosted import tolerates closure reports but rejects uncommitted execution inputs', t => {
    const root = mkdtempSync(join(tmpdir(), 'hosted-import-tree-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '--quiet', root]);
    for (const directory of ['challenges/evaluations', 'investigations/synthetic/v1', 'js'])
        mkdirSync(join(root, directory), { recursive: true });
    // These records are deliberately not validated by import: publication owns that check.
    for (const path of ['GOALS.json', 'QUALITY.json', 'challenges/evaluations/accepted.json',
        'investigations/synthetic/v1/scout.json']) writeFileSync(join(root, path), '{}');
    assert.doesNotThrow(() => requireReportOnlyImportTree(root));
    // A report-like suffix cannot hide an execution input or an unknown report.
    for (const path of ['js/engine.js', 'package.json', 'unknown.json']) {
        writeFileSync(join(root, path), '{}');
        assert.throws(() => requireReportOnlyImportTree(root), /outside regular reports/);
        rmSync(join(root, path));
    }
    // A report path must remain non-executable and cannot redirect to another file.
    const report = join(root, 'QUALITY.json');
    chmodSync(report, 0o755);
    assert.throws(() => requireReportOnlyImportTree(root), /outside regular reports/);
    rmSync(report);
    symlinkSync('GOALS.json', report);
    assert.throws(() => requireReportOnlyImportTree(root), /outside regular reports/);
    rmSync(report);
    // Staging a report is allowed; deleting it is not a closure update.
    execFileSync('git', ['-C', root, 'add', 'GOALS.json']);
    assert.doesNotThrow(() => requireReportOnlyImportTree(root));
    rmSync(join(root, 'GOALS.json'));
    assert.throws(() => requireReportOnlyImportTree(root), /outside regular reports/);
});

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

test('fetch imports the exact candidate with dirty closure reports and rechecks changes after download', t => {
    const root = mkdtempSync(join(tmpdir(), 'hosted-fetch-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = args => execFileSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null', ...args],
        { encoding: 'utf8' }).trim();
    git(['init', '--quiet']);
    writeFileSync(join(root, '.gitignore'), '.cache/\n');
    git(['add', '.gitignore']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Candidate']);
    const commit = git(['rev-parse', 'HEAD']);
    writeFileSync(join(root, 'GOALS.json'), '{}'); // Uncommitted closure, not CI input.
    const repository = 'fixture/project';
    // A fixed successful run/attempt provides the downloaded evidence identity.
    const run = { status: 'completed', conclusion: 'success', head_sha: commit,
        repository: { full_name: repository }, head_repository: { full_name: repository },
        path: '.github/workflows/checkpoint-trial.yml', id: 123, run_attempt: 1 };
    let changeDuringDownload = false;
    const runGh = (args, cwd) => {
        assert.equal(cwd, root);
        if (args[0] === 'repo') return repository;
        if (args[0] === 'api') return JSON.stringify(run);
        assert.deepEqual(args.slice(0, 2), ['run', 'download']);
        const output = args[args.indexOf('--dir') + 1];
        mkdirSync(output, { recursive: true });
        if (args.includes('parallel-checkpoint')) {
            writeFileSync(join(output, 'summary.json'), JSON.stringify({ commit,
                executionCommit: commit, allPassed: true,
                hostedRun: verifyHostedRun(run, repository, commit) }));
            for (const name of ['development-standing.json', 'session-results.json', 'scan-cache.json'])
                writeFileSync(join(output, name), '{}');
        } else if (changeDuringDownload) writeFileSync(join(root, 'package.json'), '{}');
        return '';
    };
    const saved = fetchHostedCheckpoint('123', { root, runGh });
    assert.equal(JSON.parse(readFileSync(saved)).commit, commit);
    assert.equal(readFileSync(join(root, 'GOALS.json'), 'utf8'), '{}');
    changeDuringDownload = true;
    assert.throws(() => fetchHostedCheckpoint('123', { root, runGh }), /outside regular reports/);
    assert.equal(readCheckpointResult(root, commit).artifacts, join(saved, '..'));
});
