import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { discoverySummary, workflowSummary } from './dashboard-workflow.mjs';
import { buildEvidence } from './dashboard-evidence.mjs';
const at = n => `2026-10-28T12:${String(n).padStart(2, '0')}:00Z`;
const lead = key => ({ key, evidenceKey: key, reviewFingerprint: key });
const review = (key, status, root = key, extra = {}) => ({ ...lead(key), runId: 'run', status, root, ...extra });

test('key and root denominators remain separate; stale, unresolved and hints are not negatives', () => {
  const s = discoverySummary({ runId: 'run', leads: ['a','b','c','d','e','f','g','h'].map(lead),
    reviews: [review('a','explained_negative','one'), review('b','explained_negative','one'),
      review('c','confirmed','two'), review('d','unresolved'), review('e','invalid_setup'),
      review('f','explained_negative','old',{runId:'old'}), review('g','duplicate')] });
  assert.equal(s.total,8); assert.equal(s.reviewed,6); assert.equal(s.resolved,3);
  assert.equal(s.counts.stale,1); assert.equal(s.counts.unreviewed,1);
  assert.equal(s.negativeShare,2/3); assert.equal(s.causeNegativeShare,1/2);
  const hint = discoverySummary({runId:'run', leads:[{...lead('x'),rankingHint:{reason:'macro'}}]});
  assert.equal(hint.counts.explained_negative,0); assert.equal(hint.counts.unreviewed,1);
});
test('conflicting outcomes and missing semantic identities withhold cause rates', () => {
  const s=discoverySummary({runId:'run',leads:[lead('a'),lead('b')],reviews:[
    review('a','confirmed',null),review('b','confirmed'),review('b','explained_negative')]});
  assert.equal(s.counts.unresolved,1); assert.equal(s.causeNegativeShare,null);
  assert.throws(()=>discoverySummary({runId:'run',leads:[lead('a'),lead('a')]}),/Duplicate/);
});
test('repeated technique versions remain attached to their reviewed keys',()=>{
  const methods=[{kind:'call_graph',version:'v1',run_id:'run'},{kind:'call_graph',version:'v2',run_id:'run'}];
  const s=discoverySummary({runId:'run',leads:[lead('a')],reviews:[review('a','unresolved','a',{methods})]});
  assert.deepEqual(s.rows[0].methods,methods); assert.equal(s.negativeShare,null);
});
const event=(type,n)=>({type,at:at(n),evidence:'public recorded observation'});
const c=(id,root='one')=>({id,root,outcome:'confirmed',reportedReady:true,keys:[id],prs:[1]});
const result=(id,root)=>({repair:{id,kind:'parity-repair',workflow:{rootCause:root}},
  candidates:[{candidate:{sha:'a'.repeat(40)}}],accepted:{candidate:{sha:'a'.repeat(40)},closureAt:at(20)}});
test('duplicate roots share a queue row; batches share gates and require complete receipt',()=>{
  const input={cases:[{...c('a'),events:[event('reported-ready',0),event('picked-up',5)]},c('b'),c('c','two')],
    results:[result('r1','one'),result('r2','two')]};
  let s=workflowSummary(input); assert.equal(s.queue.length,2); assert.equal(s.batches.length,1);
  assert.equal(s.queue[0].status,'published; receipt unknown'); assert.equal(s.queue[0].readyToPickupMs,300000);
  assert.equal(s.queue[0].readyToAcceptedMs,null);
  s=workflowSummary({...input,receipt:{verified:true,sha:'a'.repeat(40),completedAt:at(22)}});
  assert.equal(s.queue[0].status,'accepted'); assert.equal(s.queue[0].readyToAcceptedMs,1320000);
  assert.equal(s.queue[1].readyToAcceptedMs,null); assert.equal(s.batches[0].repairs.length,2);
});
test('missing and invalid timestamps, returns, static audits and explicit waiting',()=>{
  const s=workflowSummary({cases:[{...c('a'),events:[event('reported-ready',5),event('picked-up',2),event('returned-for-evidence',6)]},
    {...c('static'),category:'static-audit'},{...c('negative'),outcome:'explained_negative'}],operations:{noActionableHandoffIntervals:[
      {start:at(0),end:at(1),evidence:'observed empty queue'},{start:at(0),end:at(1)}]}});
  assert.equal(s.queue.length,1); assert.equal(s.queue[0].status,'returned for evidence');
  assert.equal(s.queue[0].readyToPickupMs,null); assert.equal(s.waitingIntervals.length,1);
});
test('committed snapshot separates finite scanner populations and static units',()=>{
  const evidence=JSON.parse(readFileSync(new URL('../trial-monitor/evidence.json',import.meta.url)));
  const [levels,monsters]=evidence.cohorts;
  for (const cohort of [levels,monsters]) {
    assert.equal(Object.values(cohort.summary.counts).reduce((sum,n)=>sum+n,0),cohort.summary.total);
    assert.equal(cohort.summary.withoutCurrentReview,cohort.summary.counts.unreviewed+cohort.summary.counts.stale);
    assert.equal(cohort.summary.resolved,cohort.summary.counts.explained_negative+cohort.summary.counts.confirmed+cohort.summary.counts.accepted);
  }
  assert.equal(evidence.audits.length,3);
  assert(!JSON.stringify(evidence).includes('/workspace/')); assert(!JSON.stringify(evidence).includes('/tmp/'));
  assert(levels.strata.every(s=>s.method.run_id===levels.runId));
  assert.equal(levels.strata.reduce((n,s)=>n+s.total,0),levels.summary.total);
  assert.throws(()=>buildEvidence({version:2},()=>{}),/Unsupported/);
});

test('existing witness identities link repair acceptance without a second handoff ledger',()=>{
  const r=result('repair','unused'); delete r.repair.workflow;
  r.repair.evidence={witness:['diagnostics/divergence-evidence/levels/a/probe.mjs']};
  const s=workflowSummary({cases:[c('a')],results:[r],receipt:{verified:true,sha:'a'.repeat(40),completedAt:null}});
  assert.equal(s.queue[0].status,'accepted'); assert.equal(s.queue[0].acceptedAt,null);
});
test('incomplete shared group and wrong receipt SHA cannot establish receipt acceptance',()=>{
  const r=result('r2','two');r.accepted=null;
  const s=workflowSummary({cases:[c('a'),c('b','two')],results:[result('r1','one'),r],receipt:{verified:true,sha:'a'.repeat(40)}});
  assert.equal(s.batches.length,0);assert(s.queue.every(row=>row.status!=='accepted'));
  const wrong=workflowSummary({cases:[c('a')],results:[result('r1','one')],receipt:{verified:true,sha:'b'.repeat(40)}});
  assert.notEqual(wrong.queue[0].status,'accepted');
});

test('adapter rejects stale bindings and separates repeated method kinds by version',async()=>{
  const {reviewFingerprint}=await import('./discovery-hub.mjs');
  const ref='a'.repeat(40), files={};
  const config={version:1,inventories:[{id:'fixture',ref,path:'diagnostics/fixture/inventory.json',cases:[]}],audits:[]};
  const inventory={runId:'run',baseSha:ref,cGitlink:ref,leads:[]};
  for(const [key,version] of [['a','v1'],['b','v2']]){
    const dir=`diagnostics/fixture/${key}`;
    const row={...lead(key),key:`source-audit:edge:${key}`,methods:[{kind:'call_graph',version,run_id:'run'}]};
    const run={runId:'run',baseSha:ref,cGitlink:ref,toolHashes:{sourceAudit:'tool'},methodConfigHashes:{sourceAudit:'config'},leads:[row]};
    const decision={key:row.key,evidenceKey:row.evidenceKey,runId:'run',reviewFingerprint:reviewFingerprint(run,row),status:'explained_negative'};
    inventory.leads.push({...row,reviewFingerprint:decision.reviewFingerprint});
    files[`${dir}/case.json`]={caseId:key,rootCause:key,status:'explained_negative'};
    files[`${dir}/projection/projection.json`]=run;files[`${dir}/decisions.json`]=[decision];
    config.inventories[0].cases.push({ref,path:`${dir}/case.json`,pr:1});
  }
  files['diagnostics/fixture/inventory.json']=inventory;
  const read=(_ref,path)=>Buffer.from(JSON.stringify(files[path]));
  const data=buildEvidence(config,read);
  assert.deepEqual(data.cohorts[0].strata.map(s=>[s.method.version,s.total,s.reviewed]),[['v1',1,1],['v2',1,1]]);
  files['diagnostics/fixture/b/decisions.json'][0].reviewFingerprint='stale';
  assert.throws(()=>buildEvidence(config,read),/Stale decision/);
});
