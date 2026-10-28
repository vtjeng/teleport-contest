import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
test('public witness matches C completely',async()=>{
 const c=JSON.parse(readFileSync(new URL('./public-witness.session.json',import.meta.url)));
 assert.ok(c.segments[0].steps.some(s=>s.screen.includes('The large dog suddenly disappears!')));
 const root=createScoringWorkspace(process.cwd(),[]);
 try{const result=compareSessionOutputs(c,await runJsSession(c,root));console.log(formatReport(result));assert.equal(result.passed,true,formatReport(result));}
 finally{removeScoringWorkspace(root);}
});
