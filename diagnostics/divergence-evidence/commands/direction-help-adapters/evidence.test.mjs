import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {activeLeadIndex,applyDecisions,reviewTemplate} from '../../../../scripts/discovery-hub.mjs';
import {compareSessionOutputs,formatReport,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const json=n=>JSON.parse(read(n));
const source=read('../../../../js/cmd.js');
const start=source.indexOf('async function help_dir(');
const body=source.slice(start,source.indexOf('// C ref: cmd.c get_adjacent_loc',start));
test('production help character expressions match actual C over all 256 bytes',()=>{
 assert.equal(createHash('sha256').update(body).digest('hex'),json('binding-source-check.json').sha256);
 const clean=body.replace(/\/\/[^\n]*/g,'');
 const begin=clean.indexOf('if (!prefixhandling && sym !== 0');
 assert.ok(begin>=0);
 const condition=clean.slice(begin+3,clean.indexOf('{',begin)).trim();
 const predicate=new Function('sym','prefixhandling',`return ${condition};`);
 const upperExpression=clean.match(/const upper = ([^;]+);/)[1];
 const uppercase=new Function('sym',`return ${upperExpression};`);
 const rows=read('character-oracle.jsonl').trim().split('\n').map(JSON.parse);assert.equal(rows.length,256);
 for(const [sym,eligible,upper] of rows){assert.equal(Number(predicate(sym,false)),eligible,`byte ${sym}`);if(eligible)assert.equal(uppercase(sym),upper,`upper ${sym}`);assert.equal(predicate(sym,true),false);}
});
test('literal-zero help block contributes no compiled pline edge',()=>{
 const c=read('../../../../nethack-c/upstream/src/cmd.c');
 const start=c.indexOf('help_dir(\n');const part=c.slice(start,c.indexOf('\n/* if hero is impaired',start));
 const dead=part.match(/#if 0[\s\S]*?#else/)[0];assert.equal((dead.match(/\bpline\(/g)||[]).length,2);
 assert.doesNotMatch(read('help-dir.preprocessed.c.txt'),/\bpline\s*\(/);
});
test('exact import filters only supplied decisions and stale configuration filters none',()=>{
 const run=json('projection.json'),decisions=json('review-decisions.json');assert.deepEqual(reviewTemplate(run,json('keys.json')),json('discovery-bindings.json'));
 assert.equal(activeLeadIndex(applyDecisions(run,decisions)).filtered.length,3);
 const partial=activeLeadIndex(applyDecisions(run,decisions.slice(0,1)));assert.equal(partial.filtered.length,1);assert.equal(partial.active.length,2);
 const stale=structuredClone(run);stale.methodConfigHashes.sourceAudit='changed';assert.equal(activeLeadIndex(applyDecisions(stale,decisions)).filtered.length,0);
});
for(const kind of ['invalid','requested'])test(`ordinary direction help: ${kind}`,async()=>{
 const recording=JSON.parse(gunzipSync(readFileSync(new URL(`${kind}.recording.json.gz`,import.meta.url))));const root=createScoringWorkspace(process.cwd(),[]);
 try{const result=compareSessionOutputs(recording,await runJsSession(recording,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root);}
});
