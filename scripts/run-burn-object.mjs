#!/usr/bin/env node
// timeout.c burn_object: independent carried and floor timers, with the
// goto_level late callback, blindness, quantity and hallucination variations.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BLINDED,BURN_OBJECT,TIMEOUT} from '../js/const.js';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {BRASS_LANTERN,CANDELABRUM_OF_INVOCATION,OIL_LAMP,POT_OIL,TALLOW_CANDLE,WAX_CANDLE} from '../js/objects.js';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix,runMatrixCli} from './fresh-matrix.mjs';
const names=['tallow-carried','candelabrum','oil-potion','oil-lamp','lantern',
 'blind-tallow','wax-floor-stack','floor-away','hallucinated-lantern'];
export function loadBurnObjectCases(){
 return names.map(name=>({name,recipe:validateCleanRecipe(JSON.parse(readFileSync(
  new URL(`../recipes/timeout.c/c121-burn-${name}.session.json`,import.meta.url))),name)}));
}
export async function verifyBurnObjectSegment(segment){
 const entry=loadBurnObjectCases().find(({recipe})=>recipe.segments[0].seed===segment.seed
  &&recipe.segments[0].moves===segment.moves);assert.ok(entry);let boundary;
 const replay=await runSegment(segment,{onBoundary(error){boundary=error;}});
 assert.equal(boundary,undefined,'the independent burn route finishes');
 const screens=replay.getScreens().join('\n');
 const objects=[];for(let obj=game.invent;obj;obj=obj.nobj)objects.push(obj);
 for(let obj=game.level.objlist;obj;obj=obj.nobj)objects.push(obj);
 const burnTypes=[TALLOW_CANDLE,WAX_CANDLE,POT_OIL,OIL_LAMP,BRASS_LANTERN,CANDELABRUM_OF_INVOCATION];
 const remaining=objects.filter(obj=>burnTypes.includes(obj.otyp));
 if(['oil-lamp','lantern','hallucinated-lantern','candelabrum'].includes(entry.name)){
  assert.equal(remaining.length,1,'an exhausted lamp or candelabrum remains');
  const obj=remaining[0];assert.equal(obj.age,0);assert.equal(obj.timed,0);assert.equal(obj.lamplit,false);
  if(entry.name==='candelabrum'){
   assert.equal(obj.spe,0);assert.equal(obj.owt,game.objects[obj.otyp].oc_weight);
   assert.match(screens,/Your candelabrum's candles are getting short\./u);
   assert.match(screens,/Your candelabrum's candles' flames flicker low!/u);
   assert.match(screens,/Your candelabrum's flames die\./u);
  }else if(entry.name==='oil-lamp'){
   assert.match(screens,/Your lamp flickers\./u);assert.match(screens,/Your lamp flickers considerably\./u);
   assert.match(screens,/Your lamp seems about to go out\./u);assert.match(screens,/Your lamp has gone out\./u);
  }else{
   assert.match(screens,/Your lantern is getting dim\./u);assert.match(screens,/Your lantern has run out of power\./u);
   if(entry.name==='hallucinated-lantern')assert.match(screens,/Batteries have not been invented yet\./u);
  }
 }else{
  assert.equal(remaining.length,0,'burned candles or oil are extracted and freed');
  if(entry.name==='floor-away'){
   assert.equal(game.u.uz.dlevel,1,'the wizard returns to the original level');
   assert.match(screens,/Dlvl:2/u);assert.match(screens,/The candle catches light!/u);
   assert.doesNotMatch(screens,/candle getting short|candle's flame flicker|candle consumed/u,
    'the late callback returns without the ordinary on-time warnings');
  }else if(entry.name==='wax-floor-stack'){
   assert.match(screens,/You see some candles getting short\./u);
   assert.match(screens,/You see some candles' flames flicker low!/u);
   assert.match(screens,/You see some candles consumed!/u);
  }else if(entry.name==='oil-potion')assert.match(screens,/Your potion of oil has burnt away\./u);
  else{
   assert.match(screens,/Your candle is consumed!/u);
   if(entry.name==='blind-tallow'){
    assert.ok(game.u.uprops[BLINDED].extrinsic||game.u.uprops[BLINDED].intrinsic&TIMEOUT);
    assert.doesNotMatch(screens,/Its flame dies\./u);
   }else{
    assert.match(screens,/Your candle is getting short\./u);assert.match(screens,/Your candle's flame flickers low!/u);
    assert.match(screens,/Its flame dies\./u);
   }
  }
 }
 for(let timer=game.gt.timer_base;timer;timer=timer.next)
  assert.notEqual(timer.func_index,BURN_OBJECT,'no burn timer remains after exhaustion');
 assert.equal(game.gl.light_base,null,'exhaustion removes the object light');
 assert.equal(game.unported.has('timeout.c burn_object'),false);
}
export async function runBurnObjectMatrix(){
 return runFreshMatrix({entries:loadBurnObjectCases().map(({name,recipe})=>({label:name,recipe})),
  verifySegment:verifyBurnObjectSegment,summaryLabel:'BURN OBJECT',chunkLimit:1});
}
runMatrixCli(import.meta.url,runBurnObjectMatrix,'burn object');
