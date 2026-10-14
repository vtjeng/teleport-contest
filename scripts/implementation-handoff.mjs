#!/usr/bin/env node
// One frozen implementation candidate, checkpoint and publication. No replay or worker messages.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {git, isAncestor, preflightDelivery, readDelivery, syncMain, verifyEvent, verifyPublicationChanges} from './worker-delivery.mjs';
import {recordEvent, summarizeLedger, updateLedger} from './worker-state.mjs';
import {acceptedDependency, acceptedMain, pendingMainWork} from './worker-backlog.mjs';
import {digest} from './challenge-results.mjs';
import {integrateTaskCommits} from './integration-commits.mjs';
import {acceptTasks} from './accept-task.mjs';
import {publishTask} from './task-handoff.mjs';
import {boundedMain} from './run-bounded.mjs';

const USAGE = `Usage: node scripts/implementation-handoff.mjs <plan|integrate|accept|publish|split> --ledger <shared-ledger>
  split: --tasks <comma-separated-task-ids>
  publish: [--queue <saved-work-queue>] [--admission <hosted-receipt>]

integrate freezes all dependency-ready, scope-compatible received implementations
on an integration-checkpoint candidate branch. There is no task-count cap.
Run one hosted checkpoint at the returned commit, import it once, then accept.
Every target uses the frozen accepted baseline; any rejection accepts no tasks.
publish fast-forwards local main and publishes one report commit for the group.
After a failed group, split builds a selected subset from the original base on
a new candidate branch, preserving the failed branch and every held submission.
Wait for CI to finish before splitting. Resolve any unfinished cherry-pick first.
New arrivals wait for the next group. No worker messages or game replay occur.`;

export function parseImplementationArgs(args) {
    const [phase, ...rest] = args, options = {phase};
    const extra = {plan: [], integrate: [], accept: [], publish: ['queue', 'admission'], split: ['tasks']};
    if (!Object.hasOwn(extra, phase)) throw new Error(USAGE);
    for (let i = 0; i < rest.length; i += 2) {
        const key = rest[i]?.slice(2);
        if (rest[i] !== `--${key}` || !['ledger', ...extra[phase]].includes(key)
            || !rest[i + 1] || rest[i + 1].startsWith('--') || Object.hasOwn(options, key)) throw new Error(USAGE);
        options[key] = rest[i + 1];
    }
    if (!options.ledger || (phase === 'split' && !options.tasks)) throw new Error(USAGE);
    return options;
}

function context(options, root) {
    root = resolve(root);
    const file = resolve(root, options.ledger), state = summarizeLedger(JSON.parse(readFileSync(file, 'utf8')));
    if (state.coordinatorRoot !== root) throw new Error('only the coordinator may handle an implementation group');
    return {root, file, state};
}
const latest = (state, task) => state.deliveries[task.deliveries.at(-1)];
const path = ctx => join(ctx.root, '.cache/implementation-group.json');
const members = (state, tasks) => tasks.map(task => ({task: task.id, delivery: latest(state, task).delivery,
    revisions: [...task.deliveries], commits: latest(state, task).commits}));
const dependencies = (state, task) => [...new Set(task.deliveries.flatMap(sha => state.deliveries[sha].dependencies))];

function orderTasks(state, candidates) {
    const tasks = [], included = new Set(), remaining = [...candidates];
    while (remaining.length) {
        const index = remaining.findIndex(task => dependencies(state, task).every(sha => acceptedDependency(state, sha)
            || included.has(state.deliveries[sha]?.task)));
        if (index < 0) break;
        const [task] = remaining.splice(index, 1);
        // Overlapping reservations are permitted only along a declared dependency.
        const conflict = tasks.find(other => task.reservations.some(key => other.reservations.includes(key))
            && !dependsOn(state, task, other.id));
        if (conflict) continue;
        tasks.push(task); included.add(task.id);
    }
    return tasks;
}

function dependsOn(state, task, id, seen = new Set()) {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return dependencies(state, task).some(sha => {
        const required = state.tasks[state.deliveries[sha]?.task];
        return required && (required.id === id || dependsOn(state, required, id, seen));
    });
}

export function planImplementationGroup(options, root = process.cwd()) {
    const ctx = context(options, root);
    if (Object.values(ctx.state.tasks).some(task => ['integrating', 'validated'].includes(task.status)))
        throw new Error('finish the active integration before planning a group');
    const base = git(ctx.root, 'rev-parse', 'HEAD'), accepted = acceptedMain(ctx.state);
    if (git(ctx.root, 'branch', '--show-current') !== 'main' || !accepted?.checkpoint
        || !isAncestor(ctx.root, accepted.commit, base))
        throw new Error('start an implementation group from accepted local main');
    verifyPublicationChanges(ctx.root, accepted.commit, base);
    const pending = pendingMainWork(ctx.state).deliveries.filter(row => row.kind === 'implementation');
    pending.sort((a, b) => b.unblocks - a.unblocks || a.since.localeCompare(b.since));
    const candidates = pending.map(row => ctx.state.tasks[row.task])
        .filter(task => task.status === 'ready' && latest(ctx.state, task).receivedAt);
    const tasks = orderTasks(ctx.state, candidates), included = new Set(tasks.map(task => task.id));
    for (const task of tasks) readDelivery(latest(ctx.state, task));
    return {version: 1, base, baseline: accepted.checkpoint, tasks: members(ctx.state, tasks),
        held: pending.filter(row => !included.has(row.task)).map(row => ({task: row.task,
            reason: row.status !== 'ready' ? row.status : !latest(ctx.state, ctx.state.tasks[row.task]).receivedAt
                ? 'receipt required' : 'dependency or reserved scope outside the group'}))};
}

function readPlan(ctx) {
    if (!existsSync(path(ctx))) throw new Error('integrate an implementation group first');
    const plan = JSON.parse(readFileSync(path(ctx), 'utf8'));
    if (plan.version !== 1 || !plan.tasks?.length || !plan.baseline
        || !plan.branch?.startsWith('integration-checkpoint/implementation-')) throw new Error('invalid frozen implementation group');
    return plan;
}

function checkSubmissions(ctx, plan) {
    for (const member of plan.tasks) {
        const task = ctx.state.tasks[member.task], delivery = task && latest(ctx.state, task);
        if (task?.kind !== 'implementation' || delivery?.delivery !== member.delivery
            || !isDeepStrictEqual(task.deliveries, member.revisions) || !isDeepStrictEqual(delivery.commits, member.commits))
            throw new Error('frozen implementation submission changed; finish its corrections before retrying');
    }
}

function savePlan(ctx, plan) {
    const bytes = JSON.stringify(plan, null, 2) + '\n';
    mkdirSync(join(ctx.root, '.cache/implementation-groups'), {recursive: true});
    writeFileSync(join(ctx.root, '.cache/implementation-groups', `${digest(bytes)}.json`), bytes);
    writeFileSync(path(ctx), bytes);
}

function createCandidate(ctx, plan) {
    if (git(ctx.root, 'status', '--porcelain')) throw new Error('candidate creation requires a clean worktree');
    const branch = `integration-checkpoint/implementation-${digest(JSON.stringify(plan)).slice(0, 16)}`;
    // Refuse an existing name rather than rewriting its history.
    plan = {...plan, branch}; savePlan(ctx, plan);
    git(ctx.root, 'switch', '-c', branch, plan.base);
    return plan;
}

function resumeCandidate(ctx, plan) {
    const current = git(ctx.root, 'branch', '--show-current');
    if (current === plan.branch) return;
    if (!['main', plan.retryOf, plan.splitFrom].includes(current)
        || git(ctx.root, 'rev-parse', 'main') !== plan.base)
        throw new Error('checkout changed while creating the candidate; preserve it and investigate');
    const exists = git(ctx.root, 'for-each-ref', '--format=%(refname)', `refs/heads/${plan.branch}`);
    if (exists) git(ctx.root, 'switch', plan.branch);
    else git(ctx.root, 'switch', '-c', plan.branch, plan.base);
}

function checkCandidateBranch(ctx, plan) {
    if (git(ctx.root, 'branch', '--show-current') !== plan.branch
        || !isAncestor(ctx.root, plan.base, git(ctx.root, 'rev-parse', 'HEAD'))
        || git(ctx.root, 'rev-parse', 'main') !== plan.base)
        throw new Error('candidate branch or accepted main changed; preserve the candidate and investigate');
}

export function integrateImplementationGroup(options, root = process.cwd()) {
    let ctx = context(options, root), plan = existsSync(path(ctx)) ? readPlan(ctx) : null;
    if (git(ctx.root, 'status', '--porcelain')) throw new Error('integrate implementations from a clean worktree');
    if (existsSync(git(ctx.root, 'rev-parse', '--git-path', 'CHERRY_PICK_HEAD')))
        throw new Error('resolve the unfinished cherry-pick before retrying');
    if (plan && plan.tasks.every(member => ctx.state.tasks[member.task]?.status === 'accepted')) {
        if (git(ctx.root, 'branch', '--show-current') !== 'main') throw new Error('publish the accepted group before starting another');
        plan = null;
    }
    if (!plan) {
        plan = planImplementationGroup(options, ctx.root);
        if (!plan.tasks.length) return {commit: plan.base, tasks: [], held: plan.held};
        plan = createCandidate(ctx, plan);
    }
    resumeCandidate(ctx, plan); checkCandidateBranch(ctx, plan);
    const tasks = plan.tasks.map(member => member.task), head = git(ctx.root, 'rev-parse', 'HEAD');
    const submitted = tasks.map(id => latest(ctx.state, ctx.state.tasks[id]));
    if (submitted.every(delivery => delivery.integration === head && isDeepStrictEqual(delivery.implementationGroup, tasks)
        && ['integrating', 'validated'].includes(ctx.state.tasks[delivery.task].status))) {
        checkSubmissions(ctx, plan);
        return {commit: head, branch: plan.branch, tasks, checkpointRequired: true};
    }
    if (tasks.some(id => ctx.state.tasks[id]?.status !== 'ready')) throw new Error('finish the frozen group corrections before retrying');
    const corrected = members(ctx.state, tasks.map(id => ctx.state.tasks[id]));
    if (!isDeepStrictEqual(corrected, plan.tasks)) {
        plan = createCandidate(ctx, {...plan, tasks: corrected, retryOf: plan.branch});
    }
    checkSubmissions(ctx, plan);
    for (const task of tasks) integrateTaskCommits(ctx.root, ctx.state, task);
    const commit = git(ctx.root, 'rev-parse', 'HEAD');
    ctx = context(options, ctx.root); checkSubmissions(ctx, plan);
    const pendingGroup = new Set(plan.tasks.map(member => member.delivery));
    const preflight = tasks.map(taskId => preflightDelivery({root: ctx.root, state: ctx.state, taskId, commit, pendingGroup}));
    if (preflight.some(result => !result.passed)) throw new Error(`implementation group preflight failed: ${JSON.stringify(preflight)}`);
    updateLedger(ctx.file, ctx.root, ledger => {
        const state = summarizeLedger(ledger); checkSubmissions({...ctx, state}, plan);
        return recordEvent(ledger, verifyEvent(ctx.root, state, {id: `implementation-group-${commit}-${digest(JSON.stringify(tasks))}`,
            type: 'implementation-integrating', tasks, integration: commit}));
    });
    return {commit, branch: plan.branch, tasks, held: plan.held, checkpointRequired: true, preflight};
}

export function acceptImplementationGroup(options, root = process.cwd()) {
    const ctx = context(options, root), plan = readPlan(ctx); checkSubmissions(ctx, plan);
    checkCandidateBranch(ctx, plan);
    return {tasks: acceptTasks({...options, baseline: plan.baseline}, plan.tasks.map(member => member.task), ctx.root)};
}

export function splitImplementationGroup(options, root = process.cwd()) {
    let ctx = context(options, root), plan = readPlan(ctx); checkCandidateBranch(ctx, plan); checkSubmissions(ctx, plan);
    if (git(ctx.root, 'status', '--porcelain')) throw new Error('preserve or commit candidate edits before splitting');
    if (existsSync(git(ctx.root, 'rev-parse', '--git-path', 'CHERRY_PICK_HEAD')))
        throw new Error('resolve the unfinished cherry-pick before splitting');
    if (ctx.state.coordinator.processes.length) throw new Error('finish the active validation before splitting');
    const requested = options.tasks.split(','), ids = plan.tasks.map(member => member.task);
    if (!requested.length || new Set(requested).size !== requested.length || requested.some(id => !ids.includes(id))
        || requested.length >= ids.length) throw new Error('split requires a nonempty proper subset of the frozen group');
    const chosen = ids.filter(id => requested.includes(id)).map(id => ctx.state.tasks[id]);
    if (orderTasks(ctx.state, chosen).length !== chosen.length) throw new Error('split subset excludes a required dependency');
    const active = ids.filter(id => ['integrating', 'validated'].includes(ctx.state.tasks[id].status));
    if (active.length) updateLedger(ctx.file, ctx.root, ledger => recordEvent(ledger, {
        id: `implementation-released-${digest(JSON.stringify(ids))}-${git(ctx.root, 'rev-parse', 'HEAD')}`,
        type: 'implementation-released', tasks: ids, integration: git(ctx.root, 'rev-parse', 'HEAD'),
        reason: 'Split failed candidate; submissions remain queued.'}));
    ctx = context(options, ctx.root);
    if (ids.some(id => ctx.state.tasks[id].status !== 'ready')) throw new Error('finish corrections before splitting');
    createCandidate(ctx, {...plan, tasks: members(ctx.state, chosen), splitFrom: plan.branch,
        held: [...plan.held, ...ids.filter(id => !requested.includes(id)).map(task => ({task, reason: 'held out of split candidate'}))]});
    return integrateImplementationGroup(options, ctx.root);
}

export function publishImplementationGroup(options, root = process.cwd(), dependencies) {
    const ctx = context(options, root), plan = readPlan(ctx); checkSubmissions(ctx, plan);
    const tasks = plan.tasks.map(member => member.task);
    if (tasks.some(id => ctx.state.tasks[id].status !== 'accepted')) throw new Error('accept the entire group before publishing');
    const commit = latest(ctx.state, ctx.state.tasks[tasks[0]]).integration;
    verifyPublicationChanges(ctx.root, commit, git(ctx.root, 'rev-parse', 'HEAD'), options.admission);
    const head = git(ctx.root, 'rev-parse', 'HEAD');
    // A retry may already be on main with valid, uncommitted closure reports.
    // Synchronization is unnecessary then and would reject those reports.
    if (git(ctx.root, 'rev-parse', 'main') !== head) syncMain(ctx.root, head);
    git(ctx.root, 'switch', 'main');
    return {...publishTask({...options, task: tasks[0]}, ctx.root, dependencies), tasks};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        if (process.argv.slice(2).includes('--help')) console.log(USAGE);
        else {
            const options = parseImplementationArgs(process.argv.slice(2));
            process.exitCode = await boundedMain('focused', () => {
                const handlers = {plan: planImplementationGroup, integrate: integrateImplementationGroup,
                    accept: acceptImplementationGroup, split: splitImplementationGroup, publish: publishImplementationGroup};
                console.log(JSON.stringify(handlers[options.phase](options), null, 2)); return 0;
            });
        }
    } catch (error) {console.error(`implementation-handoff: ${error.message}`); process.exitCode = 1;}
}
