import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {runJsSession,compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
const mode=process.argv[2];
if(!['target','control'].includes(mode))throw Error('Usage: node replay.mjs target|control');
const recording=JSON.parse(gunzipSync(readFileSync(new URL(`./${mode}.session.json.gz`,import.meta.url))));
const root=createScoringWorkspace('.',[]);
try {
 const output=await runJsSession(recording,root);
 const result=compareSessionOutputs(recording,output);
 const step=mode==='target'?137:127;
 const screen=recording.segments[0].steps[step].screen;
 console.log(JSON.stringify({mode,cMessage:Array.isArray(screen)?screen[0]:screen.split('\n')[0],jsMessage:output.screens[step].split('\n')[0],...result},null,2));
 process.exitCode=result.passed?0:1;
} finally {removeScoringWorkspace(root);}
