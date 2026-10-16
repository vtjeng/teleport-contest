#!/usr/bin/env node
// Preserve each opt-in scratch exploration recording before invoking the recorder.
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
    readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {isAbsolute, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {summarizeLedger} from './worker-state.mjs';

export const USAGE = `Usage (from the claimed worker's checkout root):
  node scripts/record-task-attempt.mjs --ledger <shared-ledger> \\
    --input <input-only-recipe.json> --history <material-history-label> --attempt <unique-label>

Opt-in for scratch-only typed exploration tasks. Task, worker, branch and base
come from the actual current claim. Every call creates a new exclusive directory
under .cache/recorder-attempts/<task>/<history>/<attempt> and records from a
read-only snapshot, never the mutable source recipe. Reusing an attempt refuses
before the recorder starts. Preserve every directory in the evidence envelope,
including failed/invalid attempts, empty logs and started-only interruptions.
History labels do not authorize more setups, retries or post-comparison changes.
The ordinary record-session.mjs interface is unchanged.
Output is a JSON receipt path and actual child outcome. Exit 0 requires child
exit 0 and a regular capture; failed recording remains failed. SIGKILL may leave
only the started receipt/partial files: preserve them, never infer success.`;

const ensure = (condition, message) => {if (!condition) throw new Error(message);};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const label = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/u.test(value);
function git(root, ...args) {
    const result = spawnSync('git', ['-C', root, ...args], {encoding: 'utf8'});
    ensure(result.status === 0, result.stderr || result.error?.message || 'Git command failed');
    return result.stdout.trim();
}
function within(root, path) {
    const pathRelative = relative(root, path);
    return pathRelative !== '..' && !pathRelative.startsWith('../') && !isAbsolute(pathRelative);
}
function writeNew(path, bytes, mode = 0o444) {
    const fd = openSync(path, 'wx', 0o600);
    try {writeFileSync(fd, bytes); fsyncSync(fd);} finally {closeSync(fd);}
    chmodSync(path, mode);
}
function writeJSON(path, value) {writeNew(path, JSON.stringify(value, null, 2) + '\n');}
function directory(path) {
    if (!existsSync(path)) mkdirSync(path, {mode: 0o700});
    const stat = lstatSync(path);
    ensure(stat.isDirectory() && !stat.isSymbolicLink(), 'attempt parents must be real directories');
}
function context(cwd, ledger) {
    const root = realpathSync(cwd);
    ensure(root === realpathSync(git(root, 'rev-parse', '--show-toplevel')), 'run from the actual worker checkout root');
    const state = summarizeLedger(JSON.parse(readFileSync(resolve(root, ledger), 'utf8')));
    const workers = Object.values(state.workers).filter(worker => worker.worktree === root
        && /^Worker-[1-3]$/u.test(worker.worker));
    ensure(workers.length === 1, 'a registered queue worker checkout is required');
    const worker = workers[0], task = state.queue?.tasks[worker.assignment];
    ensure(task?.status === 'claimed' && task.worker === worker.worker, 'the worker needs its own current claimed task');
    ensure(task.type === 'exploration' && task.evidenceContract?.version === 1
        && task.allowedPaths.length > 0 && task.allowedPaths.every(path => path === '.cache/'),
    'attempt preservation is opt-in for scratch-only typed exploration tasks');
    ensure(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u.test(task.id), 'invalid task identifier');
    const branch = git(root, 'branch', '--show-current'), commit = git(root, 'rev-parse', 'HEAD');
    ensure(branch === task.branch && branch === worker.branch, 'checkout branch differs from the authoritative claim');
    ensure(commit === task.base, 'scratch exploration must remain at its assigned base');
    ensure(git(root, 'status', '--porcelain', '--untracked-files=all') === '', 'preserve tracked changes before recording');
    return {root, task: task.id, worker: worker.worker, base: task.base, branch, commit};
}
function launch(command, {cwd, stdout, stderr, env}) {
    return new Promise((resolveChild, reject) => {
        let child;
        try {child = spawn(command[0], command.slice(1), {cwd, env, stdio: ['ignore', stdout, stderr]});}
        catch (error) {reject(error); return;}
        let spawnError;
        const forward = signal => {if (child.exitCode === null && child.signalCode === null) child.kill(signal);};
        const interrupt = () => forward('SIGINT'), terminate = () => forward('SIGTERM');
        process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
        child.once('error', error => {spawnError = error.message;});
        child.once('close', (exitCode, signal) => {
            process.off('SIGINT', interrupt); process.off('SIGTERM', terminate);
            resolveChild({exitCode, signal, ...(spawnError ? {error: spawnError} : {})});
        });
    });
}
function fileFact(path) {
    if (!existsSync(path)) return {present: false};
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return {present: true, error: 'not a regular file'};
    const bytes = readFileSync(path);
    chmodSync(path, 0o444);
    return {present: true, bytes: bytes.length, sha256: sha256(bytes)};
}

export async function recordTaskAttempt(options, dependencies = {}) {
    ensure(options.ledger && options.input, 'ledger and input are required');
    ensure(label(options.history) && label(options.attempt), 'history and attempt must be short filename labels');
    const observed = context(options.cwd ?? process.cwd(), options.ledger), {root} = observed;
    const input = resolve(root, options.input);
    ensure(lstatSync(input).isFile() && !lstatSync(input).isSymbolicLink()
        && within(root, realpathSync(input)), 'input must be a regular recipe within this checkout');
    // Read once: later editing/reusing the source path cannot change invoked bytes.
    const inputBytes = readFileSync(input), recipe = JSON.parse(inputBytes.toString('utf8'));
    ensure(Array.isArray(recipe.segments) && recipe.segments.length > 0
        && recipe.segments.every(segment => segment && typeof segment.moves === 'string'
            && !Object.hasOwn(segment, 'steps')), 'fresh attempts require an input-only recipe, without recorded steps');
    let parent = root;
    for (const part of ['.cache', 'recorder-attempts', observed.task, options.history]) {
        parent = join(parent, part); directory(parent);
    }
    const attemptDirectory = join(parent, options.attempt);
    // Nonrecursive exclusive allocation; never reuse, remove or repair an old attempt.
    mkdirSync(attemptDirectory, {mode: 0o700});
    const paths = Object.fromEntries(['input.snapshot.json', 'capture.session.json', 'stdout.log', 'stderr.log']
        .map(name => [name, join(attemptDirectory, name)]));
    writeNew(paths['input.snapshot.json'], inputBytes);
    const stdout = openSync(paths['stdout.log'], 'wx', 0o600), stderr = openSync(paths['stderr.log'], 'wx', 0o600);
    const recorder = dependencies.recorderScript ?? fileURLToPath(new URL('./record-session.mjs', import.meta.url));
    const command = [process.execPath, recorder, paths['input.snapshot.json'], paths['capture.session.json']];
    const started = {version: 1, status: 'started', ...observed, history: options.history, attempt: options.attempt,
        startedAt: new Date().toISOString(), originalInput: relative(root, input), inputSHA256: sha256(inputBytes), command};
    let outcome;
    try {
        writeJSON(join(attemptDirectory, 'started.json'), started);
        outcome = await (dependencies.launch ?? launch)(command, {cwd: root, stdout, stderr,
            env: dependencies.env ?? process.env});
    } catch (error) {outcome = {exitCode: null, signal: null, error: error.message};}
    finally {
        try {fsyncSync(stdout); fsyncSync(stderr);} finally {closeSync(stdout); closeSync(stderr);}
    }
    const files = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, fileFact(path)]));
    const intact = files['input.snapshot.json'].sha256 === started.inputSHA256;
    const succeeded = outcome.exitCode === 0 && !outcome.signal && !outcome.error && intact
        && files['capture.session.json'].present && !files['capture.session.json'].error;
    const receipt = {...started, status: succeeded ? 'completed' : 'failed', completedAt: new Date().toISOString(),
        child: outcome, inputSnapshotIntact: intact, files};
    const receiptPath = join(attemptDirectory, 'receipt.json');
    writeJSON(receiptPath, receipt);
    chmodSync(attemptDirectory, 0o555);
    return {receipt: receiptPath, task: observed.task, history: options.history, attempt: options.attempt,
        child: outcome, exitCode: succeeded ? 0 : outcome.exitCode || 1};
}

async function main(args) {
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {console.log(USAGE); return;}
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
        const name = args[index]?.slice(2);
        ensure(['ledger', 'input', 'history', 'attempt'].includes(name) && args[index] === `--${name}`
            && args[index + 1] && !Object.hasOwn(options, name), USAGE);
        options[name] = args[index + 1];
    }
    const result = await recordTaskAttempt(options);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.exitCode;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).catch(error => {console.error(error.message); process.exitCode = 2;});
}
