#!/usr/bin/env node
// Orchestrator only, after source and per-case regression review.
// Consume saved validation; never merge, replay a corpus, publish, or dispatch workers.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { readCheckpointResult } from './checkpoint-results.mjs';
import { BOOKKEEPING_FILES } from './checkpoint-reuse.mjs';
import { summarizeLedger } from './worker-state.mjs';
import { validateHistoricalEvaluation } from './worker-delivery.mjs';
import { appendRow, generateNote, readRows, standing } from './score-log.mjs';
import { challengeInputSnapshot, evaluationBatch, readChallengeBatches, validateEvaluation } from './challenge-results.mjs';
import { recordEvaluations } from './score-challenges.mjs';
import { boundedMain } from './run-bounded.mjs';

const USAGE = `Usage: node scripts/accept-task.mjs --task <id> --ledger <file> [--evaluations <directory>]

Run only after source review, preflight, focused checks, and comparison of saved
synthetic results with accepted evidence. Uses the passing checkpoint at HEAD.
Imports reviewed synthetic evaluations (the hosted archive by default), closes
the goal, appends its score, and records validation and acceptance. Preparation
tasks skip goal closure and synthetic import. Resume at the same HEAD after an
interruption. No commits, pushes, batch admissions, or worker messages occur.
On success, resume the idle submitting worker before publication.`;

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
    root = resolve(root);
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd();
    const commit = git('rev-parse', 'HEAD');
    const ledgerPath = resolve(root, options.ledger);
    const readState = () => summarizeLedger(JSON.parse(readFileSync(ledgerPath, 'utf8')));
    const state = readState();
    const task = state.tasks[options.task];
    const delivery = state.deliveries[task?.deliveries.at(-1)];
    if (state.coordinatorRoot !== root || !task || delivery?.integration !== commit
        || !['integrating', 'validated', 'accepted'].includes(task.status))
        throw new Error('task must belong to this coordinator and the integrated HEAD');
    const checkpoint = task.status === 'accepted'
        ? JSON.parse(readFileSync(delivery.checkpoint, 'utf8'))
        : readCheckpointResult(root, commit);
    if (checkpoint.commit !== commit || checkpoint.allPassed !== true)
        throw new Error('acceptance requires a passing checkpoint at HEAD');
    const checkpointPath = join(checkpoint.artifacts, 'summary.json');
    // goal-log also reads latest.json. Do not mix its result with an earlier
    // ledger validation; a replacement checkpoint requires task revalidation.
    if (task.status === 'validated' && delivery.checkpoint !== checkpointPath)
        throw new Error('checkpoint changed after validation; revalidate the task before acceptance');
    const ensureHead = () => {
        if (git('rev-parse', 'HEAD') !== commit) throw new Error('HEAD changed during acceptance');
    };
    const receipt = () => {
        ensureHead();
        return { task: options.task, commit, checkpoint: checkpointPath, worker: task.worker,
            handle: readState().workers[task.worker]?.handle,
            next: 'Send ACCEPTED and resume the idle worker now; then prepare publication.' };
    };
    // Acceptance already happened. Recover its receipt without importing or closing again.
    if (task.status === 'accepted') return receipt();
    const run = args => {
        ensureHead();
        execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        ensureHead();
    };
    const event = fields => run(['scripts/worker-state.mjs', 'event', '--file', ledgerPath,
        '--json', JSON.stringify({ id: `accept-${options.task}-${commit}-${fields.type}`,
            task: options.task, ...fields })]);
    const preparation = task.kind === 'challenge-preparation';
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
    let goal;
    if (!preparation) {
        goal = JSON.parse(readFileSync(join(root, 'GOALS.json'), 'utf8')).goals
            .find(entry => entry.id === task.goal);
        if (!goal || !(goal.status === 'open' || (goal.status === 'closed' && goal.closedAt === commit)))
            throw new Error('goal must be open or already closed at this candidate');
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
    }
    if (task.status === 'integrating') event({ type: 'validated', passed: true, checkpoint: checkpointPath });
    if (goal && task.status !== 'accepted') {
        const recorded = new Set(readRows(join(root, 'SCORE.tsv')).map(row => row.challenge_evaluation));
        for (const { source, relative } of evaluations) {
            ensureHead();
            mkdirSync(join(root, 'challenges/evaluations'), { recursive: true });
            if (!existsSync(join(root, relative))) copyFileSync(source, join(root, relative));
        }
        ensureHead();
        recordEvaluations(root, evaluations.map(entry => entry.relative).filter(path => !recorded.has(path)));
        ensureHead();
        if (goal.status === 'open') run(['scripts/goal-log.mjs', 'close-goal', '--goal', task.goal,
            '--development-scan', join(root, '.cache/scan-cache.json')]);
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
    if (readState().tasks[options.task].status !== 'accepted') event({ type: 'accepted' });
    return receipt();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        if (process.argv.slice(2).includes('--help')) console.log(USAGE);
        else {
            const options = parseAcceptanceArgs(process.argv.slice(2));
            process.exitCode = await boundedMain('full', () => {
                console.log(JSON.stringify(acceptTask(options), null, 2));
                return 0;
            });
        }
    } catch (error) { console.error(`accept-task: ${error.message}`); process.exitCode = 1; }
}
