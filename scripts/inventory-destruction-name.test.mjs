import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {GameMap} from '../js/game.js';
import {newMonster,place_monster} from '../js/monst.js';
import {mksobj,weight} from '../js/obj.js';
import {mpickobj} from '../js/steal.js';
import {discover_object} from '../js/o_init.js';
import {PM_HUMAN,NON_PM,AD_FIRE} from '../js/monsters.js';
import {POT_HEALING} from '../js/objects.js';
import {HALLUC,BLINDED,DETECT_MONSTERS,ROOM,STONE,OBJ_MINVENT,OBJ_DELETED} from '../js/const.js';
import {planningState} from '../js/unported_monster_actions.js';
import {destroy_items} from '../js/zap_destroy_items.js';
import {canseemon} from '../js/display.js';
import {light_globals_init} from '../js/light.js';
import {init_vision_globals,vision_reset,vision_recalc} from '../js/vision.js';
import {createCoreRandom,cloneIsaacContext,rn2_on_display_rng} from '../js/rng.js';

for(const hallu of [true,false])for(const visible of [true,false])for(const shape of ['single','one-of','both']){
 test(`destroyed inventory feedback Hallu=${hallu} visible=${visible} shape=${shape}`,async()=>{
  const outcomes=[];
  for(const planning of [true,false]){
   await runSegment({seed:8432077,datetime:'20270202100000',nethackrc:'OPTIONS=name:DestroyedInventory,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
   game.level=new GameMap();game.head_engr=null;
   for(let x=2;x<=15;x++)for(let y=2;y<=13;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
   game.u.ux=5;game.u.uy=7;
   for(const [index,active] of [[HALLUC,hallu],[BLINDED,false],[DETECT_MONSTERS,true]]){game.u.uprops[index].intrinsic=active?1000:0;game.u.uprops[index].extrinsic=0;}
   if(!visible)game.level.at(6,7).typ=STONE;
   const mon=newMonster({data:game.mons[PM_HUMAN],mnum:PM_HUMAN,cham:NON_PM,m_id:9984,m_lev:game.mons[PM_HUMAN].mlevel,mhp:30,mhpmax:30,mcanmove:true,mcansee:true});
   game.level.monlist=mon;place_monster(mon,7,7,game);
   light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
   discover_object(POT_HEALING,true,true,false,game);
   const obj=mksobj(POT_HEALING,false,false,{state:game});obj.quan=shape==='single'?1:2;obj.known=obj.dknown=true;obj.bknown=false;obj.blessed=obj.cursed=false;obj.owt=weight(obj,{state:game});
   mpickobj(mon,obj,{state:game});assert.equal(mon.minvent,obj);assert.equal(obj.where,OBJ_MINVENT);
   const state=planning?planningState(game):game,actor=state.level.monlist,item=actor.minvent;
   assert.equal(canseemon(actor,state),visible);
   const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),initial=item.quan;
   const source=createCoreRandom(cloneIsaacContext(state.coreCtx),state),draws=[],lines=[],cosmetic=[];let chances=0;
   const random=Object.fromEntries(Object.entries(source).map(([name,fn])=>[name,(...args)=>{fn(...args);let value;if(name==='rn2'&&args[0]===5)value=4;else if(name==='rnd'&&args[0]===6)value=2;else if(name==='rn2'&&args[0]===3)value=shape==='one-of'&&chances++===1?2:0;else assert.fail('Unexpected random '+name+' '+args);draws.push([name,...args,value]);return value;}]));
   const result=await destroy_items(actor,AD_FIRE,5,{state,planning,random,displayRandom:bound=>{cosmetic.push(bound);rn2_on_display_rng(bound,state);return 0;},message:async line=>{assert.equal(item.quan,initial);assert.equal(actor.mhp,30);lines.push(line);},unsupported:reason=>{throw new Error(reason);}});
   const count=shape==='both'?2:1;
   assert.equal(result,2);assert.equal(actor.mhp,30);assert.equal(actor.mhpmax,30);
   assert.deepEqual(draws,[['rn2',5,4],['rnd',6,2],...Array.from({length:initial},(_,i)=>['rn2',3,shape==='one-of'&&i===1?2:0])]);
   const name=hallu?'giant ant':'human';
   const text=shape==='single'?`The ${name}'s potion of healing boils and explodes!`:shape==='one-of'?`One of the ${name}'s potions of healing boils and explodes!`:`Both of the ${name}'s potions of healing boil and explode!`;
   assert.deepEqual(lines,visible?[text]:[]);assert.deepEqual(cosmetic,hallu&&visible?[430,2]:[]);
   if(count===initial){assert.equal(actor.minvent,null);assert.equal(item.where,OBJ_DELETED);}else{assert.equal(actor.minvent,item);assert.equal(item.where,OBJ_MINVENT);assert.equal(item.quan,initial-count);assert.equal(item.owt,weight(item,{state}));}
   assert.deepEqual(game.coreCtx,core);
   if(planning){assert.deepEqual(game.displayCtx,display);assert.equal(mon.minvent,obj);assert.equal(obj.quan,initial);assert.equal(obj.where,OBJ_MINVENT);}
   outcomes.push({result,draws,lines,cosmetic,hp:actor.mhp,remaining:actor.minvent?.quan||0,display:structuredClone(state.displayCtx)});
  }
  assert.deepEqual(outcomes[0],outcomes[1]);
 });
}

for(const name of ['normal','monochrome','before-control']) {
 test('destroyed monster inventory '+name+' matches independent C',async()=>{
  const root=createScoringWorkspace(process.cwd(),[]);
  try {
   const c=JSON.parse(fs.readFileSync(new URL('../recordings/zap.c/inventory-destruction-name-'+name+'.session.json',import.meta.url)));
   const result=compareSessionOutputs(c,await runJsSession(c,root));
   assert.equal(result.passed,true,formatReport(result));
  }finally{removeScoringWorkspace(root);}
 });
}
