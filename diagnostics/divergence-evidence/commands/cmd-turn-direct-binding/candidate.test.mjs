// Two witnesses of one defect; deliberately outside default CI.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {compareSessionOutputs,formatReport,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
for(const kind of ['control','witness','altmeta']) test(`direct turn binding: ${kind}`,async()=>{
    const recording=JSON.parse(gunzipSync(readFileSync(new URL(`${kind}.recording.json.gz`,import.meta.url))));
    assert.match(recording.segments[0].steps.at(-1).screen,/You don't know how to turn undead!/u);
    const root=createScoringWorkspace(process.cwd(),[]);
    try {const result=compareSessionOutputs(recording,await runJsSession(recording,root));assert.equal(result.passed,true,formatReport(result));}
    finally {removeScoringWorkspace(root);}
});
