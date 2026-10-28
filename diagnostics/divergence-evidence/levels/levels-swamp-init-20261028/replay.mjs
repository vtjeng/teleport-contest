import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { compareSessionOutputs, runJsSession } from '../../../../scripts/diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from '../../../../scripts/scoring-workspace.mjs';
const seed=Number(process.argv[2]);assert.ok([28103301,28103302].includes(seed));
const bytes=gunzipSync(readFileSync(new URL(`${seed}.recorded.session.json.gz`,import.meta.url)));
const metadata=JSON.parse(readFileSync(new URL('recording-results.json',import.meta.url)));
assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata.cases.find(c=>c.seed===seed).rawHashes['recorded.session.json']);
const recording=JSON.parse(bytes),workspace=createScoringWorkspace('.',[]);
try {const result=compareSessionOutputs(recording,await runJsSession(recording,workspace));console.log(JSON.stringify({seed,...result},null,2));assert.equal(result.passed,true);}
finally {removeScoringWorkspace(workspace);}
