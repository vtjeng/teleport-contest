import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
const root=new URL('./test-fixtures/recovery-artifact-forced-drop/',import.meta.url);
const proof=JSON.parse(readFileSync(new URL('provenance.json',root)));
for(const row of proof.rows)test(`native C artifact forced drop ${row.kind}: ${row.name}`,async()=>{
    const raw=gunzipSync(readFileSync(new URL(`${row.name}.recording.json.gz`,root)));
    const recipe=readFileSync(new URL(`${row.name}.recipe.json`,root));
    assert.equal(createHash('sha256').update(raw).digest('hex'),row.recordingSha256);
    assert.equal(createHash('sha256').update(recipe).digest('hex'),row.recipeSha256);
    const c=JSON.parse(raw),r=JSON.parse(recipe);
    for(const key of ['seed','datetime','nethackrc','moves'])assert.equal(c.segments[0][key],r.segments[0][key]);
    const workspace=createScoringWorkspace(process.cwd(),[]);
    try{const result=compareSessionOutputs(c,await runJsSession(c,workspace));assert.equal(result.passed,true,formatReport(result));}
    finally{removeScoringWorkspace(workspace);}
});

// These production-input checks cover state that the terminal replay cannot expose.
for(const row of proof.rows)test(`forced-drop ownership after native-input recipe: ${row.name}`,async()=>{
    const {runSegment}=await import('../js/jsmain.js');
    const {ART_SUNSWORD}=await import('../js/artifacts.js');
    const {LONG_SWORD}=await import('../js/objects.js');
    const {PM_GIANT_BAT}=await import('../js/monsters.js');
    const c=JSON.parse(gunzipSync(readFileSync(new URL(`${row.name}.recording.json.gz`,root))));
    let boundary=null;const result=await runSegment(JSON.parse(readFileSync(new URL(`${row.name}.recipe.json`,root))).segments[0],{onBoundary:e=>boundary=e.message});
    const {game}=await import('../js/gstate.js'); // runSegment replaces the global game.
    assert.equal(boundary,null);assert.equal(result.getScreens().length,c.segments[0].steps.length);
    assert.equal(game.u.umonnum,PM_GIANT_BAT);assert.equal(game.uwep,null);
    let dropped;
    for(let obj=game.level.objlist;obj;obj=obj.nobj)if(row.name==='target'?obj.oartifact===ART_SUNSWORD:obj.otyp===LONG_SWORD)dropped=obj;
    assert.ok(dropped,'weapon reached floor');assert.equal(Boolean(dropped.lamplit),false);
    for(let light=game.gl.light_base;light;light=light.next)assert.notEqual(light.id,dropped);
    if(row.name==='target')assert.ok(result.getScreens().some(s=>s.includes('The long sword named Sunsword stops shining.')));
});
