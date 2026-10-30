import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {m_at} from '../js/monst.js';
import {t_at} from '../js/trap.js';
import {preflight_dotrap} from '../js/trap_effects.js';
import {getRngLog} from '../js/rng.js';
import {ROOM,STONE,PIT,SHOPBASE,INVIS,DISPLACED,BLINDED,HALLUC,LEVITATION,FLYING} from '../js/const.js';
import {ROCK,LEASH} from '../js/objects.js';
import {S_EEL,S_MIMIC,PM_CHAMELEON} from '../js/monsters.js';
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
for(const name of cases){
 test(`bounded admission is repeatable and pure: ${name}`,async()=>{
  const {trap}=await setup(name),before=snapshot();
  for(let i=0;i<8;i++)assert.doesNotThrow(()=>preflight_dotrap(trap,game));
  assert.equal(snapshot(),before);
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

test('excluded-condition controls refuse without RNG or state writes',async()=>{
 const {trap,monster}=await setup();
 const change=(object,key,value)=>()=>{
  const had=Object.hasOwn(object,key),old=object[key];object[key]=value;
  return()=>{if(had)object[key]=old;else delete object[key];};
 };
 // Synthetic metadata mutations test admission only. They do not establish
 // reachability and never execute any excluded relocation or departure tail.
 const controls=[
  ...['wormno','isshk','ispriest','isgd','isminion','iswiz','mtrapped','mundetected',
   'mappearance','m_ap_type','minvis','mburied','msleeping','mfrozen','mblinded'].map(k=>[k,change(monster,k,1)]),
  ['monster inventory',change(monster,'minvent',{otyp:ROCK})],
  ['shapechanger',change(monster,'cham',PM_CHAMELEON)],
  ['blind monster',change(monster,'mcansee',false)],
  ['eel',change(monster,'data',{...monster.data,mlet:S_EEL})],
  ['mimic',change(monster,'data',{...monster.data,mlet:S_MIMIC})],
  ['stuck hero',change(game.u,'ustuck',monster)],
  ['mounted hero',change(game.u,'usteed',monster)],
  ['swallowed hero',change(game.u,'uswallow',true)],
  ['underwater hero',change(game.u,'uinwater',true)],
  ['punished hero',change(game,'uball',{otyp:ROCK})],
  ['occupation',change(game.go,'occupation',()=>{})],
  ['leash',change(game,'invent',{otyp:LEASH})],
  ...[INVIS,DISPLACED,BLINDED,HALLUC,LEVITATION,FLYING].map(p=>[`hero property${p}`,change(game.u.uprops,p,{intrinsic:1,extrinsic:0})]),
  ['region',change(game.level,'regions',[{}])],
  ['special room',change(game.level.rooms[0],'rtype',SHOPBASE)],
  ['neighbor wall',change(game.level.at(61,3),'typ',STONE)],
  ['neighbor object',change(game.level.objects[61],3,{otyp:ROCK})],
  ['destination object',change(game.level.objects[62],4,{otyp:ROCK})],
  ['neighbor trap',change(game.level,'traps',[...game.level.traps,{tx:61,ty:3,ttyp:PIT}])],
  ['neighbor engraving',change(game,'head_engr',{engr_x:61,engr_y:3,nxt_engr:null})],
  ['source in first ring',()=>{const restore=change(trap,'tx',61)();const restoreY=change(trap,'ty',3)();return()=>{restore();restoreY();};}],
  ['hero in first ring',()=>{const restore=change(game.u,'ux',61)();const restoreY=change(game.u,'uy',3)();return()=>{restore();restoreY();};}],
 ];
 for(const [label,mutate] of controls){
  const restore=mutate(),before=snapshot();
  try{assert.throws(()=>preflight_dotrap(trap,game),/a monster on a teleport trap destination/,label);assert.equal(snapshot(),before,label);}
  finally{restore();}
 }
 assert.equal(game.level.at(61,3).typ,ROOM);
});
