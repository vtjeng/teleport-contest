import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster } from '../js/monst.js';
import { newObject, place_object, weight } from '../js/obj.js';
import { PM_PURPLE_WORM, PM_KILLER_BEE, NON_PM } from '../js/monsters.js';
import { CORPSE } from '../js/objects.js';
import { BLINDED,HALLUC,DETECT_MONSTERS,ROOM,STONE,OBJ_DELETED } from '../js/const.js';
import { planningState } from '../js/unported_monster_actions.js';
import { meatcorpse } from '../js/mon.js';
import { canseemon } from '../js/display.js';
import { light_globals_init } from '../js/light.js';
import { init_vision_globals,vision_reset,vision_recalc,cansee } from '../js/vision.js';
import { createCoreRandom,cloneIsaacContext,rn2_on_display_rng } from '../js/rng.js';

for(const hallu of [true,false])for(const visible of [true,false])for(const verbose of [true,false]){
 test(`corpse meal feedback Hallu=${hallu} visible=${visible} verbose=${verbose}`,async()=>{
  const outcomes=[];
  for(const planning of [true,false]){
   await runSegment({seed:8432075,datetime:'20270131100000',nethackrc:'OPTIONS=name:MealFeedback,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
   game.level=new GameMap();game.head_engr=null;
   for(let x=2;x<=15;x++)for(let y=2;y<=13;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
   game.u.ux=5;game.u.uy=7;
   for(const [index,active] of [[BLINDED,false],[HALLUC,hallu],[DETECT_MONSTERS,true]]){game.u.uprops[index].intrinsic=active?1000:0;game.u.uprops[index].extrinsic=0;}
   if(!visible)game.level.at(6,7).typ=STONE;
   game.flags.verbose=verbose;game.flags.acoustics=true;
   const worm=newMonster({data:game.mons[PM_PURPLE_WORM],mnum:PM_PURPLE_WORM,cham:NON_PM,m_id:9980,m_lev:game.mons[PM_PURPLE_WORM].mlevel,mhp:66,mhpmax:80,mcanmove:true,mcansee:true,mtame:0});
   game.level.monlist=worm;place_monster(worm,7,7,game);
   const type=game.objects[CORPSE];
   const corpse=newObject({otyp:CORPSE,oclass:type.oc_class,material:type.oc_material,quan:1,corpsenm:PM_KILLER_BEE,age:game.moves});corpse.owt=weight(corpse,{state:game});
   place_object(corpse,7,7,{state:game});
   light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
   const state=planning?planningState(game):game,actor=state.level.monlist,obj=state.level.objlist;
   assert.equal(canseemon(actor,state),visible);assert.equal(cansee(7,7,state),visible);
   const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx);
   const source=createCoreRandom(cloneIsaacContext(state.coreCtx),state),draws=[],lines=[],cosmetic=[],redraws=[];
   const random=Object.fromEntries(Object.entries(source).map(([name,fn])=>[name,(...args)=>{fn(...args);assert.equal(name,'rn2');const value=args[0]-1;draws.push([name,...args,value]);return value;}]));
   const result=await meatcorpse(actor,{state,planning,random,redraw:(x,y)=>redraws.push([x,y]),displayRandom:bound=>{cosmetic.push(bound);rn2_on_display_rng(bound,state);return 0;},message:async line=>{assert.equal(actor.mhp,66);assert.equal(obj.where,1);lines.push(line);},unsupported:reason=>{throw new Error(reason);}});
   assert.equal(result,1);assert.equal(actor.mhp,Math.min(80,66+type.oc_weight));assert.equal(actor.mhpmax,80);assert.equal(actor.mintrinsics||0,0);assert.equal(actor.meating||0,0);assert.equal(actor.mnum,PM_PURPLE_WORM);
   assert.deepEqual(redraws,[[7,7]]);assert.equal(obj.where,OBJ_DELETED);assert.equal(state.level.objlist,null);assert.equal(state.level.objects[7][7],null);
   // C delobj_core/obj_resists spends rn2(100) before corpse intrinsic selection.
   assert.deepEqual(draws,[['rn2',100,99],['rn2',1,0],['rn2',4,3],['rn2',15,14]]);
   assert.deepEqual(lines,!verbose?[]:visible?[`The ${hallu?'giant ant':'purple worm'} eats a killer bee corpse!`]:['You hear a masticating sound.']);
   assert.deepEqual(cosmetic,hallu&&visible&&verbose?[430,2]:[]);
   assert.deepEqual(game.coreCtx,core);
   if(planning){assert.deepEqual(game.displayCtx,display);assert.equal(worm.mhp,66);assert.equal(corpse.where,1);assert.equal(game.level.objlist,corpse);}
   outcomes.push({result,draws,lines,cosmetic,redraws,hp:actor.mhp,display:structuredClone(state.displayCtx),type:actor.mnum,intrinsics:actor.mintrinsics||0});
  }
  assert.deepEqual(outcomes[0],outcomes[1]);
 });
}

for(const name of ['normal','monochrome','before-control']) {
 test('monster corpse meal '+name+' matches independent C',async()=>{
  const root=createScoringWorkspace(process.cwd(),[]);
  try {
   const c=JSON.parse(fs.readFileSync(new URL('../recordings/mon.c/meal-feedback-owner-'+name+'.session.json',import.meta.url)));
   const result=compareSessionOutputs(c,await runJsSession(c,root));
   assert.equal(result.passed,true,formatReport(result));
  }finally{removeScoringWorkspace(root);}
 });
}
