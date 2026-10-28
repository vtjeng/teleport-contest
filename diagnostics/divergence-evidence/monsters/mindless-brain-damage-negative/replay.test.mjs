import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
for(const which of ['target','control'])test(`public ${which} matches complete C recording`,async()=>{
 const c=JSON.parse(readFileSync(new URL(`./${which}.session.json`,import.meta.url)));
 const steps=c.segments[0].steps;
 assert.ok(steps.some(s=>s.screen.includes(which==='target'?"The flesh golem's brain is eaten!":"The hill giant's brain is eaten!")));
 if(which==='target')assert.ok(steps.some(s=>s.screen.includes("The flesh golem doesn't notice.")));
 assert.ok(steps.some(s=>s.rng.some(r=>r.includes('@ eat_brains('))));
 const root=createScoringWorkspace(process.cwd(),[]);
 try{const result=compareSessionOutputs(c,await runJsSession(c,root));console.log(formatReport(result));assert.equal(result.passed,true,formatReport(result));}
 finally{removeScoringWorkspace(root);}
});
test('C preserves base damage after mindless brain-result MISS',()=>{
 const c=readFileSync(new URL('../../../../nethack-c/upstream/src/eat.c',import.meta.url),'utf8');
 const arm=c.slice(c.indexOf('} else { /* mhitm */'),c.indexOf('/* eating a corpse or egg'));
 assert.match(arm,/if \(mindless\(pd\)\) \{[\s\S]*?return M_ATTK_MISS;[\s\S]*?else if \(is_rider\(pd\)\)/);
 const mindless=arm.slice(arm.indexOf('if (mindless(pd))'),arm.indexOf('else if (is_rider(pd))'));
 assert.ok(!mindless.includes('*dmg_p'));assert.ok(!mindless.includes('skipdrin'));
 assert.ok(arm.includes('*dmg_p += xtra_dmg;'));
 const hit=readFileSync(new URL('../../../../nethack-c/upstream/src/mhitm.c',import.meta.url),'utf8');
 assert.match(hit,/if \(mhm.done\)\s*return mhm.hitflags;\s*if \(!mhm.damage\)\s*return mhm.hitflags;\s*mdef->mhp -= mhm.damage;/);
 const typed=readFileSync(new URL('../../../../nethack-c/upstream/src/uhitm.c',import.meta.url),'utf8');
 assert.ok(typed.includes('mhm->hitflags = eat_brains(magr, mdef, gv.vis, &mhm->damage);'));
});
