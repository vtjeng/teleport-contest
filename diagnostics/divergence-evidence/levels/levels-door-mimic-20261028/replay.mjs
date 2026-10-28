import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { compareSessionOutputs, runJsSession } from '../../../../scripts/diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from '../../../../scripts/scoring-workspace.mjs';
const label=process.argv[2];assert.ok(['witness','control'].includes(label),'usage: node replay.mjs witness|control');
const raw=gunzipSync(readFileSync(new URL(`${label}.recorded.session.json.gz`,import.meta.url)));
const observations=JSON.parse(readFileSync(new URL('observations.json',import.meta.url)));
assert.equal(createHash('sha256').update(raw).digest('hex'),observations.attempts.find(a=>a.label===label).rawHashes['recorded.session.json']);
const recording=JSON.parse(raw),workspace=createScoringWorkspace('.',[]);
try {
 const result=compareSessionOutputs(recording,await runJsSession(recording,workspace));
 console.log(JSON.stringify({label,...result},null,2));
 assert.equal(result.passed,true,`${label}: C/JS parity required`);
}finally{removeScoringWorkspace(workspace);}
