#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {recordEvent, summarizeLedger, updateLedger} from './worker-state.mjs';
import {authorizeQueueEvent, queueBase, queueBaseEquivalent, queueWork} from './assignment-queue.mjs';
import {admittedBatchIds} from './challenge-results.mjs';
import {investigationReservations, savedQueueIssues} from './worker-backlog.mjs';
import {readRows} from './score-log.mjs';
import {readQueueEvidence} from './queue-evidence.mjs';

export const USAGE = `Usage (from the Work lead, Challenge lead or a registered worker checkout root):
  node scripts/work-queue.mjs enable --prep <challenge-lead-worktree> --file <absolute-ledger>
  node scripts/work-queue.mjs refresh --queue <saved-combined-mismatch-queue> --file <ledger>
  node scripts/work-queue.mjs enqueue --json <assignment.json> --file <ledger>
  node scripts/work-queue.mjs batch --branch <batch-branch> [--base <rejected-revision>] --file <ledger>
  node scripts/work-queue.mjs next --file <ledger>
  node scripts/work-queue.mjs claim --worker Worker-1 --file <ledger>
  node scripts/work-queue.mjs processes --worker Worker-1 --json <handles.json> --file <ledger>
  node scripts/work-queue.mjs complete --worker Worker-1 --json <exploration-result.json> --file <ledger>
  node scripts/work-queue.mjs block --worker Worker-1 --reason <reason> --file <ledger>
  complete/block accept --evidence <existing-typed-envelope.json>; required by evidenceContract
  node scripts/work-queue.mjs unblock|supersede|reassess --task <id> --reason <reason> --file <ledger>

Register the Challenge lead as Prep and up to three Worker-1..Worker-3 worktrees with worker-state first.
enable preserves the existing ledger; no live legacy execution may remain.
enqueue reads a JSON file, not inline JSON. Assignment schema and examples are
in .agents/architecture.md. The Challenge lead can enqueue exploration/rework for itself (stored recipient Prep);
The Work lead owns all other producer operations. claim atomically selects the next
prioritized task and switches a clean worker worktree to a new assignment branch.
It never resets dirty files or amends submitted commits. Complete implementation
through the existing verified worker-state submit --task <transport> command;
that automatically completes the execution assignment. complete freezes
exploration artifacts/check logs into <ledger>.results. Explicitly track running
handles with processes; completion/blocking refuses live commands.
No command launches agents, invents acceptance, or starts a second scheduler.
Only the Work lead may refresh mismatch evidence or reassess/unblock/supersede tasks.
next is read-only and contains private assignment paths; do not publish it raw.`;

const ensure = (value, message) => {if (!value) throw new Error(message);};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function git(root, ...args) {
    const result = spawnSync('git', ['-C', root, ...args], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
    ensure(result.status === 0, result.stderr || result.error?.message || 'Git command failed');
    return result.stdout.trim();
}
function committedBytes(root, revision, path) {
    const result = spawnSync('git', ['-C', root, 'show', `${revision}:${path}`], {maxBuffer: 32 * 1024 * 1024});
    ensure(result.status === 0, 'artifact must be committed at the reported revision');
    return result.stdout;
}
function readJSON(path) {return JSON.parse(readFileSync(path, 'utf8'));}
function clean(root) {
    ensure(git(root, 'status', '--porcelain', '--untracked-files=all') === '',
        'worker tree must be clean; preserve changes and finish commands before switching or submitting');
}
function freeze(file, packet) {
    const bytes = JSON.stringify(packet, null, 2) + '\n';
    const digest = hash(bytes), path = join(`${file}.results`, `${digest}.json`);
    mkdirSync(dirname(path), {recursive: true});
    if (existsSync(path)) ensure(readFileSync(path, 'utf8') === bytes, 'immutable packet differs');
    else writeFileSync(path, bytes, {flag: 'wx', mode: 0o444});
    return {path, digest};
}

export function queueCommand(command, options, root = realpathSync(process.cwd())) {
    ensure(git(root, 'rev-parse', '--show-toplevel') === root, 'run from the actual checkout root');
    ensure(options.file && resolve(options.file) === options.file, '--file must be an absolute shared ledger path');
    const file = options.file;
    const initial = summarizeLedger(readJSON(file));
    if (command === 'next') return {allocation: queueWork(initial),
        workers: initial.workers, tasks: initial.queue?.tasks ?? {}};
    const event = {id: `queue:${randomUUID()}`, type: command === 'complete' ? 'queue-result'
        : command === 'batch' ? 'queue-prep-branch' : `queue-${command}`,
        ...(['claim', 'processes', 'complete', 'block'].includes(command) ? {worker: options.worker} : {})};
    if (command === 'enqueue') {
        ensure(options.json, 'enqueue needs an assignment JSON file');
        event.assignment = readJSON(resolve(root, options.json));
    }
    const mutating = new Set(['enable', 'refresh', 'enqueue', 'batch', 'claim', 'processes', 'complete', 'block',
        'unblock', 'supersede', 'reassess']);
    ensure(mutating.has(command), USAGE);
    let result;
    updateLedger(file, root, current => {
        const state = summarizeLedger(current);
        if (command === 'enable') {
            ensure(root === state.coordinatorRoot && options.prep, 'only the Work lead enables the queue with --prep');
            event.prepRoot = realpathSync(options.prep);
            ensure(event.prepRoot !== root, 'Challenge lead needs its own producer worktree');
            ensure(state.workers.Prep?.worktree === event.prepRoot, 'register the Challenge lead producer worktree as Prep first');
            ensure(git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir')
                === git(event.prepRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
            'Challenge lead must belong to the same repository');
            event.base = git(root, 'rev-parse', 'HEAD');
        } else if (command === 'refresh') {
            ensure(root === state.coordinatorRoot && options.queue, 'only the Work lead refreshes queue evidence');
            const bytes = readFileSync(resolve(root, options.queue));
            const queue = JSON.parse(bytes);
            const issues = savedQueueIssues(queue, admittedBatchIds(root), readRows(join(root, 'SCORE.tsv')));
            ensure(!issues.length && !queue.selectionBlocked && !queue.blockers?.length,
                `current complete mismatch evidence required: ${issues.join('; ')}`);
            event.type = 'queue-refresh';
            event.base = queueBase(state);
            ensure(queueBaseEquivalent(state,git(root,'rev-parse','HEAD')), 'refresh at the accepted execution base or checked report descendant at HEAD');
            event.digest = hash(bytes);
            event.sessions = [...new Set(queue.sessions.map(row => row.session))];
            event.populate = true;
            event.regressions = queue.sessions.filter(row => row.regression).map(row => row.session);
            event.sources = Object.fromEntries(queue.sessions.map(entry => [entry.session, investigationReservations(entry)]));
        } else if (command === 'enqueue') {
            ensure(options.json, 'enqueue needs an assignment JSON file');
            ensure(event.assignment.producer === (root === state.coordinatorRoot ? 'Main' : 'Prep'),
                'producer must match the actual producer checkout');
            event.assignment.base = git(root, 'rev-parse', `${event.assignment.base}^{commit}`);
        } else if (command === 'batch') {
            ensure(root === state.queue.prepRoot && options.branch, 'batch branch changes run from the Challenge lead with --branch');
            event.type = 'queue-prep-branch';
            event.branch = options.branch;
            event.base = options.base ? git(root, 'rev-parse', `${options.base}^{commit}`) : queueBase(state);
            if (event.base !== queueBase(state)) {
                const task = Object.values(state.tasks).find(task => task.worker === 'Prep'
                    && task.status === 'changes-required' && task.deliveries.at(-1) === event.base);
                ensure(task, 'batch base must be the accepted base or an exact rejected challenge-batch delivery');
                event.resume = task.id;
            }
            const next = recordEvent(current, event);
            clean(root);
            git(root, 'switch', '-c', event.branch, event.base);
            result = summarizeLedger(next).workers.Prep;
            return next;
        } else if (['claim', 'processes', 'complete', 'block'].includes(command)) {
            event.worker = options.worker;
            const worker = state.workers[event.worker];
            ensure(worker?.worktree === root, 'command must run in the registered worker worktree');
            if (command === 'claim') {
                if (worker.assignment) {
                    result = state.queue.tasks[worker.assignment];
                    ensure(git(root, 'branch', '--show-current') === result.branch,
                        'claimed assignment branch differs; preserve and recover before retrying');
                    return current; // A retry attaches to its existing immutable assignment.
                }
                const next = queueWork(state).ready[0];
                if (!next) {result = {assignment: null, allocation: queueWork(state)}; return current;}
                const task = state.queue.tasks[next];
                const branchBase = task.resumeFrom ?? task.base;
                event.task = task.id;
                event.branch = `queue/${hash(JSON.stringify([current.runId, task.id]))}/attempt-${task.attempts.length + 1}`;
                event.selectionReason = queueWork(state).reason;
                // Validate ownership, dependencies and transport scope before checkout mutation.
                const proposed = recordEvent(current, event);
                clean(root);
                if (git(root, 'branch', '--show-current') === event.branch)
                    ensure(git(root, 'rev-parse', 'HEAD') === branchBase, 'recover the existing assignment branch before retrying claim');
                else git(root, 'switch', '-c', event.branch, branchBase);
                result = summarizeLedger(proposed).queue.tasks[next];
                return proposed;
            }
            ensure(worker.assignment, 'worker has no claimed assignment');
            event.task = worker.assignment;
            const task = state.queue.tasks[event.task];
            ensure(git(root, 'branch', '--show-current') === task.branch, 'assignment branch differs');
            if (command === 'processes') event.processes = readJSON(resolve(root, options.json));
            else {
                ensure(!task.processes.length, 'collect owned commands and clear process handles first');
                clean(root);
                const commit = git(root, 'rev-parse', 'HEAD');
                ensure(git(root, 'merge-base', '--is-ancestor', task.base, commit) === '', 'result must descend from assignment base');
                const evidence = readQueueEvidence(options.evidence && resolve(root, options.evidence), task, command, state);
                if (command === 'block') {
                    event.reason = options.reason;
                    event.base = commit;
                    event.packet = freeze(file, {task: task.id, worker: event.worker, branch: task.branch,
                        base: task.base, commit, reason: options.reason, ...(evidence ? {evidence} : {})}).path;
                } else {
                    ensure(task.output === 'exploration', 'use worker-state submit for implementation evidence');
                    const changed = git(root, 'diff', '--name-only', task.base, commit).split('\n').filter(Boolean);
                    ensure(changed.every(path => task.allowedPaths.some(prefix => path === prefix
                        || (prefix.endsWith('/') && path.startsWith(prefix)))), 'exploration commit changed files outside assignment scope');
                    const input = readJSON(resolve(root, options.json));
                    ensure(typeof input.summary === 'string' && Array.isArray(input.paths)
                        && task.artifacts.every(path => input.paths.includes(path)), 'result must include its declared artifacts and summary');
                    const paths = input.paths.map(path => {
                        ensure(typeof path === 'string' && !path.startsWith('/') && !path.split('/').includes('..')
                            && task.allowedPaths.some(prefix => path === prefix || (prefix.endsWith('/') && path.startsWith(prefix))),
                        'result artifact is outside assignment scope');
                        const blob = committedBytes(root, commit, path);
                        return {path, sha256: hash(blob)};
                    });
                    const checks = (input.checks ?? []).map(check => {
                        const observedFailure = task.purpose === 'support' && input.outcome === 'failure'
                            && Number.isInteger(check.exitCode) && check.exitCode > 0 && check.exitCode <= 255;
                        ensure((check.exitCode === 0 || observedFailure) && Array.isArray(check.command) && check.command.length
                            && typeof check.log === 'string' && lstatSync(check.log).isFile(), 'result check needs successful command and regular log');
                        return {...check, log: undefined, output: readFileSync(check.log, 'utf8')};
                    });
                    ensure(task.checks.every(kind => checks.some(check => check.kind === kind)), 'missing required result checks');
                    const packet = freeze(file, {task: task.id, worker: event.worker, base: task.base, commit,
                        branch: task.branch, summary: input.summary, outcome: input.outcome, paths, checks,
                        ...(evidence ? {evidence} : {})});
                    Object.assign(event, {type: 'queue-result', commit, digest: packet.digest,
                        packet: packet.path, outcome: input.outcome});
                }
            }
        } else {
            ensure(root === state.coordinatorRoot, 'only the Work lead changes task readiness');
            event.task = options.task;
            event.reason = options.reason;
            if (command === 'reassess') {
                event.base = queueBase(state);
                const recovery = state.queue.tasks[event.task]?.resumeFrom;
                if (recovery) git(root, 'merge-base', '--is-ancestor', event.base, recovery);
            }
        }
        if (state.queue) authorizeQueueEvent(state, root, event);
        const next = recordEvent(current, event);
        result = summarizeLedger(next).queue;
        return next;
    }, event);
    return result;
}

export function main(args = process.argv.slice(2)) {
    if (args.length === 1 && args[0] === '--help') return console.log(USAGE);
    const [command, ...rest] = args, options = {};
    for (let i = 0; i < rest.length; i += 2) {
        const key = rest[i]?.slice(2);
        ensure(['file', 'prep', 'queue', 'json', 'worker', 'task', 'reason', 'branch', 'base', 'evidence'].includes(key)
            && !Object.hasOwn(options, key) && rest[i + 1], USAGE);
        options[key] = rest[i + 1];
    }
    console.log(JSON.stringify(queueCommand(command, options), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {main();} catch (error) {console.error(`work-queue: ${error.message}`); process.exitCode = 1;}
}
