import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GameMap } from '../js/game.js';
import { newMonster,place_monster,remove_monster } from '../js/monst.js';
import { PM_ACID_BLOB,NON_PM,AT_WEAP } from '../js/monsters.js';
import { HALLUC,BLINDED,ACID_RES,ROOM,M_ATTK_HIT } from '../js/const.js';
import { planningState } from '../js/unported_monster_actions.js';
import { passive } from '../js/uhitm.js';
import { light_globals_init } from '../js/light.js';
import { init_vision_globals,vision_reset,vision_recalc } from '../js/vision.js';
import { createCoreRandom,cloneIsaacContext,rn2_on_display_rng } from '../js/rng.js';

for(const hallu of [true,false])for(const blind of [true,false])for(const resistant of [true,false]){
 test(`passive acid liquid Hallu=${hallu} Blind=${blind} resistant=${resistant}`,async()=>{
  const outcomes=[];
  for(const planning of [true,false]){
   await runSegment({seed:8432076,datetime:'20270201100000',nethackrc:'OPTIONS=name:PassiveAcid,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
   game.level=new GameMap();game.head_engr=null;
   for(let x=2;x<=15;x++)for(let y=2;y<=13;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
   game.u.ux=5;game.u.uy=7;game.u.uhp=game.u.uhpmax=200;game.flags.verbose=true;game.flags.showdamage=false;
   game.context.mon_moving=false;
   for(const [index,active] of [[HALLUC,hallu],[BLINDED,blind],[ACID_RES,resistant]]){game.u.uprops[index].intrinsic=active?1000:0;game.u.uprops[index].extrinsic=0;}
   const blob=newMonster({data:game.mons[PM_ACID_BLOB],mnum:PM_ACID_BLOB,cham:NON_PM,m_id:9982,m_lev:game.mons[PM_ACID_BLOB].mlevel,mhp:1,mhpmax:20,mcanmove:true,mcansee:true});
   game.level.monlist=blob;place_monster(blob,6,7,game);remove_monster(6,7,game);blob.mhp=0;
   light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
   const state=planning?planningState(game):game,actor=state.level.monlist;
   const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),exercise=state.u.aexe[0],globalExercise=game.u.aexe[0];
   const source=createCoreRandom(cloneIsaacContext(state.coreCtx),state),draws=[],lines=[],cosmetic=[];
   const random=Object.fromEntries(Object.entries(source).map(([name,fn])=>[name,(...args)=>{fn(...args);const value=name==='d'?args[0]:args[0]-1;draws.push([name,...args,value]);return value;}]));
   const result=await passive(actor,null,true,false,AT_WEAP,false,state,{planning,random,displayRandom:planning?bound=>{cosmetic.push(bound);return rn2_on_display_rng(bound,state);}:undefined,message:async line=>{assert.equal(state.u.uhp,200);assert.deepEqual(draws,[['d',1,8,1],['rn2',2,1]]);lines.push(line);},encumberMessage:async()=>{},unsupported:reason=>{throw new Error(reason);}});
   assert.equal(state.u.aexe[0],exercise-1);assert.equal(result,M_ATTK_HIT);assert.equal(state.u.uhp,resistant?200:199);assert.equal(state.u.uhpmax,200);assert.equal(actor.mhp,0);assert.equal(actor.mnum,PM_ACID_BLOB);assert.equal(state.level.monsters[6][7],null);
   assert.deepEqual(draws,[['d',1,8,1],['rn2',2,1],['rn2',30,29],['rn2',2,1]]);
   if(blind)assert.deepEqual(lines,['You are splashed!']);else if(!hallu)assert.deepEqual(lines,["You are splashed by the acid blob's acid!"]);else{assert.equal(lines.length,1);assert.match(lines[0],/^You are splashed by .+!$/);}
   assert.deepEqual(cosmetic,planning&&hallu&&!blind?[430,2,41]:[]);assert.deepEqual(game.coreCtx,core);
   if(planning){assert.deepEqual(game.displayCtx,display);assert.equal(game.u.uhp,200);assert.equal(game.u.aexe[0],globalExercise);}
   outcomes.push({result,draws,lines,hp:state.u.uhp,display:structuredClone(state.displayCtx)});
  }
  assert.deepEqual(outcomes[0],outcomes[1]);
 });
}

for(const name of ['normal','monochrome','before-control']) {
 test('hero passive acid liquid '+name+' matches independent C',async()=>{
  const root=createScoringWorkspace(process.cwd(),[]);
  try {
   const c=JSON.parse(fs.readFileSync(new URL('../recordings/uhitm.c/passive-acid-liquid-'+name+'.session.json',import.meta.url)));
   const result=compareSessionOutputs(c,await runJsSession(c,root));
   assert.equal(result.passed,true,formatReport(result));
  }finally{removeScoringWorkspace(root);}
 });
}
