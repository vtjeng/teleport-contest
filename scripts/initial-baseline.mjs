#!/usr/bin/env node
// Observe an already tested and published initial tooling baseline. No task is
// accepted, no claim is changed, and ordinary tooling publication keeps its gate.
import {createHash} from 'node:crypto';
import {closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
    readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {acceptedMain} from './worker-backlog.mjs';
import {checkpointResultsDirectory, readCheckpointResult} from './checkpoint-results.mjs';
import {git, isAncestor, resolveCommit, verifyPublicMain, verifyToolingChanges} from './worker-delivery.mjs';
import {recordEvent, summarizeLedger, updateLedger} from './worker-state.mjs';

const USAGE = `Usage (Work lead checkout root only):
  node scripts/initial-baseline.mjs --ledger <absolute-shared-ledger> --commit <published-SHA> --checkpoint <archived-summary.json>

Initialize accepted-main only when the unified ledger has no accepted baseline
and no active integration. The exact passing execution checkpoint must already
be archived and local and remote main must equal its commit. Only tooling and
bookkeeping changes may follow queue.initialBase. This observes a real initial
tooling publication; it accepts no delivery and never rewrites claims or bases.
The checkpoint is hash-frozen beside the shared ledger. Exact retries preserve
the first event and timestamp. Existing readers consume tooling-published;
ordinary tooling-published and implementation bootstrap keep their prior gates.`;

const ensure = (condition, message) => {if (!condition) throw new Error(message);};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function verifyFrozen(path, bytes) {
    const stat = lstatSync(path);
    ensure(stat.isFile() && !(stat.mode & 0o222) && readFileSync(path).equals(bytes),
        'initial baseline checkpoint snapshot changed; preserve and investigate');
}

export function parseInitialBaselineArgs(args) {
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index]?.slice(2);
        ensure(args[index]?.startsWith('--') && ['ledger', 'commit', 'checkpoint'].includes(key)
            && args[index + 1] && !args[index + 1].startsWith('--') && !Object.hasOwn(options, key), USAGE);
        options[key] = args[index + 1];
    }
    ensure(options.ledger && options.commit && options.checkpoint && isAbsolute(options.ledger), USAGE);
    return options;
}

function freeze(path, bytes) {
    mkdirSync(dirname(path), {recursive: true, mode: 0o700});
    if (existsSync(path)) {
        verifyFrozen(path, bytes);
        return;
    }
    const fd = openSync(path, 'wx', 0o444);
    try {writeFileSync(fd, bytes); fsyncSync(fd);} finally {closeSync(fd);}
    const directory = openSync(dirname(path), 'r');
    try {fsyncSync(directory);} finally {closeSync(directory);}
}

export function initializeBaseline(options, root = process.cwd()) {
    root = realpathSync(root);
    ensure(git(root, 'rev-parse', '--show-toplevel') === root, 'run from the actual Work lead checkout root');
    ensure(isAbsolute(options.ledger), '--ledger must be an absolute shared ledger path');
    const file = options.ledger, commit = resolveCommit(root, options.commit);
    const source = resolve(root, options.checkpoint);
    let receipt;
    updateLedger(file, root, ledger => {
        ensure(ledger?.coordinatorRoot === root, 'only the Work lead may initialize the baseline');
        const state = summarizeLedger(ledger);
        ensure(lstatSync(source).isFile(), 'initial baseline needs a regular archived checkpoint');
        const bytes = readFileSync(source), summary = JSON.parse(bytes);
        ensure(summary.allPassed === true && summary.commit === commit && summary.executionCommit === commit,
            'initial baseline requires a passing exact-execution checkpoint');
        ensure(typeof summary.artifacts === 'string'
            && dirname(summary.artifacts) === join(checkpointResultsDirectory(root), commit)
            && source === join(summary.artifacts, 'summary.json') && realpathSync(source) === source,
            'initial baseline must use its original archived checkpoint summary');
        ensure(isDeepStrictEqual(summary, readCheckpointResult(root, commit)),
            'initial baseline checkpoint differs from the latest archived result');
        const checkpoint = join(`${file}.baselines`, `${hash(bytes)}.json`);
        const event = {id: `initial-published-baseline-${commit}`, type: 'tooling-published',
            tested: commit, commit, checkpoint};
        const previous = ledger.events.find(row => row.id === event.id);
        if (previous) {
            const {at, ...payload} = previous;
            ensure(isDeepStrictEqual(payload, event), 'initial baseline retry differs from its original proof');
            verifyFrozen(checkpoint, bytes);
            receipt = {commit, checkpoint, observedAt: at, initialized: false};
            return ledger;
        }
        ensure(state.queue && !acceptedMain(state), 'initial baseline requires an enabled queue with no accepted history');
        ensure(!Object.values(state.tasks).some(task => ['integrating', 'validated'].includes(task.status)),
            'finish the active integration before initializing the baseline');
        ensure(isAncestor(root, state.queue.initialBase, commit),
            'initial baseline must descend from queue.initialBase');
        verifyToolingChanges(root, state.queue.initialBase, commit);
        // Check each intervening change too; reverting unaccepted game/corpus
        // edits must not turn their history into an initial tooling publication.
        for (const revision of git(root, 'rev-list', `${state.queue.initialBase}..${commit}`).split('\n').filter(Boolean)) {
            const parent = git(root, 'show', '-s', '--format=%P', revision).split(' ')[0];
            ensure(parent, 'initial baseline cannot introduce an unrelated root history');
            // Compare merge resolutions to their first parent. Other parents
            // can predate initialBase; their new commits are checked separately.
            verifyToolingChanges(root, parent, revision);
        }
        verifyPublicMain(root, commit);
        freeze(checkpoint, bytes);
        const next = recordEvent(ledger, event);
        receipt = {commit, checkpoint, observedAt: next.events.at(-1).at, initialized: true};
        return next;
    });
    return receipt;
}

function main(args) {
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) return console.log(USAGE);
    console.log(JSON.stringify(initializeBaseline(parseInitialBaselineArgs(args)), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {main(process.argv.slice(2));} catch (error) {console.error(error.message); process.exitCode = 1;}
}
