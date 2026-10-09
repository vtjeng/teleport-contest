#!/usr/bin/env node
// Routine orchestrator handoff using saved evidence; no replay or agent messages.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { acceptTask } from './accept-task.mjs';
import { acceptedMain, savedQueueIssues } from './worker-backlog.mjs';
import { nextActions, summarizeLedger } from './worker-state.mjs';
import { git, isAncestor, validateHistoricalEvaluation, verifyPublicationChanges } from './worker-delivery.mjs';
import { BOOKKEEPING_FILES } from './checkpoint-reuse.mjs';
import { readCheckpointResult } from './checkpoint-results.mjs';
import { admittedBatchIds, evaluationBatch, readChallengeBatches, readEvaluation } from './challenge-results.mjs';
import { loadEvaluationDirectory, compareChallengeBatches } from './compare-challenge-evaluations.mjs';
import { writeDashboardSnapshot } from './dashboard-snapshot.mjs';
import { checkPublishedCI } from './check-published-ci.mjs';
import { readRows } from './score-log.mjs';
import { boundedMain } from './run-bounded.mjs';

const USAGE = `Usage: node scripts/task-handoff.mjs <review|accept|publish> --task <id> --ledger <file>
  review:  [--baseline <accepted-checkpoint-summary>] [--evaluations <directory>]
  accept:  [--evaluations <directory>]
  publish: [--queue <saved-combined-work-queue>]

review compares saved synthetic results with the latest accepted checkpoint by
default; an explicit baseline must also belong to an accepted delivery. Newly
admitted batches use their first complete recorded baseline when absent from
that commit. Review source evidence and resolve reported regressions yourself.
accept runs the existing acceptance helper and returns the worker handoff.
Resume the idle submitting worker before publish; this tool sends no messages.
publish generates the dashboard snapshot, commits only closure reports, checks
publication changes, pushes accepted Main, records publication, checks CI once,
and returns the next-work summary. No force push, game replay, or CI watch occurs.
Retry an interrupted phase; publish reuses a committed report descendant. A later
code change needs separate validation and the existing supplemental-checkpoint
publication route, not this report-only helper.`;

export function parseHandoffArgs(args) {
    const [phase, ...rest] = args;
    const allowed = { review: ['baseline', 'evaluations'], accept: ['evaluations'], publish: ['queue'] };
    if (!Object.hasOwn(allowed, phase)) throw new Error(USAGE);
    const options = { phase };
    for (let index = 0; index < rest.length; index += 2) {
        const key = rest[index]?.slice(2);
        if (rest[index] !== `--${key}` || !['task', 'ledger', ...allowed[phase]].includes(key)
            || !rest[index + 1] || rest[index + 1].startsWith('--') || Object.hasOwn(options, key)) throw new Error(USAGE);
        options[key] = rest[index + 1];
    }
    if (!options.task || !options.ledger) throw new Error(USAGE);
    return options;
}

function context(options, root) {
    root = resolve(root);
    const ledgerPath = resolve(root, options.ledger);
    const readState = () => summarizeLedger(JSON.parse(readFileSync(ledgerPath, 'utf8')));
    const state = readState(), task = state.tasks[options.task];
    const delivery = state.deliveries[task?.deliveries.at(-1)];
    if (state.coordinatorRoot !== root || !delivery) throw new Error('task must belong to this coordinator');
    return { root, ledgerPath, readState, state, task, delivery };
}

export function reviewTask(options, root = process.cwd()) {
    const ctx = context(options, root);
    const candidate = git(ctx.root, 'rev-parse', 'HEAD');
    if (ctx.delivery.integration !== candidate || !['integrating', 'validated'].includes(ctx.task.status))
        throw new Error('review requires the current integrated candidate');
    const summary = readCheckpointResult(ctx.root, candidate);
    if (summary.commit !== candidate || summary.allPassed !== true) throw new Error('candidate checkpoint must pass at HEAD');
    if (ctx.task.kind === 'challenge-preparation') return { task: options.task, candidate,
        preparation: true, next: 'Review the saved C mission and replay evidence before acceptance.' };
    const baselinePath = options.baseline ? resolve(ctx.root, options.baseline) : acceptedMain(ctx.state)?.checkpoint;
    const baselineDelivery = Object.values(ctx.state.deliveries).find(d => d.acceptedAt
        && (d.checkpoint === baselinePath || d.supplementalCheckpoint === baselinePath));
    if (!baselinePath || !baselineDelivery)
        throw new Error('baseline must identify an accepted checkpoint in the shared ledger');
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const accepted = baselineDelivery.checkpoint === baselinePath ? baselineDelivery.integration === baseline.commit
        : baselineDelivery.publishedCommit && isAncestor(ctx.root, baselineDelivery.integration, baseline.commit)
            && isAncestor(ctx.root, baseline.commit, baselineDelivery.publishedCommit);
    if (baseline.allPassed !== true || !isAncestor(ctx.root, baseline.commit, candidate) || !accepted)
        throw new Error('baseline checkpoint differs from its accepted integration');
    const candidateDirectory = options.evaluations ? resolve(ctx.root, options.evaluations) : join(summary.artifacts, 'synthetic');
    const admitted = readChallengeBatches(ctx.root);
    const before = loadEvaluationDirectory(join(baseline.artifacts, 'synthetic'), baseline.commit);
    const admissionBaselines = [];
    // An admission after the accepted checkpoint has its own first measurement.
    // Never substitute early history for a missing artifact of an older batch.
    const newBatches = admitted.filter(entry => !before.has(entry.batch)
        && !git(ctx.root, 'ls-tree', baseline.commit, '--', entry.manifestPath));
    const rows = newBatches.length ? readRows(join(ctx.root, 'SCORE.tsv')) : [];
    for (const batch of newBatches) {
        for (const row of rows.filter(row => row.event === 'challenge'
            && row.challenge_manifest_sha256 === batch.manifestSha256)) {
            const evaluation = readEvaluation(ctx.root, row.challenge_evaluation);
            if (evaluationBatch(evaluation) !== batch.batch || evaluation.status !== 'complete') continue;
            if (evaluation.sha !== row.sha) throw new Error('admission baseline differs from its recorded commit');
            if (evaluation.sha === candidate || Date.parse(row.utc) > Date.parse(ctx.delivery.integratingAt))
                throw new Error('admission baseline must precede the current integration');
            validateHistoricalEvaluation(ctx.root, evaluation, candidate);
            before.set(batch.batch, evaluation);
            admissionBaselines.push({ batch: batch.batch, commit: evaluation.sha, evaluation: row.challenge_evaluation });
            break;
        }
    }
    return { task: options.task, baseline: baseline.commit, candidate, baselineCheckpoint: baselinePath,
        candidateCheckpoint: join(summary.artifacts, 'summary.json'), admissionBaselines,
        ...compareChallengeBatches(before, loadEvaluationDirectory(candidateDirectory, candidate), admitted) };
}

export function publishTask(options, root = process.cwd(), { checkCI = (args, cwd) => checkPublishedCI(args, {
    gh: values => execFileSync('gh', values, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }),
}) } = {}) {
    const ctx = context(options, root);
    if (ctx.task.status !== 'accepted' || !ctx.delivery.acceptedAt) throw new Error('publication requires accepted work');
    if (Object.values(ctx.state.tasks).some(task => ['integrating', 'validated'].includes(task.status)))
        throw new Error('finish the active integration before publication');
    if (git(ctx.root, 'branch', '--show-current') !== 'main') throw new Error('publish from local main');
    const summary = JSON.parse(readFileSync(ctx.delivery.checkpoint, 'utf8'));
    if (summary.allPassed !== true || summary.commit !== ctx.delivery.integration) throw new Error('accepted checkpoint differs from integration');
    const ciFile = join(ctx.root, '.cache/loop-ci-pending.json');
    let commit = ctx.delivery.publishedCommit;
    if (!commit) {
        const pending = checkCI({ file: ciFile }, ctx.root);
        if (pending.failed) throw new Error('publication CI failed; validate a correction before another push');
        const head = git(ctx.root, 'rev-parse', 'HEAD');
        if (!isAncestor(ctx.root, ctx.delivery.integration, head)) throw new Error('HEAD must contain the accepted integration');
        verifyPublicationChanges(ctx.root, ctx.delivery.integration, head);
        const dirty = git(ctx.root, 'status', '--porcelain', '-z', '--untracked-files=all').split('\0').filter(Boolean);
        const paths = dirty.map(line => {
            const path = line.slice(3), stat = lstatSync(join(ctx.root, path), { throwIfNoEntry: false });
            if (!['??', ' M', 'M ', 'MM', 'A ', 'AM'].includes(line.slice(0, 2))
                || !stat?.isFile() || stat.mode & 0o111
                || !(BOOKKEEPING_FILES.includes(path) || /^investigations\/.+\.json$/u.test(path)
                    || /^challenges\/evaluations\/[a-z0-9][a-z0-9.-]*\.json$/u.test(path)))
                throw new Error(`uncommitted file outside publication: ${path}`);
            return path;
        });
        // Reuse only a packet whose committed snapshot includes this acceptance.
        // An earlier manual closure commit still needs its dashboard snapshot.
        const snapshot = git(ctx.root, 'ls-tree', head, '--', 'dashboard-snapshot.json')
            ? JSON.parse(git(ctx.root, 'show', `${head}:dashboard-snapshot.json`)) : null;
        const captured = snapshot?.development?.executionCommit === summary.executionCommit
            && snapshot.activity?.events.some(event => event.runId === ctx.state.runId
                && event.type === 'accepted' && event.task === options.task);
        if (!captured || paths.length) {
            writeDashboardSnapshot({ ledger: ctx.ledgerPath, checkpoint: ctx.delivery.checkpoint,
                output: 'dashboard-snapshot.json' }, ctx.root);
            git(ctx.root, 'add', '--', ...new Set([...paths, 'dashboard-snapshot.json']));
            if (git(ctx.root, 'diff', '--cached', '--name-only'))
                git(ctx.root, 'commit', '-m', `Record ${options.task} acceptance`, '--trailer', 'Assisted-by: Codex');
        }
        commit = git(ctx.root, 'rev-parse', 'HEAD');
        // Reuse the same content checks the published ledger event applies,
        // before allowing any push. A bad report leaves a recoverable local commit.
        verifyPublicationChanges(ctx.root, ctx.delivery.integration, commit);
        const current = ctx.readState();
        if (current.tasks[options.task]?.status !== 'accepted'
            || current.tasks[options.task].deliveries.at(-1) !== ctx.task.deliveries.at(-1))
            throw new Error('task changed during publication');
        if (git(ctx.root, 'rev-parse', 'HEAD') !== commit) throw new Error('HEAD changed during publication');
        git(ctx.root, 'push', 'origin', `${commit}:refs/heads/main`);
        execFileSync(process.execPath, [fileURLToPath(new URL('./worker-state.mjs', import.meta.url)),
            'event', '--file', ctx.ledgerPath, '--json', JSON.stringify({
                id: `publish-${options.task}-${commit}`, type: 'published', task: options.task, commit,
            })], { cwd: ctx.root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    }
    const publicationCI = checkCI({ file: ciFile, commit, task: options.task }, ctx.root);
    const batches = admittedBatchIds(ctx.root);
    const queue = options.queue ? JSON.parse(readFileSync(resolve(ctx.root, options.queue), 'utf8')) : null;
    if (queue) {
        const issues = savedQueueIssues(queue, batches, readRows(join(ctx.root, 'SCORE.tsv')));
        if (issues.length) { queue.selectionBlocked = true; queue.blockers = [...(queue.blockers ?? []), ...issues.map(reason => ({ reason }))]; }
    }
    return { task: options.task, commit, publicationCI, next: nextActions(ctx.readState(), batches, queue) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        if (process.argv.slice(2).includes('--help')) console.log(USAGE);
        else {
            const options = parseHandoffArgs(process.argv.slice(2));
            process.exitCode = await boundedMain(options.phase === 'accept' ? 'full' : 'focused', () => {
                const result = options.phase === 'review' ? reviewTask(options)
                    : options.phase === 'accept' ? acceptTask(options) : publishTask(options);
                console.log(JSON.stringify(result, null, 2));
                return result.reviewRequired || result.publicationCI?.failed ? 1 : 0;
            });
        }
    } catch (error) { console.error(`task-handoff: ${error.message}`); process.exitCode = 2; }
}
