#!/usr/bin/env node
// WL-local observer, not a hosted timer or live feed. No gameplay execution.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
    realpathSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {acceptedMain} from './worker-backlog.mjs';
import {recordEvent, summarizeLedger, updateLedger} from './worker-state.mjs';
import {verifyEvent} from './worker-delivery.mjs';
import {buildExplorationYieldPayload} from './exploration-yield.mjs';
import {activityFromLedger, mergeActivity, writeDashboardSnapshot} from './dashboard-snapshot.mjs';
import {checkPublishedCI} from './check-published-ci.mjs';
import {snapshotWatermark, snapshotDigest, snapshotReadiness, snapshotRefreshLock,
    validatePublicSnapshot, verifySnapshotPublication} from './snapshot-publication.mjs';

export const REFRESH_INTERVAL_MS = 15*60*1000;
const ensure = (condition, message) => {if (!condition) throw new Error(message);};
const json = file => JSON.parse(readFileSync(file));
const git = (root, args, options = {}) => execFileSync('git', args,
    {cwd:root, encoding:'utf8', maxBuffer:32*1024*1024, ...options}).trimEnd();
function save(file, value) {
    const temp = `${file}.${randomUUID()}.tmp`, fd = openSync(temp, 'wx', 0o600);
    try {writeFileSync(fd, JSON.stringify(value,null,2)+'\n'); fsyncSync(fd);} finally {closeSync(fd);}
    renameSync(temp,file);
}
export function withRefreshLock(file, action) {
    const fd = openSync(file,'wx',0o600), token = randomUUID();
    try {writeFileSync(fd,JSON.stringify({kind:'snapshot-refresh',pid:process.pid,token,startedAt:new Date().toISOString()})); fsyncSync(fd); return action();}
    finally {
        closeSync(fd);
        ensure(json(file).token === token, 'refresh lock owner changed; inspect before recovery');
        unlinkSync(file);
    }
}
function commandLog(root, args, path) {
    const fd = openSync(path,'w',0o600);
    try {execFileSync(process.execPath,args,{cwd:root,stdio:['ignore',fd,fd]});} finally {closeSync(fd);}
}
function defaults(root, ledger, directory) {
    return {
        git:args => git(root,args),
        ci:options => checkPublishedCI(options),
        snapshot:(prefix, checkpoint, output) => writeDashboardSnapshot({ledger:prefix,checkpoint,output},root),
        record:proof => updateLedger(ledger,root,current => {
            const event = {id:`snapshot-published-${proof.commit}`,type:'snapshot-published',...proof};
            const previous = current.events.find(row => row.id === event.id);
            if (previous) {
                const {at:_at,...saved} = previous;
                ensure(isDeepStrictEqual(saved,event),'refresh recovery differs from published event');
                return current;
            }
            return recordEvent(current,verifyEvent(root,summarizeLedger(current),event));
        }),
        refresh:() => {
            // Reports do not advance the execution queue base. The supported
            // read verifies pending eligibility without rebasing any plan or
            // live claim, rescanning gameplay, or fabricating new evidence.
            commandLog(root,['scripts/work-queue.mjs','next','--file',ledger],join(directory,'queue-next.json'));
        },
        push:commit => git(root,['push','--','https://github.com/vtjeng/teleport-contest.git',`${commit}:refs/heads/main`]),
        remote:() => git(root,['ls-remote','--exit-code','https://github.com/vtjeng/teleport-contest.git','refs/heads/main']).split(/\s/u)[0],
    };
}
const readLedger = (file,root) => {
    const ledger = json(file);
    ensure(ledger.coordinatorRoot === root,'only the registered Work lead checkout may refresh');
    return {ledger,state:summarizeLedger(ledger)};
};
function safeMain(io, expected) {
    ensure(io.git(['branch','--show-current']) === 'main','refresh defers outside Main');
    ensure(io.git(['rev-parse','HEAD']) === expected,'refresh HEAD changed; preserve work and inspect');
    ensure(!io.git(['status','--porcelain','--untracked-files=all']), 'refresh defers for dirty/untracked working tree');
}

// Exposed pure decision permits tests without time, network or gameplay.
export function refreshDecision(previous, projection, pending, now) {
    const watermark = snapshotWatermark(projection);
    if (watermark.digest === snapshotWatermark(previous).digest)
        return {action:'unchanged',watermark,pending:null};
    const firstSeen = pending?.firstSeen ?? now;
    return {action:now-firstSeen >= REFRESH_INTERVAL_MS ? 'due' : 'coalescing',watermark,
        pending:{firstSeen,watermark:watermark.digest,throughAt:watermark.latest}};
}

function repairExactSnapshot(io, root, proof, bytes) {
    // Crash after CAS-ref but before index/worktree update: repair only bytes
    // that are EXACTLY old or proposed, never stash/reset user modifications.
    ensure(io.git(['rev-parse','HEAD']) === proof.commit,'pending refresh HEAD changed; inspect journal');
    const dirty = io.git(['status','--porcelain','--untracked-files=all']);
    ensure(dirty.split('\n').filter(Boolean).every(row => row.slice(3) === 'dashboard-snapshot.json'),
        'pending refresh has unrelated dirty files; inspect journal');
    const path = join(root,'dashboard-snapshot.json');
    const current = readFileSync(path), old = Buffer.from(io.git(['show',`${proof.anchor}:dashboard-snapshot.json`])+'\n');
    ensure(current.equals(bytes) || current.equals(old),'pending snapshot was edited; preserve and inspect');
    const index = io.git(['ls-files','-s','--','dashboard-snapshot.json']);
    const allowed = [proof.anchor,proof.commit].map(commit => io.git(['ls-tree',commit,'--','dashboard-snapshot.json']).split(/\s/u)[2]);
    ensure(index.startsWith('100644 ') && allowed.includes(index.split(/\s/u)[1]),'pending snapshot index changed');
    io.git(['restore','--source',proof.commit,'--staged','--worktree','--','dashboard-snapshot.json']);
}

export function refreshOnce({ledger:ledgerPath, root = process.cwd(), now = Date.now(), observe = false}, injected = {}) {
    root = realpathSync(root); ledgerPath = resolve(ledgerPath);
    ensure(git(root,['rev-parse','--show-toplevel']) === root,'run refresh from Work lead root');
    const lock = snapshotRefreshLock(root), directory = join(dirname(lock),'dashboard-refresh');
    mkdirSync(directory,{recursive:true,mode:0o700});
    const cache = join(directory,'state.json'), ciFile = join(root,'.cache/loop-ci-pending.json');
    const io = {...defaults(root,ledgerPath,directory),...injected};
    const owner = `${lock}.owner`;
    if(existsSync(owner) && json(owner).pid !== process.pid)
        return {status:'deferred',reason:'refresh observer already owned; inspect live owner before recovery'};
    if(existsSync(lock)) return {status:'deferred',reason:'Main boundary already owned'};
    return withRefreshLock(lock,() => {
        let local = existsSync(cache) ? json(cache) : {version:1,pending:null,proposal:null};
        let {ledger,state} = readLedger(ledgerPath,root);
        ensure(local.version === 1,'invalid refresh journal');
        if (observe && local.proposal) return {status:'recovery-required',commit:local.proposal.proof.commit};
        const defer = snapshotReadiness(state,{started:Boolean(local.proposal)});
        if (defer) return {status:'deferred',reason:defer};
        if (!local.proposal) {
            const anchor = acceptedMain(state);
            // This check is performed even when data is unchanged. It never
            // reruns CI, and pending/failed publication prevents a new push.
            const ci = io.ci({file:ciFile});
            if (ci.failed || ci.pending.length) return {status:'deferred',reason:'publication CI pending/failed',ci};
            if (io.git(['branch','--show-current']) !== 'main') return {status:'deferred',reason:'Work lead is off Main'};
            safeMain(io,anchor.commit);
            ensure(io.remote() === anchor.commit,'remote Main changed; sync normal acceptance first');
            const previous = JSON.parse(io.git(['show',`${anchor.commit}:dashboard-snapshot.json`]));
            const auditIndex = json(join(root,'scripts/exploration-yield-audit.json'));
            const payload = buildExplorationYieldPayload(ledger,{asOf:new Date(Math.max(now,
                Date.parse(ledger.events.at(-1).at))).toISOString(),auditIndex});
            const activity = mergeActivity(previous.activity,activityFromLedger(ledger));
            const decision = refreshDecision(previous,{explorationYield:payload,activity},local.pending,now);
            local.pending = decision.pending; save(cache,local);
            if (decision.action !== 'due' || observe) return {status:decision.action,watermark:decision.watermark,
                dueAt:local.pending ? new Date(local.pending.firstSeen+REFRESH_INTERVAL_MS).toISOString() : null};
            const packet = join(directory,`capture-${randomUUID()}`); mkdirSync(packet,{mode:0o700});
            const prefix = join(packet,'captured-ledger.json'), output = join(packet,'snapshot.json');
            const capturedBytes = Buffer.from(JSON.stringify(ledger,null,2)+'\n');
            writeFileSync(prefix,capturedBytes,{mode:0o600});
            writeFileSync(output,JSON.stringify(previous,null,2)+'\n',{mode:0o600});
            io.snapshot(prefix,anchor.checkpoint,output);
            const summary = json(anchor.checkpoint), bytes = readFileSync(output), snapshot = JSON.parse(bytes);
            const watermark = validatePublicSnapshot(snapshot,summary);
            ensure(watermark.digest === decision.watermark.digest,'captured exploration projection changed');
            chmodSync(prefix,0o444); chmodSync(output,0o444);
            const proof = {anchor:anchor.commit,tested:summary.executionCommit,commit:null,checkpoint:anchor.checkpoint,
                snapshotSha256:snapshotDigest(bytes),watermark:watermark.digest,
                through:ledger.events.at(-1).id,ledgerSha256:snapshotDigest(capturedBytes),prefix};
            // Build an unattached commit with a private index; Main and its
            // worktree remain unchanged until the complete proposal passes.
            const index = join(directory,'proposal.index');
            if (existsSync(index)) unlinkSync(index);
            const env = {...process.env,GIT_INDEX_FILE:index};
            git(root,['read-tree',anchor.commit],{env});
            const blob = git(root,['hash-object','-w',output]);
            git(root,['update-index','--add','--cacheinfo',`100644,${blob},dashboard-snapshot.json`],{env});
            const tree = git(root,['write-tree'],{env});
            proof.commit = git(root,['commit-tree',tree,'-p',anchor.commit,'-m','Refresh completed exploration dashboard snapshot',
                '-m',`Original execution checkpoint: ${proof.tested}; reporting only.`]);
            verifySnapshotPublication(root,state,proof);
            local.proposal = {proof,output,prefix,stage:'prepared'}; save(cache,local);
        }
        const {proof,output,prefix} = local.proposal;
        const bytes = readFileSync(output);
        ensure(snapshotDigest(bytes) === proof.snapshotSha256 && snapshotDigest(readFileSync(prefix)) === proof.ledgerSha256,
            'pending refresh evidence changed; inspect journal');
        ({ledger,state} = readLedger(ledgerPath,root));
        const event = ledger.events.find(row => row.id === `snapshot-published-${proof.commit}`);
        if (!event) verifySnapshotPublication(root,state,proof,{started:true});
        let remote = io.remote();
        ensure([proof.anchor,proof.commit].includes(remote),'remote Main changed; do not replace pending proposal');
        const head = io.git(['rev-parse','HEAD']);
        if (head === proof.anchor) {
            safeMain(io,proof.anchor);
            ensure(remote === proof.anchor,'remote advanced but local head differs; inspect pending journal');
            io.git(['update-ref','refs/heads/main',proof.commit,proof.anchor]);
        }
        ensure(io.git(['branch','--show-current']) === 'main','pending refresh requires Main');
        repairExactSnapshot(io,root,proof,bytes); safeMain(io,proof.commit);
        if (remote === proof.anchor) {
            ({state} = readLedger(ledgerPath,root));
            verifySnapshotPublication(root,state,proof,{started:true});
            ensure(io.remote() === proof.anchor,'remote changed before push');
            io.push(proof.commit);
            remote = io.remote();
        }
        ensure(remote === proof.commit,'push did not publish exact pending snapshot');
        local.proposal.stage = 'pushed'; save(cache,local);
        io.record(proof); // Idempotent exact event; never success before push.
        local.proposal.stage = 'recorded'; save(cache,local);
        const ci = io.ci({file:ciFile,commit:proof.commit,task:'exploration-snapshot-refresh'});
        io.refresh(proof); // Supported queue refresh, with original saved scan.
        local.lastPublication = {commit:proof.commit,watermark:proof.watermark,through:proof.through,proof,prefix,output,
            capturedAt:JSON.parse(bytes).capturedAt,ci};
        save(join(dirname(output),'receipt.json'),local.lastPublication);
        local.proposal = null; local.pending = null; save(cache,local);
        return {status:'published',...local.lastPublication};
    });
}

const USAGE = 'node scripts/dashboard-refresh.mjs --ledger <absolute-ledger> [--watch | --observe]\nWL-local 15-minute coalescer. --observe never proposes/pushes. --watch checks every minute; no hosted timer.\nLocks are never stolen: after a crash confirm the recorded owner stopped, then remove its lock and rerun the exact command to recover the journal.';
async function main(args) {
    if (args.length === 1 && args[0] === '--help') return console.log(USAGE);
    const options = {};
    for (let i=0;i<args.length;i++) {
        if (args[i] === '--ledger') options.ledger = args[++i];
        else if (args[i] === '--watch') options.watch = true;
        else if (args[i] === '--observe') options.observe = true;
        else throw new Error(USAGE);
    }
    ensure(options.ledger && !(options.watch && options.observe),USAGE);
    const run = () => {
        try {console.log(JSON.stringify({at:new Date().toISOString(),...refreshOnce(options)}));}
        catch(error) {
            if(error.code!=='EEXIST')throw error;
            console.log(JSON.stringify({at:new Date().toISOString(),status:'deferred',reason:'Main boundary already owned'}));
        }
    };
    if (!options.watch) return run();
    const owner = snapshotRefreshLock(process.cwd()) + '.owner';
    const fd = openSync(owner,'wx',0o600);
    let closing=false,wake=()=>{};
    const stop=()=>{closing=true;wake();};
    process.on('SIGINT',stop); process.on('SIGTERM',stop);
    try {
        writeFileSync(fd,JSON.stringify({pid:process.pid,owner:'Work lead',startedAt:new Date().toISOString()})); fsyncSync(fd);
        while(!closing) {
            run();
            if(!closing) await new Promise(resolve=>{
                const timer=setTimeout(resolve,60_000);wake=()=>{clearTimeout(timer);resolve();};
            });
        }
    } finally {process.off('SIGINT',stop);process.off('SIGTERM',stop);closeSync(fd); unlinkSync(owner);}
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main(process.argv.slice(2)).catch(error => {console.error(error.message); process.exitCode=1;});
}
