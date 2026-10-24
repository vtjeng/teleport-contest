import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {GameMap} from '../js/game.js';
import {newMonster,place_monster} from '../js/monst.js';
import {PM_WIZARD_OF_YENDOR,NON_PM} from '../js/monsters.js';
import {ROOM,HALLUC,BLINDED,DETECT_MONSTERS,SEE_INVIS,FROMOUTSIDE,PROT_FROM_SHAPE_CHANGERS,M_AP_NOTHING} from '../js/const.js';
import {planningState} from '../js/unported_monster_actions.js';
import {createCoreRandom,cloneIsaacContext} from '../js/rng.js';
import {clonewiz} from '../js/wizard.js';
import {wakeup} from '../js/mon.js';
import {newsym} from '../js/display.js';
import {light_globals_init} from '../js/light.js';
import {init_vision_globals,vision_reset,vision_recalc} from '../js/vision.js';

for(const hallu of [false,true])for(const visibility of ['visible','blind-detected','blind-unknown'])for(const disguised of [false,true]){
 test(`wakeup meal redraw hallu=${hallu} visibility=${visibility} disguised=${disguised}`,async()=>{
  const live=[];
  for(const variant of ['live-default','live-explicit','clone-legacy','clone-planning']){
   await runSegment({seed:8432140,datetime:'20270316100000',nethackrc:'OPTIONS=name:WakeMeal,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
   game.level=new GameMap();for(let x=2;x<=15;x++)for(let y=2;y<=13;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
   game.u.ux=5;game.u.uy=7;game.context.mon_moving=true;
   game.u.uprops[HALLUC].intrinsic=hallu?FROMOUTSIDE:0;
   game.u.uprops[BLINDED].intrinsic=visibility==='visible'?0:800;
   game.u.uprops[DETECT_MONSTERS].intrinsic=visibility==='blind-detected'?800:0;
   game.u.uprops[SEE_INVIS].intrinsic=FROMOUTSIDE;
   game.u.uprops[PROT_FROM_SHAPE_CHANGERS].intrinsic=disguised?0:FROMOUTSIDE;
   const original=newMonster({data:game.mons[PM_WIZARD_OF_YENDOR],mnum:PM_WIZARD_OF_YENDOR,cham:NON_PM,m_id:9984,m_lev:30,mhp:240,mhpmax:240,iswiz:true,mcanmove:true,mcansee:true,mpeaceful:false,mtame:0});
   game.level.monlist=original;place_monster(original,9,7,game);game.context.no_of_wizards=1;game.context.ident=9985;game.mvitals[PM_WIZARD_OF_YENDOR].born=1;
   light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
   const constructed=await clonewiz(game,{random:createCoreRandom(game.coreCtx,game),message:async()=>{},norepMessage:async()=>{}});
   assert.ok(constructed);assert.equal(constructed.mnum,PM_WIZARD_OF_YENDOR);assert.equal(constructed.cham,NON_PM);assert.equal(constructed.meating,0);
   assert.equal(constructed.m_ap_type!==M_AP_NOTHING,disguised);
   const cloned=variant.startsWith('clone-'),state=cloned?planningState(game):game;
   let actor=state.level.monlist;while(actor&&actor.m_id!==constructed.m_id)actor=actor.nmon;assert.ok(actor);
   const before={core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),grid:structuredClone(game.nhDisplay.grid),vitals:structuredClone(game.mvitals),hp:game.u.uhp,count:game.context.no_of_wizards,appearance:constructed.m_ap_type,mappearance:constructed.mappearance};
   const core=cloneIsaacContext(state.coreCtx),privateBefore=structuredClone(core),events=[];
   const env={state,random:createCoreRandom(core,state)};
   if(variant==='clone-planning'){env.planning=true;env.message=async()=>assert.fail('awake non-attack wakeup is silent');}
   if(variant==='live-explicit')env.redraw=(x,y)=>{assert.equal(actor.m_ap_type,M_AP_NOTHING);assert.equal(actor.mappearance,0);events.push([x,y]);newsym(x,y);};
   await wakeup(actor,false,env);
   assert.equal(actor.m_ap_type,M_AP_NOTHING);assert.equal(actor.mappearance,0);assert.equal(actor.meating,0);assert.equal(Boolean(actor.msleeping),false);assert.equal(actor.mhp,constructed.mhp);assert.equal(actor.mhpmax,constructed.mhpmax);
   assert.deepEqual(core,privateBefore);assert.deepEqual(game.coreCtx,before.core);assert.equal(game.u.uhp,before.hp);assert.equal(events.length,variant==='live-explicit'&&disguised?1:0);
   if(cloned){assert.deepEqual(game.displayCtx,before.display);assert.deepEqual(game.nhDisplay.grid,before.grid);assert.deepEqual(game.mvitals,before.vitals);assert.equal(game.context.no_of_wizards,before.count);assert.equal(constructed.m_ap_type,before.appearance);assert.equal(constructed.mappearance,before.mappearance);assert.equal(game.level.monlist,constructed);assert.equal(game.level.monsters[constructed.mx][constructed.my],constructed);}
   else live.push({core,display:structuredClone(state.displayCtx),grid:structuredClone(game.nhDisplay.grid),actor:{type:actor.mnum,x:actor.mx,y:actor.my,hp:actor.mhp,max:actor.mhpmax,appearance:actor.m_ap_type,mappearance:actor.mappearance,meating:actor.meating}});
  }
  assert.deepEqual(live[0],live[1]);
 });
}

for(const name of ['normal','monochrome','before-control'])test('wakeup meal redraw '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/mon.c/wakeup-meal-redraw-owner-'+name+'.session.json',import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}});
