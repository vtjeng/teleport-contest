import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {runJsSession,compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
for(const mode of ['target','control'])test(`recorded cold-resistant passive ${mode}`,async()=>{
 const recording=JSON.parse(gunzipSync(readFileSync(new URL(`./${mode}.session.json.gz`,import.meta.url))));
 const root=createScoringWorkspace('.',[]);
 try {
  const output=await runJsSession(recording,root);
  const result=compareSessionOutputs(recording,output);
  console.log(JSON.stringify({mode,...result}));
  assert.equal(result.error,null);assert.equal(result.rngMismatch,null);
  if(process.env.CHARACTERIZE==='1'&&mode==='target'){
   assert.equal(result.passed,false);assert.equal(result.screenMismatch.location.stepIndex,64);
   assert.equal(result.screenMismatch.cCell.ch,'(');assert.equal(result.screenMismatch.jsCell.ch,'T');
  } else assert.equal(result.passed,true,JSON.stringify(result.screenMismatch));
 } finally {removeScoringWorkspace(root);}
});
