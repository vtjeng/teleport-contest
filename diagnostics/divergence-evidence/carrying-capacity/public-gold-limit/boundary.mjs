import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createScoringWorkspace,removeScoringWorkspace} from '../../../../scripts/scoring-workspace.mjs';
const input=process.argv[2];
const recording=JSON.parse(readFileSync(input));
const root=createScoringWorkspace('.',[]);
try {
 const {runSegment}=await import(pathToFileURL(`${root}/js/jsmain.js`).href);
 const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),get length(){return values.size},key:i=>[...values.keys()][i]??null};
 const boundaries=[];
 const game=await runSegment({...recording.segments[0],storage},{onBoundary:error=>boundaries.push({name:error.name,message:error.message,stack:error.stack})});
 console.log(JSON.stringify({boundaries,screens:game.getScreens().length,rng:game.getRngLog().length},null,2));
} finally {removeScoringWorkspace(root);}
