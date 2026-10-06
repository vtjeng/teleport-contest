#!/usr/bin/env node
// dothrow.c release_camera_demon: scan range 120061001–120061016 was fixed
// before probing Tourist starting cameras. Six of sixteen natural cameras
// released homunculi. In that same range cursed-camera and blindfold variations
// yielded five and seven releases respectively, including imps; the first
// hallucination variation reached a homunculus. No range was widened.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BLINDED,HALLUC,TIMEOUT} from '../js/const.js';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {PM_HOMUNCULUS,PM_IMP} from '../js/monsters.js';
import {EXPENSIVE_CAMERA} from '../js/objects.js';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix,runMatrixCli} from './fresh-matrix.mjs';
const names=['no-release','homunculus','cursed-imp','cursed-homunculus',
    'blind-imp','hallucinated-homunculus','fired-homunculus'];
export function loadCameraDemonCases(){
 return names.map(name=>({name,recipe:validateCleanRecipe(JSON.parse(readFileSync(
  new URL(`../recipes/dothrow.c/c120-camera-demon-${name}.session.json`,import.meta.url))),name)}));
}
export async function verifyCameraDemonSegment(segment){
 const entry=loadCameraDemonCases().find(({recipe})=>recipe.segments[0].seed===segment.seed
  &&recipe.segments[0].moves===segment.moves);assert.ok(entry);let boundary;
 const replay=await runSegment(segment,{onBoundary(error){boundary=error;}});
 assert.equal(boundary,undefined,'the input completes the camera breakage');
 const cameras=[];for(let o=game.invent;o;o=o.nobj)if(o.otyp===EXPENSIVE_CAMERA)cameras.push(o);
 assert.equal(cameras.length,entry.name.startsWith('cursed')?1:0,'the selected camera was destroyed');
 const demons=[];for(let m=game.level.monlist;m;m=m.nmon)
  if(m.data.pmidx===PM_HOMUNCULUS||m.data.pmidx===PM_IMP)demons.push(m);
 const screens=replay.getScreens().join('\n');
 if(entry.name==='no-release'){
  assert.equal(demons.length,0);assert.doesNotMatch(screens,/ is released!/u);
 }else{
  assert.equal(demons.length,1);
  const expected=entry.name.endsWith('imp')?PM_IMP:PM_HOMUNCULUS;
  assert.equal(demons[0].data.pmidx,expected);
  assert.equal(Boolean(demons[0].mpeaceful),!entry.name.startsWith('cursed'));
  if(entry.name==='blind-imp'){
   assert.ok(game.u.uprops[BLINDED].extrinsic);assert.doesNotMatch(screens,/ is released!/u);
  }else if(entry.name==='hallucinated-homunculus'){
   assert.ok(game.u.uprops[HALLUC].intrinsic&TIMEOUT);
   assert.match(screens,/An? [^\n]+ is released!/u);
   assert.doesNotMatch(screens,/The picture-painting demon is released!/u);
  }else assert.match(screens,/The picture-painting demon is released!/u);
 }
 assert.equal(game.unported.has('dothrow.c release_camera_demon'),false);
}
export async function runCameraDemonMatrix(){
 return runFreshMatrix({entries:loadCameraDemonCases().map(({name,recipe})=>({label:name,recipe})),
  verifySegment:verifyCameraDemonSegment,summaryLabel:'CAMERA DEMON',chunkLimit:1});
}
runMatrixCli(import.meta.url,runCameraDemonMatrix,'camera demon');
