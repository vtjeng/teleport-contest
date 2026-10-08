#!/usr/bin/env node
// Trust the hosted verdict, verify its candidate identity, and archive its evidence.
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { PROJECT_ROOT } from './scoring-workspace.mjs';
import { checkpointResultsDirectory } from './checkpoint-results.mjs';
import { BOOKKEEPING_FILES, digest } from './checkpoint-reuse.mjs';

// Import certifies the committed candidate, not its later closure reports.
// This guard checks paths and file types, not report contents.
export function requireReportOnlyImportTree(root) {
    const entries = execFileSync('git', ['status', '--porcelain', '-z',
        '--untracked-files=all', '--ignore-submodules=none'], { cwd: root, encoding: 'utf8' })
        .split('\0').filter(Boolean);
    for (const entry of entries) {
        const path = entry.slice(3);
        const report = BOOKKEEPING_FILES.includes(path)
            || /^investigations\/(?:synthetic\/v[1-9][0-9]*\/[a-z0-9][a-z0-9-]*|(?:holdout\/)?[A-Za-z0-9][A-Za-z0-9_.-]*)\.json$/u.test(path)
            || /^challenges\/evaluations\/[a-z0-9][a-z0-9.-]*\.json$/u.test(path);
        // Reject renames, deletions and unresolved merges, not just their names.
        const stat = lstatSync(join(root, path), { throwIfNoEntry: false });
        if (!['??', ' M', 'M ', 'MM', 'A ', 'AM'].includes(entry.slice(0, 2)) || !report
            || path.includes('..') || !stat?.isFile() || (stat.mode & 0o111))
            throw new Error(`hosted import has an uncommitted change outside regular reports: ${entry}`);
    }
}

export function archiveHostedCheckpoint(root, output, summary) {
    const directory = checkpointResultsDirectory(root);
    const commitDirectory = join(directory, summary.commit);
    mkdirSync(commitDirectory, { recursive: true });
    const artifacts = mkdtempSync(join(commitDirectory, 'run-hosted-'));
    const hashes = {};
    for (const name of ['development-standing.json', 'session-results.json', 'scan-cache.json']) {
        const bytes = readFileSync(join(output, name));
        writeFileSync(join(artifacts, name), bytes);
        hashes[name] = digest(bytes);
    }
    cpSync(join(output, 'synthetic'), join(artifacts, 'synthetic'), { recursive: true });
    const archived = { ...summary, artifacts, artifactHashes: hashes, exitCode: 0 };
    const contents = JSON.stringify(archived, null, 2) + '\n';
    writeFileSync(join(artifacts, 'summary.json'), contents);
    // Each archive owns its temporary pointer. Publish only after all copies exist.
    for (const pointer of [join(commitDirectory, 'latest.json'), join(directory, 'latest.json')]) {
        const temporary = join(artifacts, 'pointer.json');
        writeFileSync(temporary, contents);
        renameSync(temporary, pointer);
    }
    // Do not add hosted evidence to the local execution-environment reuse index.
    try {
        mkdirSync(join(root, '.cache'), { recursive: true });
        for (const name of ['development-standing.json', 'scan-cache.json'])
            copyFileSync(join(artifacts, name), join(root, '.cache', name));
        writeFileSync(join(root, '.cache', 'checkpoint-summary.json'), contents);
    } catch (error) { console.warn(`Evidence archived, but local cache refresh failed: ${error.message}`); }
    return join(artifacts, 'summary.json');
}

export function verifyHostedRun(run, repository, commit) {
    if (run.status !== 'completed' || run.conclusion !== 'success'
        || run.head_sha !== commit || run.repository?.full_name !== repository
        || run.head_repository?.full_name !== repository
        || !/^\.github\/workflows\/checkpoint-trial\.yml(?:@.+)?$/u.test(run.path ?? '')
        || !Number.isSafeInteger(run.id) || run.id <= 0
        || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0)
        throw new Error('hosted checkpoint must be a successful candidate run from this repository and workflow');
    return { provider: 'github', repository, id: String(run.id), attempt: String(run.run_attempt) };
}

function gh(args, cwd) {
    return execFileSync('gh', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function fetchHostedCheckpoint(id, { root = PROJECT_ROOT, runGh = gh } = {}) {
    if (!/^[1-9]\d*$/u.test(id)) throw new Error('expected a GitHub workflow run ID');
    requireReportOnlyImportTree(root);
    const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const commit = head();
    const github = args => runGh(args, root);
    const repository = github(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
    const metadata = JSON.parse(github(['api', `repos/${repository}/actions/runs/${id}`]));
    const run = verifyHostedRun(metadata, repository, commit);
    const cache = join(root, '.cache', 'hosted-checkpoints');
    mkdirSync(cache, { recursive: true });
    const output = mkdtempSync(join(cache, `${id}-`));
    github(['run', 'download', id, '--repo', repository, '--name', 'parallel-checkpoint', '--dir', output]);
    const summary = JSON.parse(readFileSync(join(output, 'summary.json'), 'utf8'));
    if (summary.commit !== commit || summary.allPassed !== true || !isDeepStrictEqual(summary.hostedRun, run))
        throw new Error('downloaded summary does not identify this successful candidate run');
    const synthetic = join(output, 'synthetic');
    github(['run', 'download', id, '--repo', repository, '--name', 'synthetic-evaluations', '--dir', synthetic]);
    // A concurrent rerun or checkout must not change what this import claims.
    const after = verifyHostedRun(JSON.parse(github(['api', `repos/${repository}/actions/runs/${id}`])), repository, commit);
    if (!isDeepStrictEqual(after, run)) throw new Error('workflow attempt changed while fetching evidence');
    requireReportOnlyImportTree(root);
    if (head() !== commit)
        throw new Error('HEAD changed while fetching evidence');
    const result = archiveHostedCheckpoint(root, output, summary);
    console.log(`Results: ${result}`);
    const savedSynthetic = join(resolve(result, '..'), 'synthetic');
    console.log(`Synthetic evaluations: ${savedSynthetic}`);
    console.log('Orchestrator: compare these evaluations with accepted evidence before recording scores.');
    console.log('After review, copy each file to the path below and run its record command; keep HEAD unchanged.');
    for (const name of readdirSync(savedSynthetic).sort()) {
        const batch = /^ci-(v\d+)\.json$/u.exec(name)?.[1];
        if (!batch) continue;
        const destination = `challenges/evaluations/hosted-${run.id}-${run.attempt}-${batch}.json`;
        console.log(`Copy ${join(savedSynthetic, name)} to ${destination}`);
        console.log(`node scripts/score-challenges.mjs --record ${destination}`);
    }
    return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        if (process.argv.length !== 3) throw new Error('Usage: fetch-hosted-checkpoint.mjs <run-id>');
        fetchHostedCheckpoint(process.argv[2]);
    } catch (error) { console.error(`fetch-hosted-checkpoint: ${error.message}`); process.exitCode = 1; }
}
