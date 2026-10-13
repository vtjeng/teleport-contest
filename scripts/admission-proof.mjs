// Admission is new manifests, not a new gameplay checkpoint.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {challengeInputSnapshot, digest, validateEvaluation, validatePreparedBatch} from './challenge-results.mjs';
import {scorerIdentity} from './score-challenges.mjs';

const MANIFEST = /^challenges\/manifests\/v([2-9]|[1-9][0-9]+)\.json$/u;

function git(root, ...args) {
    return execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).trimEnd();
}

export function admissionPlan(root, base, commit = git(root, 'rev-parse', 'HEAD')) {
    if (!/^[a-f0-9]{40}$/u.test(base ?? '') || !/^[a-f0-9]{40}$/u.test(commit))
        throw new Error('admission needs full base and candidate commit IDs');
    git(root, 'merge-base', '--is-ancestor', base, commit);
    const paths = git(root, 'diff', '--name-status', '--no-renames', base, commit).split('\n');
    if (!paths[0]) throw new Error('admission candidate has no new manifests');
    const manifests = paths.map(line => {
        const [status, path] = line.split('\t');
        const match = MANIFEST.exec(path ?? '');
        if (status !== 'A' || !match) throw new Error(`admission-only candidate changes other inputs: ${line}`);
        if (!git(root, 'ls-tree', commit, '--', path).startsWith('100644 blob '))
            throw new Error('admission manifests must be regular non-executable files');
        const number = Number(match[1]);
        if (!Number.isSafeInteger(number)) throw new Error('invalid admission batch number');
        return {batch: `v${match[1]}`, number, path};
    }).sort((a, b) => a.number - b.number);
    const previous = git(root, 'ls-tree', '-r', '--name-only', base, '--',
        'challenges/manifest.json', 'challenges/manifests').split('\n');
    if (!previous.includes('challenges/manifest.json')) throw new Error('admission base must include v1');
    const first = Math.max(1, ...previous.map(path => Number(MANIFEST.exec(path)?.[1]) || 1)) + 1;
    const batches = manifests.map((entry, index) => {
        if (entry.number !== first + index) throw new Error(`next admitted batch must be v${first + index}`);
        const bytes = git(root, 'show', `${commit}:${entry.path}`);
        const manifest = JSON.parse(bytes);
        if (!manifest.cases?.length) throw new Error('admission batch must not be empty');
        const batch = validatePreparedBatch(root, manifest, entry.batch);
        for (const item of batch.cases) for (const path of [item.recipe, item.recording]) {
            if (!path.startsWith(`challenges/cases/${entry.batch}/`)
                || !git(root, 'ls-tree', base, '--', path).startsWith('100644 blob '))
                throw new Error(`admission case must already be committed in its batch: ${path}`);
        }
        return batch;
    });
    return {base, commit, batches};
}

export function verifyAdmissionRun(run, repository, commit) {
    if (run.status !== 'completed' || run.conclusion !== 'success' || run.head_sha !== commit
        || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository
        || !/^\.github\/workflows\/admission\.yml(?:@.+)?$/u.test(run.path ?? '')
        || !Number.isSafeInteger(run.id) || run.id <= 0
        || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0)
        throw new Error('admission needs a successful exact-commit run of this repository\'s Admission workflow');
    return {provider: 'github', repository, id: String(run.id), attempt: String(run.run_attempt)};
}

export function verifyAdmissionEvaluations(root, plan, evaluations) {
    if (evaluations.length !== plan.batches.length) throw new Error('missing admission evaluations');
    const scorer = scorerIdentity(root).sha256;
    for (const batch of plan.batches) {
        const matches = evaluations.filter(value => value.batch === batch.batch);
        if (matches.length !== 1) throw new Error('missing or duplicate admission batch');
        const value = validateEvaluation(matches[0]);
        if (value.status !== 'complete' || value.sha !== plan.commit
            || value.manifestPath !== batch.manifestPath || value.manifestSha256 !== batch.manifestSha256
            || value.inputsSha256 !== challengeInputSnapshot(root, batch).sha256 || value.scorerSha256 !== scorer)
            throw new Error('admission evaluation differs from the candidate inputs');
    }
}

export function readAdmissionReceipt(root, path) {
    const bytes = readFileSync(path, 'utf8');
    if (basename(path) !== `${digest(bytes)}.json`) throw new Error('admission receipt hash differs');
    const receipt = JSON.parse(bytes);
    if (receipt.version !== 1 || receipt.kind !== 'admission' || receipt.hostedRun?.provider !== 'github')
        throw new Error('expected a hosted admission receipt, not a gameplay checkpoint');
    const plan = admissionPlan(root, receipt.base, receipt.commit);
    if (!isDeepStrictEqual(receipt.batches, plan.batches.map(batch => batch.batch)))
        throw new Error('admission receipt names different batches');
    verifyAdmissionEvaluations(root, plan, receipt.evaluations.map(path => JSON.parse(readFileSync(path, 'utf8'))));
    return receipt;
}
