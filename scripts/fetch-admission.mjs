#!/usr/bin/env node
// Import admission evidence; never replay cases or manufacture a checkpoint.
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {admissionPlan, verifyAdmissionEvaluations, verifyAdmissionRun} from './admission-proof.mjs';
import {requireReportOnlyImportTree} from './fetch-hosted-checkpoint.mjs';
import {checkpointResultsDirectory, readCheckpointResult} from './checkpoint-results.mjs';
import {digest} from './challenge-results.mjs';
import {readDelivery, verifyPublicationChanges} from './worker-delivery.mjs';
import {recordEvaluations} from './score-challenges.mjs';
import {readRows} from './score-log.mjs';
import {recordEvent, summarizeLedger, updateLedger} from './worker-state.mjs';
import {PROJECT_ROOT} from './scoring-workspace.mjs';

export function fetchAdmission(id, {root = PROJECT_ROOT, ledger, runGh = (args, cwd) =>
    execFileSync('gh', args, {cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024})} = {}) {
    if (!/^[1-9]\d*$/u.test(id)) throw new Error('expected an admission workflow run ID');
    requireReportOnlyImportTree(root);
    const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
    const commit = git('rev-parse', 'HEAD');
    const github = args => runGh(args, root);
    const repository = github(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
    const metadata = () => JSON.parse(github(['api', `repos/${repository}/actions/runs/${id}`]));
    const hostedRun = verifyAdmissionRun(metadata(), repository, commit);
    const directory = join(checkpointResultsDirectory(root), '..', 'admission-results', commit);
    mkdirSync(directory, {recursive: true});
    const output = mkdtempSync(join(directory, 'run-hosted-'));
    github(['run', 'download', id, '--repo', repository, '--name', 'admission-baselines', '--dir', output]);
    const summary = JSON.parse(readFileSync(join(output, '.cache/admission-ci/summary.json'), 'utf8'));
    if (summary.version !== 1 || summary.kind !== 'admission' || summary.commit !== commit)
        throw new Error('downloaded admission summary identifies a different candidate');
    const plan = admissionPlan(root, summary.base, commit);
    const expected = plan.batches.map(batch => `challenges/evaluations/admission-${commit}-${batch.batch}.json`);
    if (!isDeepStrictEqual(summary.batches, plan.batches.map(batch => batch.batch))
        || !isDeepStrictEqual(summary.evaluations, expected)) throw new Error('admission summary differs from its manifests');
    const evaluations = expected.map(path => JSON.parse(readFileSync(join(output, path), 'utf8')));
    verifyAdmissionEvaluations(root, plan, evaluations);
    const checkpoint = readCheckpointResult(root, plan.base);
    if (checkpoint.commit !== plan.base || checkpoint.allPassed !== true
        || checkpoint.recordings?.passed !== true || !Number.isSafeInteger(checkpoint.score?.screensTotal)
        || checkpoint.score.screensTotal <= 0 || checkpoint.score.screensMatched !== checkpoint.score.screensTotal)
        throw new Error('admission base needs a passing gameplay checkpoint with all fixed screens matching');
    if (!isDeepStrictEqual(verifyAdmissionRun(metadata(), repository, commit), hostedRun))
        throw new Error('admission workflow attempt changed during download');
    requireReportOnlyImportTree(root);
    if (git('rev-parse', 'HEAD') !== commit) throw new Error('HEAD changed during admission import');
    const tasks = [];
    if (ledger) {
        ledger = resolve(root, ledger);
        const state = summarizeLedger(JSON.parse(readFileSync(ledger, 'utf8')));
        if (state.coordinatorRoot !== root) throw new Error('only the coordinator imports admission scores');
        for (const batch of plan.batches) {
            const task = Object.values(state.tasks).find(task => task.kind === 'challenge-preparation'
                && task.status === 'accepted' && task.reservations.includes(`challenge-batch:${batch.batch}`));
            const delivery = state.deliveries[task?.deliveries.at(-1)];
            if (!delivery?.acceptedAt || !isDeepStrictEqual(readDelivery(delivery).manifest,
                JSON.parse(readFileSync(join(root, batch.manifestPath), 'utf8'))))
                throw new Error('admission requires an accepted, unchanged preparation delivery');
            tasks.push(task.id);
        }
        for (const path of expected) if (existsSync(join(root, path))
            && !readFileSync(join(root, path)).equals(readFileSync(join(output, path))))
            throw new Error('admission evaluations are immutable');
        mkdirSync(join(root, 'challenges/evaluations'), {recursive: true});
        for (const path of expected) copyFileSync(join(output, path), join(root, path));
        const recorded = new Set(readRows(join(root, 'SCORE.tsv')).map(row => row.challenge_evaluation));
        recordEvaluations(root, expected.filter(path => !recorded.has(path)));
        updateLedger(ledger, root, current => {
            for (const task of tasks) {
                current = recordEvent(current, {id: `admission-baseline-${task}-${commit}`, type: 'activity',
                    task, phase: 'baseline', reason: 'New-case baseline imported from the hosted Admission workflow.'});
                current = recordEvent(current, {id: `admission-done-${task}-${commit}`, type: 'activity',
                    task, phase: 'done', reason: 'Hosted baseline saved; new cases are available for selection.'});
            }
            return current;
        });
    }
    const receipt = {...summary, hostedRun, checkpoint: join(checkpoint.artifacts, 'summary.json'),
        evaluations: expected.map(path => join(output, path))};
    const bytes = JSON.stringify(receipt, null, 2) + '\n';
    const receiptPath = join(output, `${digest(bytes)}.json`);
    writeFileSync(receiptPath, bytes);
    // This is not installed in checkpoint-results: gameplay was measured at base.
    verifyPublicationChanges(root, plan.base, commit, receiptPath);
    return {commit, base: plan.base, batches: summary.batches, receipt: receiptPath,
        evaluations: ledger ? expected : receipt.evaluations, recorded: Boolean(ledger)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const [id, flag, ledger, ...extra] = process.argv.slice(2);
        if (id === '--help' && !flag) console.log('Usage: fetch-admission.mjs <run-id> [--ledger <shared-ledger>]');
        else if (extra.length || (flag && (flag !== '--ledger' || !ledger)))
            throw new Error('Usage: fetch-admission.mjs <run-id> [--ledger <shared-ledger>]');
        else console.log(JSON.stringify(fetchAdmission(id, {ledger}), null, 2));
    } catch (error) { console.error(`fetch-admission: ${error.message}`); process.exitCode = 1; }
}
