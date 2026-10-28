import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {compareSessionOutputs,runJsSession} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
const rows=JSON.parse(readFileSync(new URL('recordings.json',import.meta.url)));
const workspace=createScoringWorkspace('.',[]);
try{for(const row of rows){
 const raw=gunzipSync(readFileSync(new URL(`${row.seed}.recorded.session.json.gz`,import.meta.url)));
 assert.equal(createHash('sha256').update(raw).digest('hex'),row.rawHashes['recorded.session.json']);
 const c=JSON.parse(raw),result=compareSessionOutputs(c,await runJsSession(c,workspace));
 console.log(JSON.stringify({seed:row.seed,program:row.program,passed:result.passed,lengths:result.lengths}));
 assert.equal(result.passed,true,JSON.stringify(result));
}}finally{removeScoringWorkspace(workspace);}
