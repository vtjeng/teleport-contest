import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {runJsSession,compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
const mode=process.argv[2];assert(['target','control'].includes(mode));
const recording=JSON.parse(gunzipSync(readFileSync(new URL(`./${mode}.session.json.gz`,import.meta.url))));
const lines=recording.segments[0].steps.map(s=>Array.isArray(s.screen)?s.screen[0]:s.screen.split('\n')[0]);
assert(lines[48].includes('Medusa appears'));assert.equal(lines.some(s=>s.includes("You meet Medusa's gaze.")&&s.includes('You turn into a stone golem!')),mode==='target');assert(lines.some(s=>s.includes('Medusa hits!')));
const root=createScoringWorkspace('.',[]);
try {const output=await runJsSession(recording,root);const result=compareSessionOutputs(recording,output);console.log(JSON.stringify({mode,...result},null,2));process.exitCode=result.passed?0:1;}finally{removeScoringWorkspace(root);}
