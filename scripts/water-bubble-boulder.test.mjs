import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import {rn2,getRngLog} from '../js/rng.js';
import assert from 'node:assert/strict';import test from 'node:test';
import {runSegment} from '../js/jsmain.js';import {game} from '../js/gstate.js';import {GameMap} from '../js/game.js';
import {AIR,WATER,OBJ_FLOOR,OBJ_FREE,HALLUC,BLINDED} from '../js/const.js';import {BOULDER,FOOD_RATION} from '../js/objects.js';
import {newObject,place_object} from '../js/obj.js';import {objectGenerationEnv} from '../js/object_generation.js';
import {init_vision_globals,vision_reset,transparencyIndexViews} from '../js/vision.js';import {light_globals_init} from '../js/light.js';import {movebubbles} from '../js/mkmaze.js';
async function setup(hallu,blind,count,dx,boulder=true){
 await runSegment({seed:8432252,datetime:'20270613100000',nethackrc:'OPTIONS=name:BubbleBoulder,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
 game.level=new GameMap();for(let x=1;x<80;x++)for(let y=0;y<21;y++)game.level.at(x,y).typ=WATER;
 game.level.monlist=null;game.u.ux=40;game.u.uy=10;game.level.at(40,10).typ=AIR;game.water_level={...game.u.uz};game.waterlevel_portal={tx:70,ty:15};game.waterlevel_bounds={xmin:4,ymin:2,xmax:77,ymax:19};game.air_bubbles_up=false;
 game.u.uprops[HALLUC].intrinsic=hallu?800:0;game.u.uprops[BLINDED].intrinsic=blind?800:0;
 const bubble={x:20,y:7,dx,dy:0,mask:{width:2,height:1,rows:[3]},cons:[]};game.air_bubbles=[bubble];game.level.at(20,7).typ=AIR;game.level.at(21,7).typ=AIR;
 light_globals_init(game);init_vision_globals();vision_reset(game);
 const objects=[];for(let i=0;i<count;i++){const type=boulder?BOULDER:FOOD_RATION;const obj=newObject({otyp:type,oclass:game.objects[type].oc_class,where:OBJ_FREE,quan:1,blessed:i>0,owt:boulder?6000:20});place_object(obj,20,7,objectGenerationEnv({state:game}));objects.push(obj);}
 return {bubble,objects};
}
for(const hallu of [false,true])for(const blind of [false,true])for(const count of [1,2])for(const dx of [-1,1])test(`Water collection boulders H=${hallu} B=${blind} count=${count} dx=${dx}`,async()=>{
 const {bubble,objects}=await setup(hallu,blind,count,dx);const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),draws=[];
 await movebubbles(game,bound=>{if(!draws.length){assert.equal(game.level.objects[20][7],null);for(const obj of objects){assert.equal(obj.where,OBJ_FREE);assert.equal(obj.ox,0);assert.equal(obj.oy,0);}assert.equal(bubble.cons.length,1);}draws.push(bound);return 1;});
 assert.deepEqual(draws,[3,3,20]);assert.equal(bubble.x,20+dx);assert.equal(bubble.cons.length,0);
 let pile=game.level.objects[20+dx][7];const seen=[];for(;pile;pile=pile.nexthere)seen.push(pile);assert.equal(seen.length,count);assert.deepEqual(new Set(seen),new Set(objects));
 for(const obj of objects){assert.equal(obj.where,OBJ_FLOOR);assert.equal(obj.ox,20+dx);assert.equal(obj.oy,7);assert.equal(obj.quan,1);}
 assert.equal(game.level.at(20+dx,7).typ,AIR);assert.equal(transparencyIndexViews()[7][20+dx],0);
 assert.equal(transparencyIndexViews()[7][21+dx],1);assert.equal(game.vision_full_recalc,1);
 const floor=[];for(let obj=game.level.objlist;obj;obj=obj.nobj)floor.push(obj);assert.deepEqual(new Set(floor),new Set(objects));assert.equal(floor.length,count);
 assert.deepEqual(game.coreCtx,core);assert.deepEqual(game.displayCtx,display);
});
for(const dx of [-1,1])test('ordinary nonboulder Water collection control '+dx,async()=>{
 const {objects}=await setup(false,false,1,dx,false);await movebubbles(game,()=>1);assert.equal(objects[0].where,OBJ_FLOOR);assert.equal(objects[0].ox,20+dx);assert.equal(transparencyIndexViews()[7][20+dx],1);
});
for(const plane of ['ordinary','Air'])test('outside Water collection control '+plane,async()=>{
 const {objects}=await setup(false,false,1,1);game.water_level={dnum:99,dlevel:1};if(plane==='Air')game.air_level={...game.u.uz};
 const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx);await movebubbles(game,()=>1);
 assert.equal(objects[0].where,OBJ_FLOOR);assert.equal(objects[0].ox,20);assert.equal(objects[0].oy,7);assert.equal(game.level.objects[20][7],objects[0]);assert.equal(transparencyIndexViews()[7][20],0);assert.deepEqual(game.coreCtx,core);assert.deepEqual(game.displayCtx,display);
});

for(const hallu of [false,true])test('default actual RNG matches delegated owner H='+hallu,async()=>{
 const results=[];for(const delegated of [false,true]){const {objects}=await setup(hallu,false,2,1);const start=getRngLog().length,bounds=[];if(delegated)await movebubbles(game,bound=>{bounds.push(bound);return rn2(bound);});else await movebubbles(game);results.push({core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),rng:getRngLog().slice(start),index:transparencyIndexViews().map(row=>Array.from(row)),objects:objects.map(o=>({where:o.where,x:o.ox,y:o.oy,quan:o.quan})),bubble:game.air_bubbles.map(b=>({x:b.x,y:b.y,dx:b.dx,dy:b.dy,contents:b.cons.length}))});if(delegated){assert.deepEqual(bounds.slice(0,2),[3,3]);assert.equal(bounds[2],20);}}
 assert.deepEqual(results[0],results[1]);assert.ok(results[0].rng.length>=3);
});

for(const name of ['normal','monochrome','before-control','ordinary-control'])test('Water bubble boulder collection '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/mkmaze.c/bubble-boulder-'+name+'.session.json',import.meta.url)));const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root);}});
