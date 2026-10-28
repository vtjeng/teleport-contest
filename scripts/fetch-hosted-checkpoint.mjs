#!/usr/bin/env node
// Trust the hosted verdict, verify its candidate identity, and archive its evidence.
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { PROJECT_ROOT } from './scoring-workspace.mjs';
import { checkpointResultsDirectory } from './checkpoint-results.mjs';
import { BOOKKEEPING_FILES, digest } from './checkpoint-reuse.mjs';
import {materializeEvidence, readHostedEvidence} from './hosted-evidence.mjs';
import {readChallengeBatches} from './challenge-results.mjs';
import {verifyAdmissionEvaluations} from './admission-proof.mjs';
import {PUBLIC_REPOSITORY, publicGithubRead} from './public-github-read.mjs';

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
    const previousPath = join(commitDirectory, 'latest.json');
    if (existsSync(previousPath)) {
        const previous = JSON.parse(readFileSync(previousPath));
        if (isDeepStrictEqual(previous.hostedRun, summary.hostedRun)
            && (!isDeepStrictEqual(previous.artifactHashes, hashes)
                || previous.hostedEvidence && summary.hostedEvidence
                && !isDeepStrictEqual(previous.hostedEvidence, summary.hostedEvidence)))
            throw new Error('hosted evidence conflicts with the archived result for this workflow attempt');
    }
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

export function fetchHostedCheckpoint(id, { root = PROJECT_ROOT, runGh = gh, transport = 'checks', runPublic = publicGithubRead } = {}) {
    if (!/^[1-9]\d*$/u.test(id)) throw new Error('expected a GitHub workflow run ID');
    if (!['checks', 'public-checks', 'artifact'].includes(transport)) throw new Error('unknown hosted evidence transport');
    requireReportOnlyImportTree(root);
    const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const commit = head();
    const github = args => runGh(args, root);
    const repository = transport === 'public-checks' ? PUBLIC_REPOSITORY
        : github(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
    const api = transport === 'public-checks' ? runPublic : path => github(['api', path]);
    const readMetadata = () => {
        const metadata = JSON.parse(api(`repos/${repository}/actions/runs/${id}`));
        if (transport === 'public-checks' && (metadata.repository?.private !== false || metadata.head_repository?.private !== false))
            throw new Error('public checkpoint read requires explicitly public repositories');
        return metadata;
    };
    const metadata = readMetadata();
    const run = verifyHostedRun(metadata, repository, commit);
    const cache = join(root, '.cache', 'hosted-checkpoints');
    mkdirSync(cache, { recursive: true });
    const output = mkdtempSync(join(cache, `${id}-`));
    let proof;
    if (transport === 'checks' || transport === 'public-checks') {
        const evidence = readHostedEvidence({github: api,
            run: metadata, repository, kind: 'checkpoint'});
        const batches = readChallengeBatches(root);
        const expected = ['summary.json', 'development-standing.json', 'session-results.json', 'scan-cache.json',
            ...batches.map(batch => `synthetic/ci-${batch.batch}.json`)].sort();
        if (!isDeepStrictEqual([...evidence.files.keys()].sort(), expected))
            throw new Error('API checkpoint is missing required evidence files or contains unexpected files');
        if (batches.length) verifyAdmissionEvaluations(root, {commit, batches}, batches.map(batch =>
            JSON.parse(evidence.files.get(`synthetic/ci-${batch.batch}.json`))));
        materializeEvidence(output, evidence.files);
        mkdirSync(join(output, 'synthetic'), {recursive: true});
        proof = evidence.proof;
    } else if (transport === 'artifact') {
        github(['run', 'download', id, '--repo', repository, '--name', 'parallel-checkpoint', '--dir', output]);
        github(['run', 'download', id, '--repo', repository, '--name', 'synthetic-evaluations', '--dir', join(output, 'synthetic')]);
    } else throw new Error('unknown hosted evidence transport');
    const summary = JSON.parse(readFileSync(join(output, 'summary.json'), 'utf8'));
    if (summary.commit !== commit || summary.allPassed !== true || !isDeepStrictEqual(summary.hostedRun, run))
        throw new Error('downloaded summary does not identify this successful candidate run');
    // A concurrent rerun or checkout must not change what this import claims.
    const after = verifyHostedRun(readMetadata(), repository, commit);
    if (!isDeepStrictEqual(after, run)) throw new Error('workflow attempt changed while fetching evidence');
    requireReportOnlyImportTree(root);
    if (head() !== commit)
        throw new Error('HEAD changed while fetching evidence');
    const result = archiveHostedCheckpoint(root, output, {...summary, ...(proof ? {hostedEvidence: proof} : {})});
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
        const [id, flag, ...extra] = process.argv.slice(2);
        if (!id || extra.length || (flag && !['--artifact', '--public'].includes(flag)))
            throw new Error('Usage: fetch-hosted-checkpoint.mjs <run-id> [--artifact|--public]');
        fetchHostedCheckpoint(id, {transport: flag === '--public' ? 'public-checks' : flag === '--artifact' ? 'artifact' : 'checks'});
    } catch (error) { console.error(`fetch-hosted-checkpoint: ${error.message}`); process.exitCode = 1; }
}
