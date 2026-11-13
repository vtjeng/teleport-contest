import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runSegmentStrict as runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {m_at} from '../js/monst.js';
import {t_at} from '../js/trap.js';
import {getRngLog} from '../js/rng.js';
import {compareSessionOutputs,runJsSession} from './diff-fresh.mjs';

const cases=['brown-mold-peaceful','brown-mold-hostile','yellow-mold-peaceful','yellow-mold-hostile'];
const file=(kind,name)=>new URL(`../${kind}/teleport.c/post53-occupied-bounded-${name}.session.json`,import.meta.url);
const read=(kind,name)=>JSON.parse(readFileSync(file(kind,name)));
async function setup(name=cases[0]){
 const segment=read('recipes',name).segments[0];let boundary;
 assert.ok(segment.moves.endsWith('ly.'));
 await runSegment({...segment,moves:segment.moves.slice(0,-3)},{onBoundary:e=>boundary=e});
 assert.equal(boundary,undefined);
 assert.deepEqual([game.u.ux,game.u.uy],[64,2]);
 const trap=t_at(65,2,game),monster=m_at(62,4,game);
 assert.deepEqual(trap.teledest,{x:62,y:4});assert.ok(monster&&monster.mhp>0);
 assert.equal(monster.mpeaceful,name.endsWith('peaceful'));
 assert.equal(monster.minvent,null);assert.equal(monster.msleeping,false);
 assert.equal(game.level.regions.length,0);
 return {trap,monster};
}
function snapshot(){
 const seen=new Map();
 return JSON.stringify({u:game.u,level:game.level,track:game.track,context:game.context,
  gf:game.gf,go:game.go,core:game.coreCtx,display:game.displayCtx,engr:game.head_engr,
  inventory:game.invent,topline:game._ttyToplines,rng:getRngLog()},(_key,value)=>{
  if(typeof value==='bigint')return `${value}n`;
  if(typeof value==='function')return `[function:${value.name}]`;
  if(value&&typeof value==='object'){
   if(seen.has(value))return `[ref:${seen.get(value)}]`;
   seen.set(value,seen.size);
  }
  return value;
 });
}
for(const name of [...cases,'brown-mold-retry','empty-control']){
 test(`full C command, visible grid and following turn: ${name}`,async()=>{
  const recording=read('recordings',name),segment=recording.segments[0];
  // Genesis has its own earlier placement shuffle; isolate confirmed trap entry.
  const shuffleSteps=segment.steps.filter(step=>step.key==='y'&&step.rng?.some(x=>x.includes('collect_coords(teleport.c:')));
  if(name==='empty-control')assert.equal(shuffleSteps.length,0);
  else {
   assert.equal(shuffleSteps.length,1);
   assert.equal(shuffleSteps[0].rng.filter(x=>x.includes('collect_coords(teleport.c:')).length,45);
  }
  assert.equal(segment.steps.at(-1).key,'.');assert.ok(segment.steps.at(-1).rng.length>0);
  const result=compareSessionOutputs(recording,await runJsSession(recording,process.cwd()));
  assert.equal(result.passed,true,JSON.stringify(result));
  assert.deepEqual([game.u.ux,game.u.uy],[62,4]);assert.equal(m_at(62,4,game),null);
  if(name!=='empty-control'){
   const monster=m_at(61,5,game);assert.ok(monster);assert.equal(monster.mpeaceful,!name.endsWith('hostile'));
   assert.deepEqual([monster.mx,monster.my],[61,5]);
   // Ordinary vision exposes every cell in the destination neighborhood.
   // C's exact screen comparison above pins this visible grid after arrival
   // and the real following turn; the native pointers must agree with it.
   for(let x=61;x<=63;x++)for(let y=3;y<=5;y++)
    assert.equal(m_at(x,y,game),x===61&&y===5?monster:null);
  }
 });
}

