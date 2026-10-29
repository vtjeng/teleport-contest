import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {runJsSession,compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
await import('./source-proof.mjs');
const mode=process.argv[2];assert(['target','control'].includes(mode));
const recording=JSON.parse(gunzipSync(readFileSync(new URL(`./${mode}.session.json.gz`,import.meta.url))));
const lines=recording.segments[0].steps.map(s=>Array.isArray(s.screen)?s.screen[0]:s.screen.split('\n')[0]);
assert(lines.some(s=>s.includes(mode==='target'?'A pillar of fire strikes all around you!':'A bolt of lightning strikes down at you from above!')));
if(mode==='control'){assert(lines.at(-1).includes('blinded by the flash'));assert(!lines.some(s=>s.includes('It bounces off')));}
else assert(lines.at(-1).includes('Grand Master points at you'));
const root=createScoringWorkspace('.',[]);
try{const output=await runJsSession(recording,root);const result=compareSessionOutputs(recording,output);console.log(JSON.stringify({mode,...result},null,2));process.exitCode=result.passed?0:1;}finally{removeScoringWorkspace(root);}
