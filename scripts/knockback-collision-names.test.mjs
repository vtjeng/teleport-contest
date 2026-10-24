import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_FIRE_GIANT, PM_VAMPIRE_BAT, AD_PHYS, AT_WEAP } from '../js/monsters.js';
import { mhitm_knockback } from '../js/uhitm.js';
import { planningState } from '../js/unported_monster_actions.js';
import { ROOM, HALLUC, DETECT_MONSTERS, BLINDED, SEE_INVIS, M_ATTK_HIT, NON_PM } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { rn2_on_display_rng } from '../js/rng.js';

for (const hallu of [false, true]) for (const planning of [true, false]) for (const unseen of [false, true]) {
 test(`hero knockback collision Hallu=${hallu} planning=${planning} unseen=${unseen}`,async()=>{
 await runSegment({seed:8432208,datetime:'20261226120000',nethackrc:'OPTIONS=name:Collision,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
 game.level=new GameMap();game.head_engr=null;
 for(let x=2;x<=20;x++)for(let y=2;y<=15;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
 game.u.ux=5;game.u.uy=7;
 for(const [p,active] of [[HALLUC,hallu],[DETECT_MONSTERS,!unseen],[BLINDED,false],[SEE_INVIS,false]]){game.u.uprops[p].intrinsic=active?1000:0;game.u.uprops[p].extrinsic=0;}
 const attacker=newMonster({data:game.mons[PM_FIRE_GIANT],mnum:PM_FIRE_GIANT,cham:NON_PM,m_id:9917,mhp:20,mhpmax:20,mcansee:true,mcanmove:true});
 const obstacle=newMonster({data:game.mons[PM_VAMPIRE_BAT],mnum:PM_VAMPIRE_BAT,cham:NON_PM,m_id:9918,minvis:unseen,mhp:20,mhpmax:20,mcansee:true,mcanmove:true});
 attacker.nmon=obstacle;game.level.monlist=attacker;place_monster(attacker,4,7,game);place_monster(obstacle,6,7,game);
 light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
 for(let n=0;n<20;n++)game.nhDisplay.pushKey(10);
 const state=planning?planningState(game):game,agr=state.level.monlist,draws=[],cosmetic=[],lines=[];
 const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx);
 const random={rn2:n=>{draws.push(n);return n===3?1:0;}};
 const attack=agr.data.mattk.find(a=>a.aatyp===AT_WEAP&&a.adtyp===AD_PHYS);assert.ok(attack);
 const flags={value:M_ATTK_HIT};const result=await mhitm_knockback(agr,state.youmonst,attack,flags,false,state,{state,planning,random,displayRandom:n=>{cosmetic.push(n);rn2_on_display_rng(n,state);return 0;},message:async line=>lines.push(line)},random);
 assert.equal(result,true);assert.deepEqual(cosmetic,hallu?(unseen?[430,2]:[430,2,430,2]):[]);assert.deepEqual(draws,hallu&&unseen?[3,6,2,2,2,4,4]:[3,6,2,2,4]);
 assert.deepEqual([state.u.ux,state.u.uy],[5,7]);assert.equal(state.level.monlist.nmon.mhp,20);assert.equal(agr.mhp,20);
 assert.deepEqual(game.coreCtx,core,'global core');if(planning)assert.deepEqual(game.displayCtx,display,'global display');
 assert.equal(lines.length,2);
 });
}

for(const name of ['normal','monochrome','before-control']){test(`knockback collision ${name} matches public C`,async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/dothrow.c/knockback-collision-'+name+'.session.json',import.meta.url)));const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root)}});}
