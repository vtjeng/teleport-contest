#!/usr/bin/env node
// Integrate and accept a frozen Prep group using one saved checkpoint. No replay or worker messages.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {git, isAncestor, preflightDelivery, readDelivery, verifyEvent} from './worker-delivery.mjs';
import {recordEvent, summarizeLedger, updateLedger} from './worker-state.mjs';
import {acceptedDependency} from './worker-backlog.mjs';
import {readCheckpointResult} from './checkpoint-results.mjs';
import {digest} from './challenge-results.mjs';
import {publishTask} from './task-handoff.mjs';
import {boundedMain} from './run-bounded.mjs';
import {integrateTaskCommits} from './integration-commits.mjs';

const USAGE = `Usage: node scripts/prep-handoff.mjs <plan|integrate|accept|publish> --ledger <shared-ledger>
  publish: --admission <hosted-receipt> [--queue <saved-work-queue>]

plan lists the consecutive ready Prep submissions whose dependencies are accepted
or in the group. integrate freezes that list, cherry-picks only its submitted
commits, preflights every packet, and records one shared integration. Run one hosted
checkpoint at the returned commit; accept consumes its saved result for all tasks.
Then admit and baseline all accepted batches with the hosted admission procedure.
publish uses one report commit and push for the group. No local scorer, replay,
source audit, worker message, or CI watch occurs. Retry after a crash; an unfinished
Git cherry-pick needs explicit resolution before retrying.`;

export function parsePrepArgs(args) {
    const [phase, ...rest] = args, options = {phase};
    if (!['plan', 'integrate', 'accept', 'publish'].includes(phase)) throw new Error(USAGE);
    for (let i = 0; i < rest.length; i += 2) {
        const key = rest[i]?.slice(2);
        if (rest[i] !== `--${key}` || !['ledger', ...(phase === 'publish' ? ['admission', 'queue'] : [])].includes(key)
            || !rest[i + 1] || rest[i + 1].startsWith('--') || Object.hasOwn(options, key)) throw new Error(USAGE);
        options[key] = rest[i + 1];
    }
    if (!options.ledger || (phase === 'publish' && !options.admission)) throw new Error(USAGE);
    return options;
}

function context(options, root) {
    root = resolve(root);
    const file = resolve(root, options.ledger);
    const ledger = JSON.parse(readFileSync(file, 'utf8')), state = summarizeLedger(ledger);
    if (state.coordinatorRoot !== root) throw new Error('only the coordinator may handle a Prep group');
    return {root, file, state};
}
const version = task => Number(task.reservations[0].split(':v')[1]);
const latest = (state, task) => state.deliveries[task.deliveries.at(-1)];

export function planPrepGroup(options, root = process.cwd()) {
    const ctx = context(options, root), tasks = [], deliveries = new Set();
    if (Object.values(ctx.state.tasks).some(task => ['integrating', 'validated'].includes(task.status)))
        throw new Error('finish the active integration before planning a Prep group');
    const pending = Object.values(ctx.state.tasks).filter(task => task.kind === 'challenge-preparation'
        && task.status !== 'accepted').sort((a, b) => version(a) - version(b));
    let held = null;
    for (const task of pending) {
        const delivery = latest(ctx.state, task);
        const blocked = delivery?.dependencies.filter(sha => !acceptedDependency(ctx.state, sha)
            && !deliveries.has(ctx.state.tasks[ctx.state.deliveries[sha]?.task]?.deliveries.at(-1)));
        if (task.status !== 'ready' || !delivery?.receivedAt || blocked?.length
            || (tasks.length && version(task) !== tasks.at(-1).version + 1)) {
            held = {task: task.id, status: task.status, reason: !delivery?.receivedAt ? 'receipt required'
                : blocked?.length ? 'unaccepted dependency outside the group'
                    : task.status !== 'ready' ? 'preparation is not ready' : 'missing earlier batch'};
            break;
        }
        const packet = readDelivery(delivery);
        if (!isDeepStrictEqual(packet.git.commits, delivery.commits)
            || delivery.paths.some(path => !path.startsWith(`challenges/cases/v${version(task)}/`)))
            throw new Error(`Prep delivery metadata or paths differ: ${task.id}`);
        tasks.push({task: task.id, version: version(task), delivery: delivery.delivery, commits: delivery.commits});
        deliveries.add(delivery.delivery);
    }
    return {version: 1, base: git(ctx.root, 'rev-parse', 'HEAD'), tasks, held};
}

function frozenGroup(ctx, plan = null) {
    const path = join(ctx.root, '.cache/prep-group.json');
    if (!existsSync(path)) throw new Error('integrate a Prep group first');
    plan ??= JSON.parse(readFileSync(path, 'utf8'));
    if (plan.version !== 1 || !Array.isArray(plan.tasks) || !plan.tasks.length)
        throw new Error('invalid frozen Prep group');
    for (const member of plan.tasks) {
        const task = ctx.state.tasks[member.task], delivery = task && latest(ctx.state, task);
        if (task?.kind !== 'challenge-preparation' || delivery?.delivery !== member.delivery
            || !isDeepStrictEqual(delivery.commits, member.commits) || version(task) !== member.version)
            throw new Error('frozen Prep submission changed; preserve the candidate and investigate');
    }
    return plan;
}

function saveGroup(ctx, plan) {
    const bytes = JSON.stringify(plan, null, 2) + '\n';
    mkdirSync(join(ctx.root, '.cache/prep-groups'), {recursive: true});
    writeFileSync(join(ctx.root, '.cache/prep-groups', `${digest(bytes)}.json`), bytes);
    writeFileSync(join(ctx.root, '.cache/prep-group.json'), bytes);
}

function checkGroupFiles(ctx, plan, commit, complete) {
    const expected = new Map(), permitted = new Map();
    for (const member of plan.tasks) {
        const task = ctx.state.tasks[member.task];
        for (const sha of task.deliveries) {
            const delivery = ctx.state.deliveries[sha];
            for (const path of delivery.paths) {
                const variants = permitted.get(path) ?? new Set();
                for (const source of [delivery.base, ...delivery.commits])
                    variants.add(git(ctx.root, 'ls-tree', source, '--', path));
                permitted.set(path, variants);
                expected.set(path, git(ctx.root, 'ls-tree', member.delivery, '--', path));
            }
        }
    }
    const changed = git(ctx.root, 'diff', '--name-only', plan.base, commit).split('\n').filter(Boolean);
    for (const path of new Set([...changed, ...(complete ? expected.keys() : [])])) {
        const blob = git(ctx.root, 'ls-tree', commit, '--', path);
        if (!permitted.get(path)?.has(blob) || (complete && expected.get(path) !== blob))
            throw new Error(`candidate file differs from the frozen Prep deliveries: ${path}`);
    }
}

export function integratePrepGroup(options, root = process.cwd()) {
    let ctx = context(options, root);
    if (git(ctx.root, 'status', '--porcelain')) throw new Error('integrate Prep from a clean worktree');
    if (existsSync(git(ctx.root, 'rev-parse', '--git-path', 'CHERRY_PICK_HEAD')))
        throw new Error('resolve the unfinished Git cherry-pick before retrying');
    const path = join(ctx.root, '.cache/prep-group.json');
    let plan;
    if (existsSync(path)) {
        plan = JSON.parse(readFileSync(path, 'utf8'));
        const members = plan.tasks.map(member => ctx.state.tasks[member.task]);
        if (members.every(task => task?.status === 'accepted')) plan = null;
        else if (members.every(task => task?.status === 'ready')) {
            // Feedback releases the sibling tasks. Re-freeze only this group's corrected
            // submissions, keeping its original base and excluding later arrivals.
            plan = {...plan, tasks: members.map(task => ({task: task.id, version: version(task),
                delivery: latest(ctx.state, task).delivery, commits: latest(ctx.state, task).commits}))};
            saveGroup(ctx, plan);
        } else plan = frozenGroup(ctx, plan);
    }
    if (!plan) {
        plan = planPrepGroup(options, ctx.root);
        if (!plan.tasks.length) return {commit: plan.base, tasks: [], held: plan.held};
        saveGroup(ctx, plan);
    }
    const tasks = plan.tasks.map(member => member.task);
    const head = git(ctx.root, 'rev-parse', 'HEAD');
    const active = plan.tasks.map(member => latest(ctx.state, ctx.state.tasks[member.task]));
    if (active.every(delivery => delivery.integration === head && isDeepStrictEqual(delivery.prepGroup, tasks)
        && ['integrating', 'validated', 'accepted'].includes(ctx.state.tasks[delivery.task].status)))
        return {commit: head, tasks, checkpointRequired: !active.every(delivery => delivery.acceptedAt)};
    if (!isAncestor(ctx.root, plan.base, head)) throw new Error('candidate no longer contains the frozen group base');
    checkGroupFiles(ctx, plan, head, false);
    if (plan.tasks.some(member => ctx.state.tasks[member.task].status !== 'ready'))
        throw new Error('finish the requested Prep corrections before retrying the group');
    for (const member of plan.tasks) integrateTaskCommits(ctx.root, ctx.state, member.task);
    const commit = git(ctx.root, 'rev-parse', 'HEAD');
    ctx = context(options, ctx.root);
    checkGroupFiles(ctx, plan, commit, true);
    const pendingPrep = new Set(plan.tasks.map(member => member.delivery));
    const preflight = tasks.map(taskId => preflightDelivery({root: ctx.root, state: ctx.state, taskId, commit, pendingPrep}));
    if (preflight.some(result => !result.passed)) throw new Error(`Prep group preflight failed: ${JSON.stringify(preflight)}`);
    updateLedger(ctx.file, ctx.root, ledger => {
        const state = summarizeLedger(ledger);
        for (const member of plan.tasks) if (state.tasks[member.task]?.deliveries.at(-1) !== member.delivery)
            throw new Error('Prep delivery changed during integration');
        return recordEvent(ledger, verifyEvent(ctx.root, state,
            {id: `prep-group-${digest(JSON.stringify(tasks))}-${commit}`, type: 'prep-integrating', tasks, integration: commit}));
    });
    return {commit, tasks, checkpointRequired: true, preflight};
}

export function acceptPrepGroup(options, root = process.cwd()) {
    const ctx = context(options, root), plan = frozenGroup(ctx);
    const commit = git(ctx.root, 'rev-parse', 'HEAD'), tasks = plan.tasks.map(member => member.task);
    if (git(ctx.root, 'status', '--porcelain')) throw new Error('accept Prep before adding admission or closure reports');
    for (const task of tasks) {
        const delivery = latest(ctx.state, ctx.state.tasks[task]);
        if (delivery.integration !== commit || !isDeepStrictEqual(delivery.prepGroup, tasks)
            || !['integrating', 'validated', 'accepted'].includes(ctx.state.tasks[task].status))
            throw new Error('all Prep tasks must share the integrated HEAD');
    }
    const summary = readCheckpointResult(ctx.root, commit), checkpoint = join(summary.artifacts, 'summary.json');
    if (summary.commit !== commit || summary.allPassed !== true) throw new Error('Prep group needs a passing checkpoint at HEAD');
    for (const taskId of tasks) {
        const delivery = latest(ctx.state, ctx.state.tasks[taskId]);
        if (delivery.checkpoint && delivery.checkpoint !== checkpoint) throw new Error('checkpoint changed; revalidate the Prep group');
    }
    updateLedger(ctx.file, ctx.root, ledger => {
        if (git(ctx.root, 'rev-parse', 'HEAD') !== commit) throw new Error('HEAD changed during Prep acceptance');
        const at = new Date().toISOString();
        for (const task of tasks) {
            const state = summarizeLedger(ledger), delivery = latest(state, state.tasks[task]);
            if (delivery.delivery !== plan.tasks.find(member => member.task === task).delivery)
                throw new Error('Prep delivery changed during acceptance');
            if (state.tasks[task].status === 'accepted') continue;
            if (state.tasks[task].status === 'integrating') ledger = recordEvent(ledger,
                verifyEvent(ctx.root, state, {id: `prep-validated-${task}-${commit}`, type: 'validated', task, passed: true, checkpoint}), at);
            ledger = recordEvent(ledger, {id: `prep-accepted-${task}-${commit}`, type: 'accepted', task}, at);
        }
        return ledger;
    });
    return {commit, tasks, checkpoint, next: 'Admit all accepted batches with the hosted admission procedure.'};
}

export function publishPrepGroup(options, root = process.cwd(), dependencies) {
    const ctx = context(options, root), plan = frozenGroup(ctx), tasks = plan.tasks.map(member => member.task);
    for (const task of tasks) if (ctx.state.tasks[task].status !== 'accepted') throw new Error('accept the entire Prep group before publishing');
    const result = publishTask({...options, task: tasks[0]}, ctx.root, dependencies);
    // The first task anchors the push; its published event also confirms the
    // other accepted deliveries covered by that commit in the same ledger update.
    return {...result, tasks};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        if (process.argv.slice(2).includes('--help')) console.log(USAGE);
        else {
            const options = parsePrepArgs(process.argv.slice(2));
            process.exitCode = await boundedMain('focused', () => {
                const handlers = {plan: planPrepGroup, integrate: integratePrepGroup, accept: acceptPrepGroup, publish: publishPrepGroup};
                console.log(JSON.stringify(handlers[options.phase](options), null, 2));
                return 0;
            });
        }
    } catch (error) {console.error(`prep-handoff: ${error.message}`); process.exitCode = 1;}
}
