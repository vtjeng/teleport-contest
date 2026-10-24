import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {GameMap} from '../js/game.js';
import {newMonster,place_monster} from '../js/monst.js';
import {PM_GREMLIN,PM_BROWN_MOLD,PM_SALAMANDER,NON_PM} from '../js/monsters.js';
import {ROOM,POOL,HALLUC,BLINDED,DETECT_MONSTERS} from '../js/const.js';
import {planningState} from '../js/unported_monster_actions.js';
import {createCoreRandom,cloneIsaacContext} from '../js/rng.js';
import {split_mon} from '../js/potion.js';
import {canseemon,canspotmon} from '../js/display.js';
import {light_globals_init} from '../js/light.js';
import {init_vision_globals,vision_reset,vision_recalc} from '../js/vision.js';

for(const hallu of [false,true])for(const visibility of ['visible','blind-detected','blind-unknown'])for(const heat of [false,true])for(const weak of [false,true]){
 test(`split names Hallu=${hallu} visibility=${visibility} heat=${heat} weak=${weak}`,async()=>{
  const gameplay=[];
  for(const planning of [false,true]){
   const outcomes=[];
   for(const explicitSpot of [false,true]){
    await runSegment({seed:8432146,datetime:'20270322100000',nethackrc:'OPTIONS=name:SplitSense,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
    game.level=new GameMap();for(let x=2;x<=15;x++)for(let y=2;y<=13;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}game.level.at(7,7).typ=heat?ROOM:POOL;
    game.u.ux=5;game.u.uy=7;game.context.mon_moving=true;game.context.ident=9972;
    game.u.uprops[HALLUC].intrinsic=hallu?800:0;game.u.uprops[BLINDED].intrinsic=visibility==='visible'?0:800;game.u.uprops[DETECT_MONSTERS].intrinsic=visibility==='blind-detected'?800:0;
    const species=heat?PM_BROWN_MOLD:PM_GREMLIN;
    const parent=newMonster({data:game.mons[species],mnum:species,cham:NON_PM,m_id:9971,m_lev:heat?1:5,mhp:weak?1:39,mhpmax:weak&&!heat?1:39,mcanmove:true,mcansee:true,mpeaceful:false,mtame:0});
    const attacker=heat?newMonster({data:game.mons[PM_SALAMANDER],mnum:PM_SALAMANDER,cham:NON_PM,m_id:9970,m_lev:8,mhp:64,mhpmax:64,mcanmove:true,mcansee:true,mpeaceful:false,mtame:0}):null;
    game.level.monlist=parent;if(attacker){parent.nmon=attacker;place_monster(attacker,9,8,game);}place_monster(parent,7,7,game);game.mvitals[species].born=1;
    light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
    const state=planning?planningState(game):game;
    let subject=state.level.monlist;while(subject&&subject.m_id!==9971)subject=subject.nmon;let source=state.level.monlist;while(source&&source.m_id!==9970)source=source.nmon;if(!heat)source=null;
    assert.ok(subject);assert.equal(canspotmon(subject,state),visibility!=='blind-unknown');assert.equal(canseemon(subject,state),visibility==='visible');
    const globalContext=structuredClone(game.context),globalCore=structuredClone(game.coreCtx),globalDisplay=structuredClone(game.displayCtx),globalGrid=structuredClone(game.nhDisplay.grid),globalVitals=structuredClone(game.mvitals),hp=game.u.uhp;
    const core=cloneIsaacContext(state.coreCtx),random=createCoreRandom(core,state),lines=[];
    const env={state,planning,random,displayRandom:createCoreRandom(state.displayCtx,state).rn2,canSeeMonster:mon=>canseemon(mon,state),message:async line=>lines.push(line)};
    if(explicitSpot)env.canSpotMonster=canspotmon;
    const clone=await split_mon(subject,source,env);
    assert.equal(Boolean(clone),!weak);assert.equal(subject.mhp,weak?1:20);assert.equal(subject.mhpmax,weak?(heat?39:1):20);assert.equal(subject.cham,NON_PM);assert.equal(game.u.uhp,hp);
    if(clone){assert.equal(clone.mnum,species);assert.equal(clone.cham,NON_PM);assert.equal(clone.mhp,19);assert.equal(clone.mhpmax,19);assert.equal(clone.mcloned,true);assert.equal(clone.minvent,null);assert.equal(state.level.monsters[clone.mx][clone.my],clone);assert.equal(state.level.monlist,clone);assert.notEqual(clone.m_id,subject.m_id);}
    const shouldSpeak=!weak&&visibility!=='blind-unknown';assert.equal(lines.length,shouldSpeak?1:0);if(shouldSpeak&&!hallu)assert.equal(lines[0],heat?"The brown mold multiplies from the salamander's heat!":'The gremlin multiplies!');if(shouldSpeak&&hallu)assert.match(lines[0],heat?/ multiplies from .+ heat!$/u:/ multiplies!$/u);
    assert.deepEqual(game.coreCtx,globalCore);if(planning){assert.deepEqual(game.context,globalContext);assert.deepEqual(game.displayCtx,globalDisplay);assert.deepEqual(game.nhDisplay.grid,globalGrid);assert.deepEqual(game.mvitals,globalVitals);assert.equal(parent.mhp,weak?1:39);assert.equal(parent.mhpmax,weak&&!heat?1:39);assert.equal(game.level.monlist,parent);assert.equal(game.level.monsters[7][7],parent);}
    outcomes.push({core,display:structuredClone(state.displayCtx),lines,parent:{hp:subject.mhp,max:subject.mhpmax,x:subject.mx,y:subject.my},clone:clone&&{id:clone.m_id,type:clone.mnum,x:clone.mx,y:clone.my,hp:clone.mhp,max:clone.mhpmax}});
   }
   assert.deepEqual(outcomes[0],outcomes[1]);gameplay.push({core:outcomes[0].core,parent:outcomes[0].parent,clone:outcomes[0].clone});
  }
  assert.deepEqual(gameplay[0],gameplay[1]);
 });
}

for(const name of ['normal','monochrome','before-control'])test('split monster sensing '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/potion.c/split-mon-sensed-names-'+name+'.session.json',import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}});
