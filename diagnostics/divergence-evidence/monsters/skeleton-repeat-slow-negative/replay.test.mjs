import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
test('public witness matches C completely',async()=>{
 const c=JSON.parse(readFileSync(new URL('./public-witness.session.json',import.meta.url)));
 assert.ok(c.segments[0].steps.some(s=>s.screen.includes('The stone golem slows down.')));
 const steps=c.segments[0].steps;
 assert.match(steps[154].screen,/stone golem seems to be moving slower/);
 assert.match(steps[155].screen,/stone golem slows down/);
 assert.ok(steps[158].rng.some(r=>r.includes('rn2(10)=1 @ mhitm_mgc_atk_negated')));
 assert.ok(!steps[159].screen.includes('slows down'));
 const root=createScoringWorkspace(process.cwd(),[]);
 try{const result=compareSessionOutputs(c,await runJsSession(c,root));console.log(formatReport(result));assert.equal(result.passed,true,formatReport(result));}
 finally{removeScoringWorkspace(root);}
});
