// Run from repository root, independently per case. Uses the saved C oracle
// and the existing comparison/scorer overlay; no recorder build is needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { compareSessionOutputs, runJsSession } from '../../../../scripts/diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from '../../../../scripts/scoring-workspace.mjs';
const label=process.argv[2];
assert.ok(['witness','control'].includes(label),'usage: node replay.mjs witness|control');
const recording=JSON.parse(gunzipSync(readFileSync(new URL(`${label}.recorded.session.json.gz`,import.meta.url))));
const workspace=createScoringWorkspace('.',[]);
try {
 const result=compareSessionOutputs(recording,await runJsSession(recording,workspace));
 console.log(JSON.stringify({label,...result},null,2));
 // A ready candidate must fail against current code and pass after Main's fix.
 assert.equal(result.passed,true,`${label}: C/JS parity required`);
} finally { removeScoringWorkspace(workspace); }
