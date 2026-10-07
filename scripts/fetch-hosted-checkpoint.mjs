#!/usr/bin/env node
// Fetch and verify hosted evidence without installing it as acceptance evidence.
// Acceptance policy and the shared checkpoint archive remain unchanged.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { requireCleanCheckpointTree } from './checkpoint-checks.mjs';
import { PROJECT_ROOT } from './scoring-workspace.mjs';

export function verifyHostedRun(run, repository, commit) {
    if (run.status !== 'completed' || run.conclusion !== 'success'
        || run.head_sha !== commit || run.repository?.full_name !== repository
        || run.head_repository?.full_name !== repository
        || run.path !== '.github/workflows/checkpoint-trial.yml'
        || !Number.isSafeInteger(run.id) || run.id <= 0
        || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0)
        throw new Error('hosted checkpoint must be a successful candidate run from this repository and workflow');
    return { provider: 'github', repository, id: String(run.id), attempt: String(run.run_attempt) };
}

function gh(args) {
    return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function fetchHostedCheckpoint(id) {
    if (!/^[1-9]\d*$/u.test(id)) throw new Error('expected a GitHub workflow run ID');
    process.chdir(PROJECT_ROOT);
    requireCleanCheckpointTree();
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const repository = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
    const metadata = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${id}`]));
    const run = verifyHostedRun(metadata, repository, commit);
    const cache = join(PROJECT_ROOT, '.cache', 'hosted-checkpoints');
    mkdirSync(cache, { recursive: true });
    const output = mkdtempSync(join(cache, `${id}-`));
    gh(['run', 'download', id, '--repo', repository, '--name', 'parallel-checkpoint', '--dir', output]);
    const summary = JSON.parse(readFileSync(join(output, 'summary.json'), 'utf8'));
    if (summary.commit !== commit || summary.allPassed !== true || !isDeepStrictEqual(summary.hostedRun, run))
        throw new Error('downloaded summary does not identify this successful candidate run');
    const synthetic = join(output, 'synthetic');
    gh(['run', 'download', id, '--repo', repository, '--name', 'synthetic-evaluations', '--dir', synthetic]);
    // A concurrent rerun or checkout must not change what this import claims.
    const after = verifyHostedRun(JSON.parse(gh(['api', `repos/${repository}/actions/runs/${id}`])), repository, commit);
    if (!isDeepStrictEqual(after, run)) throw new Error('workflow attempt changed while fetching evidence');
    requireCleanCheckpointTree();
    if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== commit)
        throw new Error('HEAD changed while fetching evidence');
    console.log(`Verified hosted evidence: ${output} (not installed for acceptance)`);
    return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        if (process.argv.length !== 3) throw new Error('Usage: fetch-hosted-checkpoint.mjs <run-id>');
        fetchHostedCheckpoint(process.argv[2]);
    } catch (error) { console.error(`fetch-hosted-checkpoint: ${error.message}`); process.exitCode = 1; }
}
