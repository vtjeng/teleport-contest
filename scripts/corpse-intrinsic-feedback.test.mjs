import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';import test from 'node:test';
import {game} from '../js/gstate.js';import {GameMap} from '../js/game.js';import {runSegmentStrict as runSegment} from '../js/jsmain.js';
import {newMonster,place_monster} from '../js/monst.js';import {PM_PURPLE_WORM,PM_STALKER} from '../js/monsters.js';
import {mon_givit,mon_give_prop} from '../js/mon.js';
import {ROOM,HALLUC,HALLUC_RES,BLINDED,SEE_INVIS,DETECT_MONSTERS,FIRE_RES,TELEPORT,NON_PM} from '../js/const.js';
import {light_globals_init} from '../js/light.js';import {vision_reset,vision_recalc,init_vision_globals} from '../js/vision.js';
import {canseemon,canspotmon} from '../js/display.js';import {capitalizedMonsterName} from '../js/do_name.js';import {rn2_on_display_rng} from '../js/rng.js';
for(const hallu of [false,true])for(const mode of ['sighted','blind-detected','blind-unsensed','see-invisible'])for(const condition of ['new','blocked','already'])test(`stalker intrinsic Hallu=${hallu} ${mode} ${condition}`,async()=>{await check({hallu,mode,condition,kind:'stalker'});});
for(const hallu of [false,true])for(const mode of ['sighted','blind-detected'])for(const already of [false,true])test(`fire intrinsic Hallu=${hallu} ${mode} already=${already}`,async()=>{await check({hallu,mode,already,kind:'fire'});});
for(const hallu of [false,true])test(`unsupported corpse intrinsic Hallu=${hallu}`,async()=>{await check({hallu,mode:'sighted',kind:'unsupported'});});
async function check(c){
 await runSegment({seed:8432178,datetime:'20270423100000',nethackrc:'OPTIONS=name:IntrinsicOwner,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
 game.level=new GameMap();game.head_engr=null;for(let x=2;x<=20;x++)for(let y=2;y<=15;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}game.u.ux=5;game.u.uy=7;
 for(const [p,on] of [[HALLUC,c.hallu],[HALLUC_RES,false],[BLINDED,c.mode.startsWith('blind')],[SEE_INVIS,c.mode==='see-invisible'],[DETECT_MONSTERS,c.mode==='blind-detected']]){game.u.uprops[p].intrinsic=on?1000:0;game.u.uprops[p].extrinsic=0;}
 const original=newMonster({data:game.mons[PM_PURPLE_WORM],mnum:PM_PURPLE_WORM,cham:NON_PM,m_id:9941,mhp:66,mhpmax:80,mcanmove:true,mcansee:true,minvis:c.condition==='already',perminvis:c.condition==='already',invis_blkd:c.condition==='blocked',mintrinsics:c.already?1:0});game.level.monlist=original;place_monster(original,7,7,game);
 light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
 const actor=game.level.monlist,visible=canseemon(actor,game);
 const transition=c.kind==='stalker'&&(!actor.perminvis||actor.invis_blkd),grant=c.kind==='fire'&&!c.already;
 // Evaluate the expected name on a copy of the display stream taken before
 // the action; the copy then follows the live redraw below.
 const liveDisplay=game.displayCtx;let refDisplay,name;game.displayCtx=structuredClone(liveDisplay);
 try{name=transition||(grant&&visible)?capitalizedMonsterName(actor,game,{displayRandom:n=>rn2_on_display_rng(n,game)}):null;}finally{refDisplay=game.displayCtx;game.displayCtx=liveDisplay;}
 const ref={displayCtx:refDisplay};
 const before={core:structuredClone(game.coreCtx)};
 const lines=[],redraws=[];
 const env={state:game,random:{rn2:()=>{throw Error('unexpected intrinsic gameplay RNG');}},redraw:(x,y)=>redraws.push([x,y]),message:async text=>lines.push(text),noteUnported:r=>{throw Error(r);}};
 if(c.kind==='stalker')await mon_givit(actor,game.mons[PM_STALKER],env);else await mon_give_prop(actor,c.kind==='fire'?FIRE_RES:TELEPORT,env);
 if(c.kind==='stalker'){
  assert.equal(actor.mstun,1);assert.equal(Boolean(actor.perminvis),true);assert.equal(Boolean(actor.minvis),c.condition!=='blocked');
  assert.deepEqual(lines,transition&&visible?[`${name} ${!canspotmon(actor,game)?'vanishes':actor.invis_blkd?'seems to flicker':'becomes invisible'}.`]:[]);
  assert.deepEqual(redraws,[]);
  // The live newsym owner can redraw a sensed hallucinated monster after
  // the prefetched name.
  if(transition&&!actor.invis_blkd&&c.hallu&&canspotmon(actor,game))rn2_on_display_rng(383,ref);
 }else{
  assert.equal(actor.mintrinsics,c.kind==='fire'?1:0);assert.deepEqual(lines,grant&&visible?[`${name} shivers slightly.`]:[]);assert.deepEqual(redraws,[]);
 }
 assert.deepEqual(game.displayCtx,ref.displayCtx,'C name evaluation plus live redraw sequence');assert.equal(actor.mhp,66);assert.equal(actor.mhpmax,80);assert.equal(actor.mnum,PM_PURPLE_WORM);assert.deepEqual(game.coreCtx,before.core);
}

for(const name of ['normal','monochrome','before-control'])test('corpse intrinsic feedback '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/mon.c/corpse-intrinsic-feedback-'+name+'.session.json',import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}});
