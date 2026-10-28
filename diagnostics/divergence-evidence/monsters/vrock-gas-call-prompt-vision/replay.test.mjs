import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
for(const name of ['control','target'])test(`Vrock gas ${name} matches C`,async()=>{
 const c=JSON.parse(readFileSync(new URL(`./${name}.session.json`,import.meta.url)));
 assert.ok(c.segments[0].steps.some(s=>s.rng.some(r=>r.includes('monflee(monmove.c:522)'))));
 const root=createScoringWorkspace(process.cwd(),[]);
 try{const result=compareSessionOutputs(c,await runJsSession(c,root));console.log(formatReport(result));assert.equal(result.passed,true,formatReport(result));}
 finally{removeScoringWorkspace(root);}
});
