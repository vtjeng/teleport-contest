import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
const root=new URL('./test-fixtures/recovery-status-threshold-order/',import.meta.url);
const proof=JSON.parse(readFileSync(new URL('provenance.json',root)));
for(const row of proof.rows)test(`native C status threshold order ${row.kind}: ${row.name}`,async()=>{
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
