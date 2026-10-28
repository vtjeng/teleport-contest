import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {compareSessionOutputs,formatReport,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
import {activeLeadIndex,applyDecisions,reviewTemplate} from '../../../../scripts/discovery-hub.mjs';
const json=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
test('originating description lead remains unresolved and visible',()=>{
 const run=json('projection.json'),decisions=json('review-decisions.json');assert.deepEqual(reviewTemplate(run,json('keys.json')),json('discovery-bindings.json'));
 assert.equal(decisions[0].status,'unresolved');const view=activeLeadIndex(applyDecisions(run,decisions));assert.equal(view.filtered.length,0);assert.deepEqual(view.active,json('keys.json'));
});
for(const kind of ['control','target'])test(`${kind}: queued map-symbol command parity`,async()=>{
 const recording=JSON.parse(gunzipSync(readFileSync(new URL(`${kind}.recording.json.gz`,import.meta.url))));
 const root=createScoringWorkspace(process.cwd(),[]);
 try{const result=compareSessionOutputs(recording,await runJsSession(recording,root));assert.equal(result.passed,true,formatReport(result));}
 finally{removeScoringWorkspace(root);}
});
