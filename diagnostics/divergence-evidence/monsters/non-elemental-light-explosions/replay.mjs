import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {runJsSession,compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
const mode=process.argv[2];
assert(['target','control'].includes(mode));
const recording=JSON.parse(gunzipSync(readFileSync(new URL(`./${mode}.session.json.gz`,import.meta.url))));
const lines=recording.segments[0].steps.map(s=>Array.isArray(s.screen)?s.screen[0]:s.screen.split('\n')[0]);
assert(lines.some(s=>s.includes('explodes!')),'native explosion reached');
assert(lines.some(s=>s.includes(mode==='target'?'ogre looks confused.':'ogre is blinded.')),'opposite native status branch reached');
assert(lines.at(-1).includes('melancholy feeling'),'tame exploder death feedback reached');
const root=createScoringWorkspace('.',[]);
try {
 const output=await runJsSession(recording,root);
 const result=compareSessionOutputs(recording,output);
 console.log(JSON.stringify({mode,observedMessages:lines.slice(mode==='target'?55:56),...result},null,2));
 process.exitCode=result.passed?0:1;
} finally {removeScoringWorkspace(root);}
