// Existing allowed PR110 public C recording prefix through count-one admission.
// Earlier status transitions remain in the prefix. Separate source ablations,
// not truncation alone, distinguish the two causes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
test('C recording prefix admits one arrow from the heavy floor stack',async()=>{
  const file='silent-status-target.session.json.gz';
  const dir=new URL('./fixtures/capacity-public/',import.meta.url);
  const bytes=gunzipSync(readFileSync(new URL(file,dir)));
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',dir)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.fixtures.find(row=>row.file===file).sha256);
  const recorded=JSON.parse(bytes);
  assert.equal(recorded.segments.length,1);
  const segment=recorded.segments[0];
  assert.equal(segment.moves[31],',','source prerequisite boundary must remain unchanged');
  segment.moves=segment.moves.slice(0,32);
  segment.steps=segment.steps.slice(0,33);
  const root=createScoringWorkspace(process.cwd(),[]);
  try{
    const result=compareSessionOutputs(recorded,await runJsSession(recorded,root));
    assert.equal(result.passed,true,formatReport(result));
  }finally{removeScoringWorkspace(root);}
});
