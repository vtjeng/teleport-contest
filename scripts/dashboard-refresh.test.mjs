import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createLedger, recordEvent, summarizeLedger} from './worker-state.mjs';
import {acceptedMain} from './worker-backlog.mjs';
import {queueBase, queueWork} from './assignment-queue.mjs';
import {queueCommand} from './work-queue.mjs';
import {developmentFromCheckpoint} from './dashboard-snapshot.mjs';
import {buildExplorationYieldPayload} from './exploration-yield.mjs';
import {refreshDecision, refreshOnce, REFRESH_INTERVAL_MS, withRefreshLock} from './dashboard-refresh.mjs';
import {discoveryWatermark, requireNoSnapshotRefresh, snapshotDigest, snapshotReadiness,
    validatePublicSnapshot, verifySnapshotPublication, snapshotRefreshLock} from './snapshot-publication.mjs';
import {verifyToolingPublication} from './worker-delivery.mjs';
import {withMainWork} from './main-work.mjs';

const read = file => JSON.parse(readFileSync(file));
const save = (file,value) => writeFileSync(file,JSON.stringify(value,null,2)+'\n');
function fixture(t) {
    const root=mkdtempSync(join(tmpdir(),'dashboard-refresh-'));
    t.after(()=>rmSync(root,{recursive:true,force:true}));
    const git=args=>execFileSync('git',['-c','core.hooksPath=/dev/null',...args],
        {cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).trimEnd();
    git(['init','-qb','main']); git(['config','user.name','Snapshot fixture']);
    git(['config','user.email','fixture@example.invalid']); git(['config','commit.gpgsign','false']);
    mkdirSync(join(root,'scripts')); mkdirSync(join(root,'.cache'));
    writeFileSync(join(root,'.gitignore'),'.cache/\n');
    save(join(root,'scripts/exploration-yield-audit.json'),{});
    writeFileSync(join(root,'execution.txt'),'unchanged execution\n');
    save(join(root,'dashboard-snapshot.json'),{});
    git(['add','.gitignore','scripts/exploration-yield-audit.json','execution.txt','dashboard-snapshot.json']);
    git(['commit','-qm','execution fixture']); const tested=git(['rev-parse','HEAD']);
    const artifacts=join(root,'.git/checkpoint-results',tested,'run-fixture'); mkdirSync(artifacts,{recursive:true});
    const results={results:Array.from({length:44},(_,i)=>({session:`session${i}.session.json`,passed:true,
        metrics:Object.fromEntries(['screens','rngCalls','cursors'].map(key=>[key,{matched:1,total:1}]))}))};
    save(join(artifacts,'session-results.json'),results);
    const summary={allPassed:true,commit:tested,executionCommit:tested,artifacts,timestamp:'2000-01-01T00:00:00Z',
        artifactHashes:{'session-results.json':snapshotDigest(readFileSync(join(artifacts,'session-results.json')))},
        score:{screensMatched:44,rngMatched:44,cursorsMatched:44}};
    const checkpoint=join(artifacts,'summary.json');save(checkpoint,summary);
    save(join(root,'.git/checkpoint-results',tested,'latest.json'),summary);
    let ledger=createLedger('loop-20261016',root),sequence=0;
    const file=join(root,'.cache/ledger.json');
    const send=event=>{ledger=recordEvent(ledger,{id:`fixture-${++sequence}`,...event}); save(file,ledger);};
    send({type:'queue-enable',base:tested,prepRoot:join(root,'.cache/prep')});
    send({type:'register',worker:'Worker-1',worktree:join(root,'.cache/worker'),branch:'worker',base:tested,handle:'private-worker'});
    const initial={version:1,capturedAt:'2000-01-01T00:00:01Z',
        explorationYield:buildExplorationYieldPayload(ledger,{asOf:'2000-01-01T00:00:01Z'}),
        activity:{events:[]},pendingMainWork:{},workerReservations:{},assignmentQueue:{},
        development:developmentFromCheckpoint(summary,results,readFileSync(join(artifacts,'session-results.json')))};
    save(join(root,'dashboard-snapshot.json'),initial);git(['add','dashboard-snapshot.json']);
    git(['commit','-qm','first accepted snapshot']);const anchor=git(['rev-parse','HEAD']);
    send({type:'tooling-published',tested,commit:anchor,checkpoint});
    send({type:'queue-refresh',base:anchor,digest:'1'.repeat(64),sessions:[],populate:false,regressions:[],sources:{}});
    const enqueue=(id,extra={})=>{
        send({type:'queue-enqueue',assignment:{id,type:'exploration',output:'exploration',producer:'Prep',recipient:'Prep',
            batch:'v96',question:'Inspect source.',stop:'One bounded result.',base:queueBase(summarizeLedger(ledger)),dependencies:[],sessions:[],
            reservations:[`source:fixture:${id}`],allowedPaths:['.cache/'],checks:[],artifacts:[],...extra}});
    };
    const close=(id,extra={})=>{
        enqueue(id,extra);
        send({type:'queue-claim',task:id,worker:'Worker-1',branch:`worker/${id}`});
        send({type:'queue-result',task:id,worker:'Worker-1',commit:tested,digest:'a'.repeat(64),
            packet:join(root,`.cache/${id}.json`),outcome:'match'});
    };
    close('first');
    const state=()=>summarizeLedger(read(file));
    const ready=()=>{
        send({type:'register',worker:'Prep',worktree:join(root,'.cache/prep'),branch:'prep',base:anchor,handle:'private-prep'});
        send({type:'assign',task:'new-delivery',worker:'Prep',kind:'challenge-preparation',seed:null,base:anchor,
            reservations:['challenge-batch:v97'],allowedPaths:['challenges/cases/v97/']});
        send({type:'ready',task:'new-delivery',delivery:tested,base:anchor,commits:[tested],
            paths:['challenges/cases/v97/fixture.json'],evidence:join(root,'.cache/fixture.json'),dependencies:[]});
    };
    let remote=anchor,pushes=0,refreshes=0;
    const hooks={git,remote:()=>remote,ci:()=>({failed:false,pending:[],completed:[]}),
        push:commit=>{pushes++;remote=commit;},
        record:proof=>{ledger=read(file);send({id:`snapshot-published-${proof.commit}`,type:'snapshot-published',...proof});},
        refresh:()=>{refreshes++;}};
    return {root,file,git,tested,anchor,summary,checkpoint,state,send,close,enqueue,ready,hooks,
        counts:()=>({pushes,refreshes}),remote:()=>remote,
        journal:()=>read(join(root,'.git/dashboard-refresh/state.json'))};
}
function runDue(f,hooks={}) {
    const now=Date.now(); const options={root:f.root,ledger:f.file,now};
    assert.equal(refreshOnce(options,{...f.hooks,...hooks}).status,'coalescing');
    return ()=>refreshOnce({...options,now:now+REFRESH_INTERVAL_MS+1},{...f.hooks,...hooks});
}

test('coalesces only discovery closures, not claims, support or capturedAt; zero change is a no-op',()=>{
    const row={id:'a',kind:'discovery',claimedAt:'2026-10-16T00:00:00Z',closedAt:'2026-10-16T00:01:00Z'};
    const old={explorationYield:{records:[]}};
    const p={records:[row]};const start=refreshDecision(old,p,null,1000);
    assert.equal(start.action,'coalescing');assert.equal(refreshDecision(old,p,start.pending,901000).action,'due');
    const unchanged={...p,records:[row,{...row,id:'support',kind:'follow-up'}],asOf:'later'};
    assert.equal(discoveryWatermark(p).digest,discoveryWatermark(unchanged).digest);
    assert.equal(refreshDecision({explorationYield:p},unchanged,start.pending,999999).action,'unchanged');
});

test('common exclusive lock protects integration and never steals an existing owner',t=>{
    const f=fixture(t),lock=snapshotRefreshLock(f.root);
    withRefreshLock(lock,()=>{
        assert.throws(()=>withRefreshLock(lock,()=>assert.fail()),/EEXIST/);
        assert.throws(()=>requireNoSnapshotRefresh(f.root),/Main publication owned/);
    });assert.equal(existsSync(lock),false);
});

test('whole-operation Main-work lease defers observer and permits nested supported operations',t=>{
    const f=fixture(t);
    withMainWork(f.root,()=>{
        assert.equal(refreshOnce({root:f.root,ledger:f.file},f.hooks).status,'deferred');
        withMainWork(f.root,()=>requireNoSnapshotRefresh(f.root));
        assert.equal(existsSync(snapshotRefreshLock(f.root)),true);
    });
    assert.equal(existsSync(snapshotRefreshLock(f.root)),false);
    f.ready();assert.equal(snapshotReadiness(f.state()),'ready delivery needs Work lead review');
});

test('Main acquisition rechecks pending report created between initial read and exclusive lock',t=>{
    const f=fixture(t),directory=join(f.root,'.git/dashboard-refresh');
    mkdirSync(directory);
    assert.throws(()=>withMainWork(f.root,()=>assert.fail('must not start Main action'),{
        open:(...args)=>{
            save(join(directory,'state.json'),{version:1,proposal:{proof:{commit:'pending'}}});
            return openSync(...args);
        },
    }),/Pending snapshot proposal/);
    assert.equal(existsSync(snapshotRefreshLock(f.root)),false,'failed acquisition releases only its own lock');
    assert.ok(read(join(directory,'state.json')).proposal,'pending report remains for exact recovery');
});

test('publishes exact snapshot and allows repeated reports from SAME original proof; no self loop',t=>{
    const f=fixture(t);let due=runDue(f);const first=due();
    assert.equal(first.status,'published');assert.equal(f.counts().pushes,1);
    assert.equal(acceptedMain(f.state()).commit,first.commit);assert.equal(queueBase(f.state()),f.anchor);
    assert.equal(acceptedMain(f.state()).checkpoint,f.checkpoint);
    assert.equal(refreshOnce({root:f.root,ledger:f.file},f.hooks).status,'unchanged');
    // Keep fixture queue freshness consistent after the first publication.
    f.send({type:'queue-refresh',base:f.anchor,digest:'2'.repeat(64),sessions:[],populate:false,regressions:[],sources:{}});
    f.close('second'); due=runDue(f);assert.equal(due().status,'published');
    assert.equal(f.counts().pushes,2);
    const proof=f.state().snapshotPublications.at(-1);
    assert.equal(proof.tested,f.tested);
    assert.equal(read(join(f.root,'dashboard-snapshot.json')).development.executionCommit,f.tested);
    assert.throws(()=>verifyToolingPublication(f.root,f.state(),proof),/must follow accepted Main/,
        'new path must not relax original tooling gate');
});

test('real queue read preserves pending original-base plans and live claims; report-base plans are equivalent',t=>{
    const f=fixture(t);
    f.enqueue('live');f.send({type:'queue-claim',task:'live',worker:'Worker-1',branch:'worker/live'});
    f.enqueue('pending');const before=structuredClone(f.state().queue.tasks.live);
    const due=runDue(f,{refresh:()=>queueCommand('next',{file:f.file},f.root)});
    const receipt=due();
    assert.deepEqual(f.state().queue.tasks.live,before);
    assert.equal(f.state().queue.tasks.pending.base,f.anchor);
    assert.ok(queueCommand('next',{file:f.file},f.root).allocation.ready.includes('pending'));
    f.enqueue('new-report-plan',{base:receipt.commit});
    assert.ok(queueWork(f.state()).ready.includes('new-report-plan'));
});

test('defers off Main, dirty/untracked work, integration and pending CI without changing HEAD',t=>{
    const f=fixture(t),options={root:f.root,ledger:f.file};
    assert.equal(refreshOnce(options,{...f.hooks,ci:()=>({failed:false,pending:[{}]})}).status,'deferred');
    assert.equal(snapshotReadiness({...f.state(),tasks:{x:{status:'integrating'}}}),'active integration/validation/publication');
    assert.equal(snapshotReadiness({...f.state(),tasks:{x:{status:'accepted',activity:{phase:'admission'}}}}),'active integration/validation/publication');
    f.git(['switch','-qc','feature']);assert.equal(refreshOnce(options,f.hooks).status,'deferred');f.git(['switch','main']);
    writeFileSync(join(f.root,'untracked.js'),'unsafe');assert.throws(()=>refreshOnce(options,f.hooks),/dirty\/untracked/);
    assert.equal(f.git(['rev-parse','HEAD']),f.anchor);assert.equal(f.counts().pushes,0);
});

test('push failure preserves exact proposal; retry recovers same commit without a second generation',t=>{
    const f=fixture(t);const due=runDue(f,{push:()=>{throw new Error('network failed');}});
    assert.throws(due,/network failed/);const proposal=f.journal().proposal.proof;
    assert.equal(f.state().snapshotPublications.length,0);
    assert.equal(refreshOnce({root:f.root,ledger:f.file,observe:true},f.hooks).status,'recovery-required');
    const receipt=refreshOnce({root:f.root,ledger:f.file},f.hooks);
    assert.equal(receipt.commit,proposal.commit);assert.equal(f.counts().pushes,1);
});

test('crash AFTER push before ledger resumes exact proposal once; late closures remain pending',t=>{
    const f=fixture(t);const due=runDue(f,{record:()=>{throw new Error('simulated crash');}});
    assert.throws(due,/simulated crash/);const proposal=f.journal().proposal;
    assert.equal(f.remote(),proposal.proof.commit);assert.equal(f.state().snapshotPublications.length,0);
    // Append new independent work while old captured prefix remains intact.
    f.close('arrived-after-capture');
    const recovered=refreshOnce({root:f.root,ledger:f.file},f.hooks);
    assert.equal(recovered.commit,proposal.proof.commit);assert.equal(f.counts().pushes,1);
    assert.equal(f.state().snapshotPublications.length,1);
    assert.equal(read(join(f.root,'dashboard-snapshot.json')).explorationYield.records.length,1);
    assert.equal(refreshOnce({root:f.root,ledger:f.file},f.hooks).status,'coalescing');
});

test('ready delivery arriving during push cannot strand exact proposal or prevent recovery',t=>{
    const f=fixture(t);
    const due=runDue(f,{push:commit=>{f.hooks.push(commit);f.ready();},record:()=>{throw new Error('after-push crash');}});
    assert.throws(due,/after-push crash/);
    assert.equal(snapshotReadiness(f.state()),'ready delivery needs Work lead review');
    assert.throws(()=>withMainWork(f.root,()=>assert.fail()),/Pending snapshot proposal/);
    const receipt=refreshOnce({root:f.root,ledger:f.file},{...f.hooks,record:proof=>{
        verifySnapshotPublication(f.root,f.state(),proof,{started:true});f.hooks.record(proof);
    }});
    assert.equal(receipt.status,'published');assert.equal(f.counts().pushes,1);
    assert.equal(f.state().tasks['new-delivery'].status,'ready');
    assert.equal(refreshOnce({root:f.root,ledger:f.file},f.hooks).status,'deferred');
});

test('ready arrival after local proposal before push completes same proposal, then yields Main priority',t=>{
    const f=fixture(t);const due=runDue(f,{push:()=>{f.ready();throw new Error('before-push stop');}});
    assert.throws(due,/before-push stop/);
    assert.equal(refreshOnce({root:f.root,ledger:f.file},f.hooks).status,'published');
    assert.equal(f.state().tasks['new-delivery'].status,'ready');assert.equal(f.counts().pushes,1);
});

test('queue/CI stage failure retains recovery; exact event and push are not duplicated',t=>{
    const f=fixture(t);const due=runDue(f,{refresh:()=>{throw new Error('queue unavailable');}});
    assert.throws(due,/queue unavailable/);assert.equal(f.state().snapshotPublications.length,1);
    // Idempotent event hook mirrors the real exact-event handler.
    const hooks={...f.hooks,record:proof=>{
        if(!f.state().snapshotPublications.some(p=>p.commit===proof.commit))f.hooks.record(proof);
    }};
    assert.equal(refreshOnce({root:f.root,ledger:f.file},hooks).status,'published');
    assert.equal(f.counts().pushes,1);assert.equal(f.state().snapshotPublications.length,1);
});

test('CI registration failure after push is recoverable without duplicate push or event',t=>{
    const f=fixture(t),now=Date.now(),options={root:f.root,ledger:f.file,now};
    refreshOnce(options,f.hooks);
    assert.throws(()=>refreshOnce({...options,now:now+REFRESH_INTERVAL_MS+1},{...f.hooks,
        ci:options=>{if(options.commit)throw new Error('CI API unavailable');return {failed:false,pending:[]};}}),/CI API/);
    assert.equal(f.state().snapshotPublications.length,1);
    const hooks={...f.hooks,record:()=>{}};
    assert.equal(refreshOnce(options,hooks).status,'published'); assert.equal(f.counts().pushes,1);
});

test('fake push and unexpected remote never acknowledge a proposal',t=>{
    const f=fixture(t);const due=runDue(f,{push:()=>{}});
    assert.throws(due,/did not publish exact/);assert.equal(f.state().snapshotPublications.length,0);
    const hash=f.journal().proposal.proof.commit;
    assert.throws(()=>refreshOnce({root:f.root,ledger:f.file},{...f.hooks,remote:()=> 'f'.repeat(40)}),/remote Main changed/);
    assert.equal(f.journal().proposal.proof.commit,hash);
});

test('modified or failed imported proof is rejected, and unrelated reverted history is not accepted',t=>{
    const f=fixture(t);const due=runDue(f,{push:()=>{throw new Error('pause');}});assert.throws(due,/pause/);
    const proof=f.journal().proposal.proof,state=f.state(),original=readFileSync(f.checkpoint);
    save(f.checkpoint,{...f.summary,allPassed:false});
    assert.throws(()=>verifySnapshotPublication(f.root,state,proof),/passing exact/);
    writeFileSync(f.checkpoint,original);
    save(f.checkpoint,{...f.summary,timestamp:'modified'});
    assert.throws(()=>verifySnapshotPublication(f.root,state,proof),/differs from imported/);
    writeFileSync(f.checkpoint,original);
    f.git(['switch','-q','--detach',proof.anchor]);
    writeFileSync(join(f.root,'GOALS.json'),'{}');f.git(['add','GOALS.json']);f.git(['commit','-qm','unaccepted bookkeep']);
    f.git(['rm','GOALS.json']);f.git(['commit','-qm','reverted bookkeep']);
    const commit=f.git(['rev-parse','HEAD']);
    assert.throws(()=>verifySnapshotPublication(f.root,state,{...proof,commit}),/only dashboard-snapshot/);
});

test('captured prefix must be real history and public records must equal its deterministic projection',t=>{
    const f=fixture(t);const due=runDue(f,{push:()=>{throw new Error('pause');}});assert.throws(due,/pause/);
    const proof=f.journal().proposal.proof,state=f.state();
    assert.throws(()=>verifySnapshotPublication(f.root,state,{...proof,through:'invented-event'}),/unknown captured/);
    const beforeAnchor=state.ledger.events.findIndex(e=>e.type==='tooling-published');
    const oldPrefix={...state.ledger,events:state.ledger.events.slice(0,beforeAnchor)};
    const oldFile=join(f.root,'.cache/old-real-prefix.json');save(oldFile,oldPrefix);chmodSync(oldFile,0o444);
    assert.throws(()=>verifySnapshotPublication(f.root,state,{...proof,prefix:oldFile,
        through:oldPrefix.events.at(-1).id,ledgerSha256:snapshotDigest(readFileSync(oldFile))}),/must include latest accepted anchor/);
    const foreign=join(f.root,'.cache/foreign-prefix.json');writeFileSync(foreign,JSON.stringify({events:[]}));
    // Make a read-only foreign prefix with matching asserted hash.
    chmodSync(foreign,0o444);
    assert.throws(()=>verifySnapshotPublication(f.root,state,{...proof,prefix:foreign,
        ledgerSha256:snapshotDigest(readFileSync(foreign))}),/captured prefix differs/);
    const output=f.journal().proposal.output, fake=read(output);
    fake.explorationYield.records[0].qualifyingSessionIds=['invented-discovery'];
    f.git(['switch','-q','--detach',proof.anchor]);
    save(join(f.root,'dashboard-snapshot.json'),fake);f.git(['add','dashboard-snapshot.json']);f.git(['commit','-qm','fake public stats']);
    const bytes=readFileSync(join(f.root,'dashboard-snapshot.json'));
    assert.throws(()=>verifySnapshotPublication(f.root,state,{...proof,commit:f.git(['rev-parse','HEAD']),
        snapshotSha256:snapshotDigest(bytes),watermark:discoveryWatermark(fake.explorationYield).digest}),/differs from captured ledger projection/);
});

test('strict proof rejects unrelated bookkeeping, changed execution, snapshot modes, stale anchor and tainted privacy',t=>{
    const f=fixture(t);const due=runDue(f,{push:()=>{throw new Error('pause');}});assert.throws(due,/pause/);
    const proof=f.journal().proposal.proof,state=f.state();
    const assertBad=(change,message)=>{
        f.git(['switch','-q','--detach',proof.anchor]);change();
        const commit=f.git(['rev-parse','HEAD']);
        assert.throws(()=>verifySnapshotPublication(f.root,state,{...proof,commit}),message);
    };
    assertBad(()=>{writeFileSync(join(f.root,'GOALS.json'),'{}');f.git(['add','GOALS.json']);f.git(['commit','-qm','unrelated bookkeeping']);},/only dashboard-snapshot/);
    assertBad(()=>{writeFileSync(join(f.root,'execution.txt'),'changed');f.git(['add','execution.txt']);f.git(['commit','-qm','execution changed']);},/execution tree changed/);
    assertBad(()=>{f.git(['update-index','--chmod=+x','dashboard-snapshot.json']);f.git(['commit','-qm','bad snapshot mode']);},/bookkeeping input must be a regular file|non-executable/);
    assert.throws(()=>verifySnapshotPublication(f.root,state,{...proof,anchor:f.tested}),/latest accepted anchor/);
    const valid=read(f.journal().proposal.output);
    assert.throws(()=>validatePublicSnapshot({...valid,activity:{events:[{reason:'/workspace/private'}]}},f.summary),/private data/);
    assert.throws(()=>validatePublicSnapshot({...valid,activity:{events:[{handle:'private'}]}},f.summary),/private ownership/);
    assert.throws(()=>validatePublicSnapshot({...valid,development:{...valid.development,executionCommit:proof.commit}},f.summary),/development evidence/);
});
