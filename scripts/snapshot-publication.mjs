// A deliberately narrower publication class than tooling-published. Old
// checkpoint measurements retain their original execution SHA and timestamp.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstatSync, readFileSync, realpathSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {acceptedMain, pendingMainWork} from './worker-backlog.mjs';
import {queueWork} from './assignment-queue.mjs';
import {executionTree} from './checkpoint-reuse.mjs';
import {checkpointResultsDirectory, readCheckpointResult} from './checkpoint-results.mjs';
import {buildDashboardSnapshot, developmentFromCheckpoint} from './dashboard-snapshot.mjs';
import {mainWorkLock, requireMainWorkAccess} from './main-work.mjs';
import {summarizeLedger} from './worker-state.mjs';
import {verifyPublicationChanges} from './worker-delivery.mjs';

const ensure = (value, message) => {if (!value) throw new Error(message);};
export const snapshotDigest = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, ...args) => execFileSync('git', args, {cwd:root, encoding:'utf8', maxBuffer:32*1024*1024}).trimEnd();
const ancestor = (root, a, b) => {
    try {git(root, 'merge-base', '--is-ancestor', a, b); return true;}
    catch (error) {if (error.status === 1) return false; throw error;}
};
export const snapshotRefreshLock = mainWorkLock;
export function requireNoSnapshotRefresh(root) {
    requireMainWorkAccess(root);
}

// Only closed, claimed independent discovery assignments. Self publication,
// activity, Main support, linked validation and capture time cannot cause ticks.
export function discoveryWatermark(payload) {
    const records = (payload?.records ?? []).filter(row => row.kind === 'discovery'
        && row.claimedAt && row.closedAt).sort((a,b) => a.id.localeCompare(b.id));
    return {digest:snapshotDigest(JSON.stringify(records)), count:records.length,
        latest:records.map(row => row.closedAt).sort().at(-1) ?? null};
}

// Completion activity has its own refresh trigger; discovery yield retains its
// narrower denominator. Claims, turn/connection chatter and timestamps alone
// cannot advance this watermark. Use only the sanitized public projection.
export function snapshotWatermark(snapshot) {
    const discovery = discoveryWatermark(snapshot.explorationYield);
    const claims = new Set((snapshot.activity?.events ?? []).filter(row => ['assign', 'resume'].includes(row.type)
        && row.kind === 'queue-execution' && row.output === 'exploration'
        && /^Worker-[123]$/u.test(row.worker)).map(row => `${row.runId}/${row.task}/${row.worker}`));
    const closures = (snapshot.activity?.events ?? []).filter(row => ['queue-complete', 'queue-block'].includes(row.type)
        && claims.has(`${row.runId}/${row.task}/${row.worker}`))
        .map(({runId, id, type, at, task, worker}) => ({runId, id, type, at, task, worker}))
        .sort((a,b) => `${a.runId}/${a.id}`.localeCompare(`${b.runId}/${b.id}`));
    return {digest:snapshotDigest(JSON.stringify({discovery:discovery.digest,closures})),
        count:discovery.count, closedWorkerExplorations:closures.length,
        latest:[discovery.latest,...closures.map(row=>row.at)].filter(Boolean).sort().at(-1) ?? null};
}

export function validatePublicSnapshot(snapshot, summary) {
    ensure(snapshot?.version === 1 && Number.isFinite(Date.parse(snapshot.capturedAt))
        && Date.parse(snapshot.capturedAt) <= Date.now()+60_000
        && snapshot.explorationYield?.schemaVersion === 1
        && snapshot.explorationYield.asOf === snapshot.capturedAt
        && Array.isArray(snapshot.explorationYield.records)
        && Array.isArray(snapshot.activity?.events)
        && snapshot.pendingMainWork && snapshot.workerReservations && snapshot.assignmentQueue,
    'invalid dashboard snapshot schema');
    const allowed = ['version','capturedAt','explorationYield','activity','pendingMainWork',
        'workerReservations','assignmentQueue','development'];
    ensure(Object.keys(snapshot).every(key => allowed.includes(key)), 'unexpected dashboard snapshot field');
    const text = JSON.stringify(snapshot);
    ensure(!/(?:\/workspace\/|\/tmp\/|session_id|exec-session|BEGIN [A-Z ]*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20,})/u.test(text),
        'private data in dashboard snapshot');
    const walk = value => {
        if (!value || typeof value !== 'object') return;
        for (const [key, item] of Object.entries(value)) {
            ensure(!['handle','processes','worktree','coordinatorRoot','privateKey'].includes(key),
                `private ownership field in dashboard snapshot: ${key}`);
            walk(item);
        }
    };
    walk(snapshot);
    const bytes = readFileSync(join(summary.artifacts, 'session-results.json'));
    ensure(isDeepStrictEqual(snapshot.development,
        developmentFromCheckpoint(summary, JSON.parse(bytes), bytes)),
    'dashboard development evidence differs from original checkpoint');
    return snapshotWatermark(snapshot);
}

export function snapshotReadiness(state, {started = false} = {}) {
    if (!state.queue || !acceptedMain(state)) return 'accepted unified baseline required';
    if (Object.values(state.tasks).some(task => ['integrating','validated','accepted'].includes(task.status)
        && !state.deliveries[task.deliveries?.at(-1)]?.publishedCommit)) return 'active integration/validation/publication';
    if (!started && pendingMainWork(state).deliveries.some(row => row.status === 'ready' && !row.blockedBy.length))
        return 'ready delivery needs Work lead review';
    if (Object.values(state.tasks).some(task => ['review','admission','baseline'].includes(task.activity?.phase)))
        return 'active Work lead review/admission/baseline';
    if (!started && queueWork(state).ready.some(id => state.queue.tasks[id].output === 'implementation'))
        return 'ready implementation needs Work lead';
    return null;
}

export function verifySnapshotPublication(root, state, proof, {published = false, started = false} = {}) {
    const anchor = acceptedMain(state);
    // A newly arrived ready delivery must not strand a report whose exact
    // proposal already owns the Main boundary, especially after remote push.
    ensure(!snapshotReadiness(state,{started:started || published}), snapshotReadiness(state,{started:started || published}));
    ensure(anchor.commit === proof.anchor && anchor.checkpoint === proof.checkpoint,
        'snapshot refresh needs latest accepted anchor and its checkpoint');
    const summary = JSON.parse(readFileSync(proof.checkpoint));
    ensure(summary.allPassed === true && summary.commit === proof.tested
        && summary.executionCommit === proof.tested, 'snapshot refresh needs original passing exact execution proof');
    ensure(proof.checkpoint === join(summary.artifacts, 'summary.json')
        && realpathSync(proof.checkpoint) === proof.checkpoint
        && summary.artifacts.startsWith(join(checkpointResultsDirectory(root), proof.tested) + '/'),
    'snapshot refresh requires original imported checkpoint archive');
    ensure(isDeepStrictEqual(summary, readCheckpointResult(root, proof.tested)), 'snapshot checkpoint differs from imported proof');
    ensure(ancestor(root, proof.tested, proof.anchor) && ancestor(root, proof.anchor, proof.commit)
        && proof.anchor !== proof.commit, 'snapshot history must descend from proof and distinct accepted anchor');
    // Acceptance can append checked evaluation/investigation reports. Reuse
    // its existing publication verifier without broadening checkpoint reuse.
    verifyPublicationChanges(root, proof.tested, proof.anchor);
    ensure(executionTree(root, proof.anchor) === executionTree(root, proof.commit),
    'snapshot refresh execution tree changed');
    // Check EVERY commit as well as the final diff; reverted unrelated changes
    // and merges cannot smuggle unaccepted source or bookkeeping into Main.
    for (const revision of git(root, 'rev-list', `${proof.anchor}..${proof.commit}`).split('\n')) {
        const parents = git(root, 'show', '-s', '--format=%P', revision).split(' ');
        ensure(parents.length === 1, 'snapshot refresh must be linear');
        ensure(git(root, 'diff', '--name-only', '--no-renames', parents[0], revision) === 'dashboard-snapshot.json',
            'snapshot refresh permits only dashboard-snapshot.json');
    }
    ensure(git(root, 'ls-tree', proof.commit, '--', 'dashboard-snapshot.json').startsWith('100644 blob '),
        'snapshot refresh needs regular non-executable snapshot');
    const bytes = Buffer.from(git(root, 'show', `${proof.commit}:dashboard-snapshot.json`) + '\n');
    ensure(snapshotDigest(bytes) === proof.snapshotSha256, 'snapshot refresh bytes differ from proposal');
    const snapshot = JSON.parse(bytes);
    const watermark = validatePublicSnapshot(snapshot, summary);
    const previous = JSON.parse(git(root, 'show', `${proof.anchor}:dashboard-snapshot.json`));
    ensure(state.ledger && typeof proof.through === 'string', 'actual ledger prefix required');
    const through = state.ledger.events.findIndex(event => event.id === proof.through);
    ensure(through >= 0, 'unknown captured ledger event');
    const prefix = {...state.ledger,events:state.ledger.events.slice(0,through+1)};
    const capturedBytes = readFileSync(proof.prefix);
    ensure(realpathSync(proof.prefix) === proof.prefix && lstatSync(proof.prefix).isFile()
        && !(lstatSync(proof.prefix).mode & 0o222)
        && snapshotDigest(capturedBytes) === proof.ledgerSha256
        && isDeepStrictEqual(JSON.parse(capturedBytes),prefix), 'captured prefix differs from actual ledger history');
    ensure(acceptedMain(summarizeLedger(prefix))?.commit === proof.anchor,
        'captured prefix must include latest accepted anchor');
    ensure(prefix.events.every(event => Date.parse(event.at) <= Date.parse(snapshot.capturedAt)),
        'snapshot capture precedes included ledger event');
    const auditIndex = JSON.parse(git(root,'show',`${proof.anchor}:scripts/exploration-yield-audit.json`));
    const projected = buildDashboardSnapshot({ledger:prefix,summary,
        resultBytes:readFileSync(join(summary.artifacts,'session-results.json')),
        previous,capturedAt:snapshot.capturedAt,auditIndex},root);
    ensure(isDeepStrictEqual(snapshot,projected), 'public snapshot differs from captured ledger projection');
    ensure(Date.parse(snapshot.capturedAt) > Date.parse(previous.capturedAt), 'snapshot capture must advance');
    ensure(watermark.digest === proof.watermark
        && watermark.digest !== snapshotWatermark(previous).digest,
    'snapshot refresh has no meaningful completed exploration change');
    ensure(/^[a-f0-9]{64}$/u.test(proof.ledgerSha256) && typeof proof.through === 'string' && proof.through,
        'snapshot refresh needs captured ledger prefix identity');
    if (published) {
        const journal = JSON.parse(readFileSync(join(dirname(mainWorkLock(root)),'dashboard-refresh','state.json')));
        const keys = ['anchor','tested','commit','checkpoint','snapshotSha256','watermark','through','ledgerSha256','prefix'];
        ensure(isDeepStrictEqual(journal.proposal?.proof,Object.fromEntries(keys.map(key=>[key,proof[key]]))),
            'snapshot publication requires exact pending proposal journal');
        ensure(git(root, 'branch','--show-current') === 'main'
            && git(root, 'rev-parse','HEAD') === proof.commit
            && git(root, 'rev-parse','refs/heads/main') === proof.commit, 'snapshot publication needs exact local Main');
        ensure(!git(root,'status','--porcelain','--untracked-files=all'),'snapshot publication needs clean Main');
        ensure(git(root, 'ls-remote','--exit-code','https://github.com/vtjeng/teleport-contest.git','refs/heads/main')
            .split(/\s/u)[0] === proof.commit, 'snapshot publication needs exact remote Main');
    }
    return {summary, snapshot, watermark};
}

