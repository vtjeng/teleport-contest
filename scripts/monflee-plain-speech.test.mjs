import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {runJsSession,compareSessionOutputs} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
for(const mode of ['target','control'])test(`recorded gremlin verbalized fear ${mode}`,async()=>{
 const recording=JSON.parse(gunzipSync(readFileSync(new URL(`../diagnostics/divergence-evidence/monsters/gremlin-verbalized-fear/${mode}.session.json.gz`,import.meta.url))));
 const root=createScoringWorkspace('.',[]);
 try {
  const output=await runJsSession(recording,root);
  const result=compareSessionOutputs(recording,output);
  console.log(JSON.stringify({mode,...result}));
  assert.equal(result.error,null);assert.equal(result.rngMismatch,null);
  assert.equal(result.passed,true,JSON.stringify(result.screenMismatch));
 } finally {removeScoringWorkspace(root);}
});
