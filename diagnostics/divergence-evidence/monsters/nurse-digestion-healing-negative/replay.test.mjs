import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
test('public nurse-digestion witness matches C completely',async()=>{
 const c=JSON.parse(readFileSync(new URL('./public-witness.session.json',import.meta.url)));
 assert.match(c.segments[0].steps[109].screen,/swallows the nurse/);
 assert.match(c.segments[0].steps[110].screen,/nurse is killed![\s\S]*purple worm looks healthy/);
 const root=createScoringWorkspace(process.cwd(),[]);
 try{const result=compareSessionOutputs(c,await runJsSession(c,root));console.log(formatReport(result));assert.equal(result.passed,true,formatReport(result));}
 finally{removeScoringWorkspace(root);}
});
