import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {GameMap} from '../js/game.js';
import {ROOM,HALLUC,BLINDED,FROMOUTSIDE,OBJ_FLOOR,OBJ_INVENT,W_WEP} from '../js/const.js';
import {QUARTERSTAFF,FOOD_RATION} from '../js/objects.js';
import {mksobj} from '../js/obj.js';
import {addinv} from '../js/invent.js';
import {setuwep} from '../js/wield.js';
import {dropx,dropCommandEnv,preflight_dropx} from '../js/do.js';
import {create_gas_cloud,visible_region_at} from '../js/region.js';
import {newsym} from '../js/display.js';
import {block_point,cansee,init_vision_globals,vision_reset,vision_recalc} from '../js/vision.js';
import {light_globals_init} from '../js/light.js';
import {planningState} from '../js/unported_monster_actions.js';

for(const hallu of [false,true])for(const blind of [false,true])for(const coverage of ['none','outside','at-drop'])for(const weapon of [false,true]){
 test(`opaque region drop Hallu=${hallu} blind=${blind} coverage=${coverage} weapon=${weapon}`,async()=>{
  const outcomes=[];
  for(const delegated of [false,true]){
   await runSegment({seed:8432142,datetime:'20270318100000',nethackrc:'OPTIONS=name:CloudDrop,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
   game.level=new GameMap();game.head_engr=null;for(let x=2;x<=15;x++)for(let y=2;y<=13;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
   game.u.ux=5;game.u.uy=7;game.context.mon_moving=true;game.u.uprops[HALLUC].intrinsic=hallu?FROMOUTSIDE:0;game.u.uprops[BLINDED].intrinsic=blind?800:0;
   const obj=addinv(mksobj(weapon?QUARTERSTAFF:FOOD_RATION,false,false,{state:game}),{state:game});
   if(weapon)await setuwep(obj,{state:game});
   assert.equal(obj.where,OBJ_INVENT);if(weapon)assert.equal(obj.owornmask&W_WEP,W_WEP);
   light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
   if(coverage!=='none')await create_gas_cloud(coverage==='at-drop'?5:11,7,1,3,{state:game,blockPoint:block_point,canSee:cansee,newsym,message:async()=>{}});
   vision_recalc(0);
   assert.equal(Boolean(visible_region_at(5,7,game)),coverage==='at-drop');
   const originalWeapon=game.uwep,quantity=obj.quan,weight=obj.owt,beforeCore=structuredClone(game.coreCtx),beforeDisplay=structuredClone(game.displayCtx),beforeGrid=structuredClone(game.nhDisplay.grid),beforeRegions=structuredClone(game.level.regions),beforeHP=game.u.uhp;
   const clone=planningState(game);let privateObj=clone.invent;while(privateObj&&privateObj.o_id!==obj.o_id)privateObj=privateObj.nobj;assert.ok(privateObj);
   assert.doesNotThrow(()=>preflight_dropx(privateObj,dropCommandEnv(clone)));
   assert.equal(privateObj.where,OBJ_INVENT);assert.equal(obj.where,OBJ_INVENT);assert.equal(game.uwep,originalWeapon);assert.deepEqual(game.coreCtx,beforeCore);assert.deepEqual(game.displayCtx,beforeDisplay);assert.deepEqual(game.nhDisplay.grid,beforeGrid);assert.deepEqual(game.level.regions,beforeRegions);
   const events=[];const env=dropCommandEnv(game,delegated?{hooks:{newsym:(x,y,state)=>{assert.equal(state,game);assert.equal(obj.where,OBJ_FLOOR);assert.equal(game.level.objects[x][y],obj);if(weapon)assert.equal(game.uwep,null);assert.equal(Boolean(visible_region_at(x,y,game)),coverage==='at-drop');events.push([x,y]);newsym(x,y,state);}}}:{});
   await dropx(obj,env);
   assert.equal(obj.where,OBJ_FLOOR);assert.equal(obj.ox,5);assert.equal(obj.oy,7);assert.equal(obj.quan,quantity);assert.equal(obj.owt,weight);assert.equal(game.level.objects[5][7],obj);assert.equal(game.level.objlist,obj);let inPack=false;for(let item=game.invent;item;item=item.nobj)if(item===obj)inPack=true;assert.equal(inPack,false);
   if(weapon){assert.equal(game.uwep,null);assert.equal(obj.owornmask&W_WEP,0);}else assert.equal(game.uwep,originalWeapon);
   assert.deepEqual(game.coreCtx,beforeCore);assert.deepEqual(game.level.regions,beforeRegions);assert.equal(game.u.uhp,beforeHP);assert.equal(events.length,delegated?1:0);
   outcomes.push({core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),grid:structuredClone(game.nhDisplay.grid),regions:structuredClone(game.level.regions),object:{type:obj.otyp,where:obj.where,x:obj.ox,y:obj.oy,quantity:obj.quan,weight:obj.owt,worn:obj.owornmask},hp:game.u.uhp});
  }
  assert.deepEqual(outcomes[0],outcomes[1]);
 });
}

for(const name of ['normal','monochrome','before-control'])test('opaque region drop '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/do.c/opaque-region-drop-'+name+'.session.json',import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}});
