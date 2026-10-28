import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {runJsSession,compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
const mode=process.argv[2];
assert(['target','control'].includes(mode));
const recording=JSON.parse(gunzipSync(readFileSync(new URL(`./${mode}.session.json.gz`,import.meta.url))));
const messages=recording.segments[0].steps.map(s=>Array.isArray(s.screen)?s.screen[0]:s.screen.split('\n')[0]);
assert(messages.some(s=>s.includes('guardian Angel of Lugh')));
assert(messages.some(s=>s.includes('A green slime appears')));
if(mode==='control') assert(messages[189].includes('green slime misses the guardian Angel'));
const root=createScoringWorkspace('.',[]);
try {
 const output=await runJsSession(recording,root);
 const result=compareSessionOutputs(recording,output);
 console.log(JSON.stringify({mode,scope:'Encounter coverage only; no guardian transition witnessed',...result},null,2));
 process.exitCode=result.passed?0:1;
} finally {removeScoringWorkspace(root);}
