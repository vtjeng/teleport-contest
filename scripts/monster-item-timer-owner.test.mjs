import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {planningState} from '../js/unported_monster_actions.js';
import {newMonster,place_monster} from '../js/monst.js';
import {newObject} from '../js/obj.js';
import {add_to_minv} from '../js/invent.js';
import {PM_HUMAN} from '../js/monsters.js';
import {GLOB_OF_GREEN_SLIME,FOOD_RATION} from '../js/objects.js';
import {OBJ_DELETED,ROOM} from '../js/const.js';
import {start_glob_timeout,obj_stop_timers} from '../js/timeout.js';
import {m_useupall} from '../js/mthrowu.js';
for(const planning of [false,true])for(const timed of [false,true])for(const injected of [false,true])test(`monster item cleanup planning=${planning} timed=${timed} injected=${injected}`,async()=>{
 await runSegment({seed:8432314,datetime:'20270815100000',nethackrc:'OPTIONS=name:MonsterTimerOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:''});
 const actor=newMonster({data:game.mons[PM_HUMAN],mnum:PM_HUMAN,m_id:9980,mhp:20,mhpmax:20,mcanmove:true,mcansee:true});game.level.monlist=actor;
 let square;for(let x=1;x<79&&!square;x++)for(let y=0;y<21;y++)if(game.level.at(x,y).typ===ROOM&&(x!==game.u.ux||y!==game.u.uy)){square=[x,y];break;}
 assert.ok(square);place_monster(actor,...square,game);
 const otyp=timed?GLOB_OF_GREEN_SLIME:FOOD_RATION;
 const obj=newObject({otyp,oclass:game.objects[otyp].oc_class,material:game.objects[otyp].oc_material,quan:1,globby:timed,owt:20});add_to_minv(actor,obj,{state:game});
 if(timed)assert.equal(start_glob_timeout(obj,25,{state:game}),true);
 const state=planning?planningState(game):game,subject=state.level.monlist,item=subject.minvent,core=structuredClone(game.coreCtx),calls=[];
 const hooks=injected?{stopObjectTimers:(target,env)=>{calls.push(target);obj_stop_timers(target,env.state,env);}}:{};
 await m_useupall(subject,item,{state,planning,hooks});
 assert.equal(subject.minvent,null);assert.equal(item.where,OBJ_DELETED);assert.equal(item.timed,0);
 for(let timer=state.gt.timer_base;timer;timer=timer.next)assert.notEqual(timer.arg,item);
 assert.deepEqual(game.coreCtx,core);assert.equal(calls.length,injected&&timed?1:0);
 if(planning){assert.equal(actor.minvent,obj);assert.equal(Boolean(obj.timed),timed);}
});

// C mthrowu.c1154-1158 frees timed inventory through obfree/food_disappears.
for(const name of ['normal','monochrome','before-control','ordinary-control'])test(`monster item timer ${name} matches independent C`,async()=>{
 const root=createScoringWorkspace(process.cwd(),[]);
 try{const c=JSON.parse(fs.readFileSync(new URL(`../recordings/mthrowu.c/monster-item-timer-owner-${name}.session.json`,import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}
});
