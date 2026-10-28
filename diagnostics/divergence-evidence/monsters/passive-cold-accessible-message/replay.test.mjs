import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
for(const which of ['target','control'])test(`${which}: public native passive cold combat matches C`,async()=>{
 const c=JSON.parse(readFileSync(new URL(`./${which}.session.json`,import.meta.url)));
 const row=decodeScreen(c.segments[0].steps[66].screen)[0].map(c=>c.ch).join('').trim();
 assert.equal(row,`${which==='target'?'(west): ':''}The red dragon is suddenly very cold!--More--`);
 const root=createScoringWorkspace(process.cwd(),[]);
 try{
  const js=await runJsSession(c,root),result=compareSessionOutputs(c,js);
  console.log(JSON.stringify({which,cRow:row,result}));
  assert.equal(result.error,null);assert.equal(result.rngMismatch,null);
  if(which==='target'&&process.env.EXPECT_CURRENT_GAP==='1'){
   assert.equal(result.passed,false);assert.equal(result.screenMismatch.index,66);
   assert.equal(result.screenMismatch.cCell.ch,'(');assert.equal(result.screenMismatch.jsCell.ch,'T');
  }else assert.equal(result.passed,true,JSON.stringify(result));
 }finally{removeScoringWorkspace(root);}
});
