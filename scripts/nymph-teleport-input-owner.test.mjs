import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

// C uhitm.c mhitm_ad_sedu finishes theft output before controlled rloc input.
for(const name of ['normal','monochrome','before-control','ordinary-control'])test(`nymph teleport input ${name} matches independent C`,async()=>{
 const root=createScoringWorkspace(process.cwd(),[]);
 try{const c=JSON.parse(readFileSync(new URL(`../recordings/uhitm.c/nymph-teleport-input-owner-${name}.session.json`,import.meta.url)));const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root);}
});
