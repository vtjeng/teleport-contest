// Deliberate witness failure, outside the default scripts suite.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {compareSessionOutputs,formatReport,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
for(const kind of ['control','witness']) test(`extended command menu: ${kind}`,async()=>{
    const recording=JSON.parse(gunzipSync(readFileSync(new URL(`${kind}.recording.json.gz`,import.meta.url))));
    if(kind==='witness')assert.match(recording.segments[0].steps[1].screen,/a - adjust or annotate/u);
    const root=createScoringWorkspace(process.cwd(),[]);
    try{const result=compareSessionOutputs(recording,await runJsSession(recording,root));assert.equal(result.passed,true,formatReport(result));}
    finally{removeScoringWorkspace(root);}
});
