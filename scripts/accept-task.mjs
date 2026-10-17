#!/usr/bin/env node
import {withMainWork} from './main-work.mjs';
// Orchestrator only. Targeted fixes are accepted from saved CI results.
// Consume saved validation; never merge, replay a corpus, publish, or dispatch workers.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { readCheckpointResult } from './checkpoint-results.mjs';
import { BOOKKEEPING_FILES } from './checkpoint-reuse.mjs';
import { recordEvent, summarizeLedger, updateLedger } from './worker-state.mjs';
import { readDelivery, validateHistoricalEvaluation, verifyEvent } from './worker-delivery.mjs';
import { appendRow, generateNote, readRows, standing } from './score-log.mjs';
import { challengeInputSnapshot, evaluationBatch, readChallengeBatches, validateEvaluation } from './challenge-results.mjs';
import { recordEvaluations } from './score-challenges.mjs';
import { reviewTasks } from './task-verdict.mjs';
import { recordTaskAcceptance, validateGoals } from './goal-log.mjs';

const USAGE = `Usage: node scripts/accept-task.mjs --task <id> --ledger <file> [--evaluations <directory>]

Run after preflight and a passing checkpoint at HEAD. Targeted fixes must improve
their assigned session without fixed or synthetic per-case regressions. The
helper compares saved artifacts itself; no source-certification gate is required.
Imports synthetic evaluations, records the goal's outcome and score, and records
validation and acceptance. Non-target deliveries require no regressions, not a target gain. Preparation
tasks skip goal closure and synthetic import. Resume at the same HEAD after an
interruption. No commits, pushes, batch admissions, or worker messages occur.
Worker notifications follow .agents/loop.md, "Notifications".`;

export function parseAcceptanceArgs(args) {
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index]?.slice(2);
        if (!args[index]?.startsWith('--') || !['task', 'ledger', 'evaluations'].includes(key)
            || !args[index + 1] || options[key]) throw new Error(USAGE);
        options[key] = args[index + 1];
    }
    if (!options.task || !options.ledger) throw new Error(USAGE);
    return options;
}

export function acceptTask(options, root = process.cwd()) {
    return acceptTasks(options, [options.task], root)[0];
}

export function acceptTasks(options, taskIds, root = process.cwd()) {
    return withMainWork(root, () => acceptTasksOwned(options,taskIds,root));
}
function acceptTasksOwned(options, taskIds, root = process.cwd()) {
    root = resolve(root);
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd();
    const commit = git('rev-parse', 'HEAD');
    const ledgerPath = resolve(root, options.ledger);
    const readState = () => summarizeLedger(JSON.parse(readFileSync(ledgerPath, 'utf8')));
    const state = readState();
    const tasks = taskIds.map(id => state.tasks[id]);
    const deliveries = tasks.map(task => state.deliveries[task?.deliveries.at(-1)]);
    if (state.coordinatorRoot !== root || !tasks.length || new Set(taskIds).size !== taskIds.length
        || tasks.some((task, i) => !task || deliveries[i]?.integration !== commit
            || !['integrating', 'validated', 'accepted'].includes(task.status)))
        throw new Error('task must belong to this coordinator and the integrated HEAD');
    for (const delivery of deliveries) if (delivery.implementationGroup
        && !isDeepStrictEqual(delivery.implementationGroup, taskIds))
        throw new Error('accept the entire frozen implementation group together');
    const preparation = tasks.every(task => task.kind === 'challenge-preparation');
    if (!preparation && tasks.some(task => task.kind === 'challenge-preparation'))
        throw new Error('do not mix Prep and implementation acceptance');
    const pending = tasks.filter(task => task.status !== 'accepted');
    const checkpoint = !pending.length
        ? JSON.parse(readFileSync(deliveries[0].checkpoint, 'utf8'))
        : readCheckpointResult(root, commit);
    if (checkpoint.commit !== commit || checkpoint.allPassed !== true)
        throw new Error('acceptance requires a passing checkpoint at HEAD');
    const checkpointPath = join(checkpoint.artifacts, 'summary.json');
    // A replacement checkpoint requires task revalidation; do not mix it with
    // the earlier result recorded in the ledger.
    if (tasks.some((task, i) => ['validated', 'accepted'].includes(task.status) && deliveries[i].checkpoint !== checkpointPath))
        throw new Error('checkpoint changed after validation; revalidate the task before acceptance');
    const ensureHead = () => {
        if (git('rev-parse', 'HEAD') !== commit) throw new Error('HEAD changed during acceptance');
    };
    const receipts = () => tasks.map(task => {
        ensureHead();
        const current = readState(), worker = current.workers[task.worker];
        const activeTask = Object.values(current.tasks).find(entry => entry.worker === task.worker && entry.status === 'working');
        return { task: task.id, commit, checkpoint: checkpointPath, worker: task.worker,
            handle: worker?.handle,
            handoff: { turn: worker?.turn ?? null, currentTask: activeTask?.id ?? null,
                action: activeTask ? 'keep-current-task' : worker?.turn === 'idle' ? 'wait' : 'inspect-turn' },
            next: 'Follow .agents/loop.md, "Notifications"; then prepare publication.' };
    });
    // Acceptance already happened. Recover its receipt without importing or closing again.
    if (!pending.length) return receipts();
    const batches = preparation ? [] : readChallengeBatches(root);
    const evaluationPath = batch => `challenges/evaluations/accepted-${commit}-${batch}.json`;
    // Permit checkpoint-excluded bookkeeping reports and current closure evaluations.
    // The allowlist does not validate every report's contents. Never accept untested code.
    const allowed = new Set(preparation ? []
        : [...BOOKKEEPING_FILES, ...batches.map(entry => evaluationPath(entry.batch))]);
    const dirty = git('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean);
    for (const line of dirty) {
        const path = line.slice(3);
        const stat = lstatSync(join(root, path), { throwIfNoEntry: false });
        const historical = !preparation && !allowed.has(path)
            && /^challenges\/evaluations\/[a-z0-9][a-z0-9.-]*\.json$/u.test(path);
        if ((!allowed.has(path) && !historical) || !stat?.isFile() || (stat.mode & 0o111)
            || !['??', ' M', 'M ', 'MM', 'A ', 'AM'].includes(line.slice(0, 2)))
            throw new Error(`uncommitted file outside closure: ${line}`);
        if (historical) {
            if (git('ls-tree', '-z', commit, '--', path))
                throw new Error(`challenge evaluations are immutable: ${path}`);
            validateHistoricalEvaluation(root, JSON.parse(readFileSync(join(root, path), 'utf8')), commit);
        }
    }
    const evaluations = [];
    let goals;
    if (!preparation) {
        goals = JSON.parse(readFileSync(join(root, 'GOALS.json'), 'utf8'));
        for (const task of pending) {
            const goal = goals.goals.find(entry => entry.id === task.goal);
            if (task.sourceTrial && !isDeepStrictEqual(goal?.sourceTrial, task.sourceTrial))
                throw new Error('source trial goal differs from its assigned review/base');
            if (!goal || !(['queued', 'parked'].includes(goal.status)
            || goal.status === 'open' || (goal.status === 'closed' && goal.closedAt === commit)))
            throw new Error('goal must be available or already closed at this candidate');
        }
        if (new Set(tasks.map(task => task.goal)).size !== tasks.length)
            throw new Error('implementation tasks must have distinct goals');
        const directory = options.evaluations ? resolve(root, options.evaluations)
            : join(checkpoint.artifacts, 'synthetic');
        for (const name of (batches.length ? readdirSync(directory) : []).filter(name => name.endsWith('.json'))) {
            const source = join(directory, name);
            const evaluation = JSON.parse(readFileSync(source, 'utf8'));
            validateEvaluation(evaluation);
            const batch = evaluationBatch(evaluation);
            const manifest = batches.find(entry => entry.batch === batch);
            if (evaluation.sha !== commit || evaluation.status !== 'complete'
                || !manifest || evaluation.manifestSha256 !== manifest.manifestSha256
                || evaluation.inputsSha256 !== challengeInputSnapshot(root, manifest).sha256
                || evaluations.some(entry => entry.batch === batch))
                throw new Error(`evaluation must identify one complete current batch: ${name}`);
            const relative = evaluationPath(batch);
            if (existsSync(join(root, relative))
                && !isDeepStrictEqual(JSON.parse(readFileSync(join(root, relative), 'utf8')), evaluation))
                throw new Error(`different evidence already exists at ${relative}`);
            evaluations.push({ source, relative, batch });
        }
        if (evaluations.length !== batches.length) throw new Error('missing reviewed synthetic batch');
        const archivedScan = join(checkpoint.artifacts, 'scan-cache.json');
        const scanPath = existsSync(archivedScan) ? archivedScan : join(root, '.cache/scan-cache.json');
        const scan = JSON.parse(readFileSync(scanPath, 'utf8'));
        if (scan.sha !== checkpoint.executionCommit || !Array.isArray(scan.rows))
            throw new Error('saved development scan must match the checkpoint execution commit');
        mkdirSync(join(root, '.cache'), { recursive: true });
        if (scanPath !== join(root, '.cache/scan-cache.json'))
            copyFileSync(scanPath, join(root, '.cache/scan-cache.json'));
        const verdicts = reviewTasks(options, pending.map(task => task.id), root);
        const rejected = verdicts.filter(verdict => verdict.reviewRequired);
        if (rejected.length) throw new Error(`task acceptance blocked: ${JSON.stringify(rejected.map(verdict => ({
            task: verdict.task, target: verdict.target, targetImproved: verdict.targetImproved,
            issues: verdict.issues, regressions: verdict.regressions, fixed: verdict.fixed,
        })))}`);
        // Resolve every target before writing any closure or acceptance.
        for (const task of pending) {
            const packet = readDelivery(state.deliveries[task.deliveries.at(-1)]);
            const claims = Object.fromEntries(['functions', 'entryPointReview', 'entryPoints', 'incompleteFunctions', 'evidenceBasis']
                .filter(key => packet[key] !== undefined).map(key => [key, packet[key]]));
            recordTaskAcceptance(goals.goals.find(entry => entry.id === task.goal), checkpoint,
                verdicts.find(verdict => verdict.task === task.id), claims);
        }
        validateGoals(goals);
    }
    updateLedger(ledgerPath, root, ledger => {
        ensureHead();
        const at = new Date().toISOString();
        for (const task of pending) {
            const current = summarizeLedger(ledger);
            const delivery = current.deliveries[current.tasks[task.id]?.deliveries.at(-1)];
            if (delivery?.delivery !== task.deliveries.at(-1) || delivery.integration !== commit)
                throw new Error('submission changed during validation');
            if (current.tasks[task.id].status === 'integrating') ledger = recordEvent(ledger,
                verifyEvent(root, current, {id: `accept-${task.id}-${commit}-validated`,
                    type: 'validated', task: task.id, passed: true, checkpoint: checkpointPath}), at);
            else if (current.tasks[task.id].status !== 'validated' || delivery.checkpoint !== checkpointPath)
                throw new Error('validation state changed during acceptance');
        }
        return ledger;
    });
    if (goals) {
        const recorded = new Set(readRows(join(root, 'SCORE.tsv')).map(row => row.challenge_evaluation));
        for (const { source, relative } of evaluations) {
            ensureHead();
            mkdirSync(join(root, 'challenges/evaluations'), { recursive: true });
            if (!existsSync(join(root, relative))) copyFileSync(source, join(root, relative));
        }
        ensureHead();
        recordEvaluations(root, evaluations.map(entry => entry.relative).filter(path => !recorded.has(path)));
        ensureHead();
        writeFileSync(join(root, 'GOALS.json'), `${JSON.stringify(goals, null, 2)}\n`);
        for (const task of pending) {
            const rows = readRows(join(root, 'SCORE.tsv'));
            if (!rows.some(row => row.event === 'goal' && row.sha === checkpoint.executionCommit
                && row.note.startsWith(`${task.goal} closes.`))) {
                const score = checkpoint.score;
                const fields = { event: 'goal', sha: checkpoint.executionCommit,
                    sessions_passed: score.passing, sessions_total: score.sessions,
                    screens_matched: score.screensMatched, screens_total: score.screensTotal,
                    rng_matched: score.rngMatched, rng_total: score.rngTotal,
                    cursors_matched: score.cursorsMatched, cursors_total: score.cursorsTotal };
                fields.note = generateNote({ event: 'goal', label: task.goal,
                    current: fields, previous: standing(rows).fixedDevelopment });
                ensureHead();
                appendRow(fields, join(root, 'SCORE.tsv'));
            }
        }
    }
    // Artifact reads and report writes happen outside the short ledger lock.
    // The final transition is atomic, in dependency order, and checks that no
    // worker replaced a frozen submission while the reports were prepared.
    updateLedger(ledgerPath, root, ledger => {
        ensureHead();
        const at = new Date().toISOString();
        for (const task of tasks) {
            const current = summarizeLedger(ledger);
            const delivery = current.deliveries[current.tasks[task.id]?.deliveries.at(-1)];
            if (delivery?.delivery !== task.deliveries.at(-1) || delivery.integration !== commit)
                throw new Error('submission changed during acceptance');
            if (current.tasks[task.id].status === 'accepted') continue;
            if (current.deliveries[delivery.delivery].checkpoint !== checkpointPath)
                throw new Error('checkpoint changed during acceptance');
            ledger = recordEvent(ledger, {id: `accept-${task.id}-${commit}-accepted`, type: 'accepted', task: task.id}, at);
        }
        return ledger;
    });
    return receipts();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        if (process.argv.slice(2).includes('--help')) console.log(USAGE);
        else {
            const options = parseAcceptanceArgs(process.argv.slice(2));
            console.log(JSON.stringify(acceptTask(options), null, 2));
        }
    } catch (error) { console.error(`accept-task: ${error.message}`); process.exitCode = 1; }
}
