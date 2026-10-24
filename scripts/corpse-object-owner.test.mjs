import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {GameMap} from '../js/game.js';
import {PM_STONE_GOLEM,PM_CLAY_GOLEM,PM_LIZARD,NON_PM} from '../js/monsters.js';
import {STATUE,ROCK,CORPSE} from '../js/objects.js';
import {ROOM,MM_NOMSG,OBJ_FLOOR,CORPSTAT_FEMALE,CORPSTAT_MALE} from '../js/const.js';
import {makemon_runtime} from '../js/makemon_create.js';
import {mondied} from '../js/mon.js';
import {monsterObject} from '../js/monster_object.js';
import {planningState} from '../js/unported_monster_actions.js';
import {createCoreRandom,cloneIsaacContext} from '../js/rng.js';
import {light_globals_init} from '../js/light.js';
import {init_vision_globals,vision_reset,vision_recalc} from '../js/vision.js';
const cases=[
 {type:PM_STONE_GOLEM,female:false,override:false},
 {type:PM_STONE_GOLEM,female:true,override:false},
 {type:PM_STONE_GOLEM,female:false,override:true},
 {type:PM_STONE_GOLEM,female:true,override:true},
 {type:PM_CLAY_GOLEM,female:false,override:false},
 {type:PM_LIZARD,female:false,override:false},
];
for(const {type,female,override} of cases){
 test(`death object owner type=${type} female=${female} override=${override}`,async()=>{
  const outcomes=[];
  for(const planning of [true,false]){
   await runSegment({seed:8432091,datetime:'20270215100000',nethackrc:'OPTIONS=name:CorpseOwner,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
   game.level=new GameMap();game.level.flags.deathdrops=true;game.head_engr=null;
   for(let x=2;x<=15;x++)for(let y=2;y<=13;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
   game.u.ux=5;game.u.uy=7;
   const mon=await makemon_runtime(game.mons[type],7,7,MM_NOMSG,{state:game});assert.ok(mon);assert.equal(mon.cham,NON_PM);mon.female=female;
   if(type===PM_STONE_GOLEM)assert.equal(mon.mhpmax,100);
   if(type===PM_CLAY_GOLEM)assert.equal(mon.mhpmax,70);
   light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
   const state=planning?planningState(game):game,actor=state.level.monlist;assert.equal(actor.m_id,mon.m_id);actor.mhp=0;
   const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),globalHP=mon.mhp,heroHP=state.u.uhp;
   const source=createCoreRandom(cloneIsaacContext(state.coreCtx),state),draws=[],phases=[],lines=[],redraws=[];
   const random=Object.fromEntries(Object.entries(source).map(([name,fn])=>[name,(...args)=>{const value=fn(...args);draws.push([name,args,value]);return value;}]));
   const hooks=override?{monsterObject:(obj,phase,env)=>{const before=obj.corpsenm,result=monsterObject(obj,phase,env);phases.push({phase,before,after:obj.corpsenm,spe:obj.spe});return result;}}:undefined;
   await mondied(actor,state,{planning,random,hooks,redraw:(x,y)=>redraws.push([x,y]),message:async line=>lines.push(line),unsupported:reason=>{throw new Error(reason);}});
   const obj=state.level.objlist;assert.ok(obj);assert.equal(obj.nobj,null);assert.equal(obj.where,OBJ_FLOOR);assert.deepEqual([obj.ox,obj.oy],[7,7]);assert.ok(actor.mhp<=0);assert.equal(state.level.monsters[7][7],null);assert.equal(state.u.uhp,heroHP);assert.deepEqual(lines,[]);
   if(type===PM_STONE_GOLEM){
    assert.equal(obj.otyp,STATUE);assert.equal(obj.corpsenm,PM_STONE_GOLEM);assert.equal(obj.spe,female?CORPSTAT_FEMALE:CORPSTAT_MALE);assert.equal(obj.quan,1);assert.equal(obj.cobj,null);assert.equal(obj.owt,2850);
    assert.ok(draws.some(d=>d[0]==='rn2'&&d[1][0]===2),'statue finalization must perform discarded random-species construction');
    if(override){assert.equal(phases.length,1);assert.equal(phases[0].phase,'finalize');assert.equal(phases[0].before,NON_PM);assert.ok(phases[0].after>=0);assert.notEqual(phases[0].after,PM_STONE_GOLEM);}
   }else if(type===PM_CLAY_GOLEM){
    assert.equal(obj.otyp,ROCK);const quantityDraw=draws.find(d=>d[0]==='rn2'&&d[1][0]===20);assert.ok(quantityDraw);assert.equal(obj.quan,quantityDraw[2]+50);assert.equal(obj.owt,10*obj.quan);
   }else{
    assert.equal(obj.otyp,CORPSE);assert.equal(obj.corpsenm,PM_LIZARD);assert.equal(obj.quan,1);assert.equal(obj.spe,CORPSTAT_MALE);assert.equal(obj.owt,10);
   }
   assert.deepEqual(redraws,planning?[]:[[7,7]]);if(!override)assert.deepEqual(phases,[]);
   assert.deepEqual(game.coreCtx,core);
   if(planning){assert.deepEqual(game.displayCtx,display);assert.equal(mon.mhp,globalHP);assert.equal(game.level.monsters[7][7],mon);assert.equal(game.level.objlist,null);}
   outcomes.push({draws,phases,lines,object:{type:obj.otyp,species:obj.corpsenm,spe:obj.spe,quantity:obj.quan,weight:obj.owt}});
  }
  assert.deepEqual(outcomes[0],outcomes[1]);
 });
}

for(const name of ['normal','monochrome','before-control']) {
 test('death object construction '+name+' matches independent C',async()=>{
  const root=createScoringWorkspace(process.cwd(),[]);
  try {
   const c=JSON.parse(fs.readFileSync(new URL('../recordings/mon.c/corpse-object-owner-'+name+'.session.json',import.meta.url)));
   const result=compareSessionOutputs(c,await runJsSession(c,root));
   assert.equal(result.passed,true,formatReport(result));
  }finally{removeScoringWorkspace(root);}
 });
}
