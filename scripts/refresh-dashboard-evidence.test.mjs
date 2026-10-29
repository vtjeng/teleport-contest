import assert from 'node:assert/strict';
import test from 'node:test';
import {buildEvidence} from './dashboard-evidence.mjs';
import {reviewFingerprint} from './discovery-hub.mjs';
import {refreshEvidence,publicGitIO} from './refresh-dashboard-evidence.mjs';
const A='a'.repeat(40), B='b'.repeat(40), BASE='c'.repeat(40);
const PREFIX='diagnostics/divergence-evidence/levels/';
const NOW='2026-10-29T01:00:00Z';
function fixture() {
  const files=new Map();
  const put=(ref,path,value)=>files.set(`${ref}:${path}`,JSON.stringify(value));
  const read=(ref,path)=>{const x=files.get(`${ref}:${path}`);if(x===undefined)throw new Error(`Missing metadata: ${path}`);return x;};
  const inventory={runId:'run',baseSha:BASE,cGitlink:BASE,leads:[]};
  for(const id of ['a','b']) {
    const path=`${PREFIX}${id}/case.json`;
    const row={key:`source-audit:edge:${id}`,evidenceKey:id,method:'sourceAudit',methods:[{kind:'call_graph',version:'v1',run_id:'run'}]};
    const projection={runId:'run',baseSha:BASE,cGitlink:BASE,toolHashes:{sourceAudit:'tool'},methodConfigHashes:{sourceAudit:'config'},leads:[row],completedAt:'2026-10-28T12:00:00Z'};
    const decision={key:row.key,evidenceKey:id,runId:'run',reviewFingerprint:reviewFingerprint(projection,row),status:'explained_negative'};
    inventory.leads.push({...row,reviewFingerprint:decision.reviewFingerprint});
    for(const ref of [A,B]) {
      put(ref,path,{schemaVersion:1,caseId:id,status:'explained_negative',rootCause:'shared-root',provenance:{jsSha:BASE,cGitlink:BASE},origin:{kind:'scanner',keys:[row.key],projection:`${PREFIX}${id}/projection.json`,decisions:`${PREFIX}${id}/decisions.json`}});
      put(ref,`${PREFIX}${id}/projection.json`,projection);put(ref,`${PREFIX}${id}/decisions.json`,[decision]);
    }
  }
  for(const ref of [A,B])put(ref,`${PREFIX}inventory.json`,inventory);
  const config={version:1,inventories:[{id:'levels',ref:A,pr:1,path:`${PREFIX}inventory.json`,cases:[{ref:A,pr:1,path:`${PREFIX}a/case.json`}],refresh:{sources:[{pr:1,inventory:true,allowedDirectory:PREFIX}]}}],audits:[]};
  const previous=buildEvidence(config,read);
  const io={now:()=>NOW,resolveSource:async()=>({head:B,base:BASE}),prepare:async()=>{},listFiles:()=>[`${PREFIX}a/case.json`,`${PREFIX}b/case.json`],read};
  return {config,previous,io,put,read};
}
test('advancing published source discovers added versioned case and deduplicates semantic root',async()=>{
  const f=fixture();const out=await refreshEvidence(f.config,f.previous,f.io);
  assert(out.passed);assert.equal(out.config.inventories[0].ref,B);
  const c=out.evidence.cohorts[0];assert.equal(c.summary.reviewed,2);assert.equal(c.summary.causes.explained_negative,1);
  assert.equal(c.refresh.state,'updated');assert.equal(c.refresh.lastSuccessAt,NOW);
  assert.equal(c.scanCompletedAt,'2026-10-28T12:00:00Z');assert.equal(c.reviewAsOf,null);
  assert.equal(out.evidence.cases[1].reviewedAt,null);
  assert.deepEqual(buildEvidence(out.config,f.read),out.evidence,'offline reconstruction');
  const again=await refreshEvidence(out.config,out.evidence,f.io);
  assert(again.passed);assert.equal(again.evidence.cohorts[0].refresh.state,'unchanged');
});
test('stale decision binding retains labeled previous counts and pins',async()=>{
  const f=fixture();const d=JSON.parse(f.read(B,`${PREFIX}b/decisions.json`));d[0].reviewFingerprint='stale';f.put(B,`${PREFIX}b/decisions.json`,d);
  const out=await refreshEvidence(f.config,f.previous,f.io);
  assert(!out.passed);assert.equal(out.config.inventories[0].ref,A);
  assert.deepEqual(out.evidence.cohorts[0].summary,f.previous.cohorts[0].summary);
  assert.equal(out.evidence.cohorts[0].refresh.state,'last-known');assert.equal(out.evidence.cohorts[0].refresh.lastSuccessAt,null);
  assert.match(out.evidence.cohorts[0].refresh.error,/Stale/);
});
test('malformed source fails transaction; unsupported new legacy metadata stays unknown',async()=>{
  const f=fixture();f.put(B,`${PREFIX}b/case.json`,{schemaVersion:1});
  assert(!(await refreshEvidence(f.config,f.previous,f.io)).passed);
  f.put(B,`${PREFIX}b/case.json`,{caseId:'b',outcome:'match'});
  const out=await refreshEvidence(f.config,f.previous,f.io);
  assert(out.passed);assert.equal(out.evidence.cohorts[0].summary.reviewed,1);
  assert.equal(out.evidence.cohorts[0].skippedMetadata.length,1);
});
test('unavailable source keeps last success and does not stamp it fresh',async()=>{
  const f=fixture();const good=await refreshEvidence(f.config,f.previous,f.io);
  const failed=await refreshEvidence(good.config,good.evidence,{...f.io,now:()=> '2026-10-29T02:00:00Z',resolveSource:async()=>{throw new Error('Public source unavailable: HTTP 503');}});
  assert(!failed.passed);const c=failed.evidence.cohorts[0];
  assert.equal(c.refresh.lastSuccessAt,NOW);assert.equal(c.refresh.attemptedAt,'2026-10-29T02:00:00Z');
  assert.deepEqual(c.summary,good.evidence.cohorts[0].summary);
});
test('multiple explicit completion formats reconcile only named candidate cases',async()=>{
  const f=fixture();
  for(const id of ['a','b']){const p=`${PREFIX}${id}/case.json`,v=JSON.parse(f.read(B,p));v.status='candidate';v.readiness='review_ready';f.put(B,p,v);const d=JSON.parse(f.read(B,`${PREFIX}${id}/decisions.json`));d[0].status='confirmed';f.put(B,`${PREFIX}${id}/decisions.json`,d);}
  f.put(B,`${PREFIX}a/completion.json`,{caseId:'a',mainSha:B,routingStatus:'fully_accepted',receiptAuthority:'Main completion record',recordedAt:NOW,confirmedStages:['Checkpoint','archive comparison','Main Lint','Dashboard','complete 98-evaluation receipt']});
  f.put(B,`${PREFIX}b/accepted-routing.json`,{relatedCases:['b'],acceptedSha:B,status:'fully_accepted',authority:'Explicit Main receipt',checkpoint:1,mainLint:2,dashboard:3,archiveComparison:'passed',completeReceipt:'passed',recordedAt:NOW});
  const out=await refreshEvidence(f.config,f.previous,{...f.io,listFiles:()=>[...f.io.listFiles(),`${PREFIX}a/completion.json`,`${PREFIX}b/accepted-routing.json`]});
  assert(out.passed);assert.equal(out.evidence.cohorts[0].summary.counts.accepted,2);
  assert.equal(out.evidence.cohorts[0].summary.causes.accepted,1);
  assert.equal(out.evidence.cohorts[0].completionCoverage.verified,2);
  assert(out.evidence.cases.every(c=>c.completion.completedAt===null));
});
test('manual and other-run metadata remain separate from the scanner denominator',async()=>{
  const f=fixture();f.put(B,`${PREFIX}b/case.json`,{schemaVersion:1,caseId:'b',rootCause:null,status:'unresolved',provenance:{jsSha:BASE,cGitlink:BASE},origin:{kind:'manual',keys:[],projection:null,decisions:null}});
  let out=await refreshEvidence(f.config,f.previous,f.io);assert(out.passed);
  assert.equal(out.evidence.cohorts[0].summary.reviewed,1);assert.equal(out.evidence.cohorts[0].unboundCases[0].category,'manual');
  const g=fixture();const p=JSON.parse(g.read(B,`${PREFIX}b/projection.json`));p.runId='different';g.put(B,`${PREFIX}b/projection.json`,p);
  out=await refreshEvidence(g.config,g.previous,g.io);assert(out.passed);
  assert.equal(out.evidence.cohorts[0].summary.reviewed,1);assert.equal(out.evidence.cohorts[0].unboundCases[0].category,'other-run');
});
test('scope escapes and excluded published heads are not consumed',async()=>{
  const f=fixture();const v=JSON.parse(f.read(B,`${PREFIX}b/case.json`));v.origin.projection='diagnostics/divergence-evidence/objects/denied/projection.json';f.put(B,`${PREFIX}b/case.json`,v);
  const out=await refreshEvidence(f.config,f.previous,f.io);assert(!out.passed);assert.match(out.evidence.cohorts[0].refresh.error,/outside allowed/);
  f.config.inventories[0].refresh.sources[0].deniedHeads=['bbbb'];let prepared=false;
  assert(!(await refreshEvidence(f.config,f.previous,{...f.io,prepare:async()=>{prepared=true;}})).passed);assert(!prepared);
});
test('public resolver refuses fork destinations and never sends credentials',async()=>{
  let headers;
  const io=publicGitIO('.',async(url,options)=>{assert.match(url,/api.github.com\/repos\/vtjeng\/teleport-contest\/pulls\/1$/);headers=options.headers;return{ok:true,json:async()=>({head:{repo:{full_name:'other/repo'}},base:{repo:{full_name:'vtjeng/teleport-contest'}}})};});
  await assert.rejects(io.resolveSource({pr:1}),/repository differs/);assert.deepEqual(Object.keys(headers),['Accept']);
});

test('failed second source preserves all prior inventories and labels unapplied success',async()=>{
  const f=fixture();const second=structuredClone(f.config.inventories[0]);second.id='second';second.pr=2;second.cases[0].pr=2;second.refresh.sources[0].pr=2;f.config.inventories.push(second);
  const previous=buildEvidence(f.config,f.read);
  const out=await refreshEvidence(f.config,previous,{...f.io,resolveSource:async source=>{if(source.pr===2)throw new Error('unavailable');return{head:B,base:BASE};}});
  assert(!out.passed);assert.deepEqual(out.config.inventories.map(i=>i.ref),[A,A]);
  assert.equal(out.evidence.cohorts[0].refresh.state,'not-applied');assert.equal(out.evidence.cohorts[0].refresh.lastSuccessAt,null);
  assert.equal(out.evidence.cohorts[1].refresh.state,'last-known');
  assert.deepEqual(out.evidence.cohorts.map(c=>c.summary),previous.cohorts.map(c=>c.summary));
});
test('excluded dependency metadata is refused before reading it',async()=>{
  const f=fixture();f.config.inventories[0].refresh.sources[0].excludedPathFragments=['/excluded/'];
  const v=JSON.parse(f.read(B,`${PREFIX}b/case.json`));v.origin.projection=`${PREFIX}excluded/projection.json`;f.put(B,`${PREFIX}b/case.json`,v);
  let touched=false;const out=await refreshEvidence(f.config,f.previous,{...f.io,read:(ref,path)=>{if(path.includes('/excluded/'))touched=true;return f.read(ref,path);}});
  assert(!out.passed);assert(!touched);assert.match(out.evidence.cohorts[0].refresh.error,/excluded scope/);
});
test('branch source resolves a public head against an explicit baseline',async()=>{
  let requested;
  const io=publicGitIO('.',async url=>{requested=url;return{ok:true,json:async()=>({sha:B})};});
  assert.deepEqual(await io.resolveSource({branch:'analysis/levels',base:BASE}),{head:B,base:BASE,branch:'analysis/levels'});
  assert.match(requested,/commits\/analysis%2Flevels$/);
});

test('unavailable fixed audit commits preserve last-known data too',async()=>{
  const f=fixture();const path=`${PREFIX}static/case.json`;
  f.put(A,path,{caseId:'static',status:'explained_negative'});f.config.audits=[{ref:A,pr:98,path}];
  const previous=buildEvidence(f.config,f.read);
  const out=await refreshEvidence(f.config,previous,{...f.io,preparePinned:async()=>{throw new Error('unavailable pinned commit');}});
  assert(!out.passed);assert.equal(out.config.inventories[0].ref,A);
  assert.match(out.evidence.cohorts[0].refresh.error,/Fixed pinned metadata unavailable/);
  assert.deepEqual(out.evidence.audits,previous.audits);
});
