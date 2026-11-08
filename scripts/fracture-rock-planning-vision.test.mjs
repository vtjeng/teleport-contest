import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegmentStrict as runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {GameMap} from '../js/game.js';
import {mksobj,place_object} from '../js/obj.js';
import {BOULDER,STATUE,ROCK} from '../js/objects.js';
import {ROOM,HALLUC,BLINDED,OBJ_FLOOR,OBJ_FREE} from '../js/const.js';
import {objectGenerationEnv} from '../js/object_generation.js';
import {fracture_rock} from '../js/zap.js';
import {newsym} from '../js/display.js';
import {createCoreRandom} from '../js/rng.js';
import {light_globals_init} from '../js/light.js';
import {init_vision_globals,vision_reset,vision_recalc,transparencyIndexViews,liveVisionBufferViews,clear_path} from '../js/vision.js';

const index=()=>transparencyIndexViews().map(row=>Array.from(row));
const objectView=o=>({id:o.o_id,type:o.otyp,quantity:o.quan,weight:o.owt,where:o.where,x:o.ox,y:o.oy,known:o.known,dknown:o.dknown,bknown:o.bknown,rknown:o.rknown,extra:o.oextra??null});
const pile=state=>{const result=[];for(let o=state.level.objects[8][7];o;o=o.nexthere)result.push(objectView(o));return result;};
async function setup(kind,blocked,hallu,blind,place=true){
    await runSegment({seed:8432156,datetime:'20270401100000',nethackrc:'OPTIONS=name:FractureOwner,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
    game.level=new GameMap();for(let x=2;x<18;x++)for(let y=2;y<15;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
    game.level.monlist=null;game.u.ux=5;game.u.uy=7;game.u.umovement=0;game.context.mon_moving=true;
    game.u.uprops[HALLUC].intrinsic=hallu?800:0;game.u.uprops[BLINDED].intrinsic=blind?800:0;
    light_globals_init(game);init_vision_globals();vision_reset(game);
    const random=createCoreRandom(game.coreCtx,game),env=objectGenerationEnv({state:game,random});
    if(blocked)place_object(mksobj(BOULDER,false,false,env),8,7,env);
    const obj=mksobj(kind,false,false,env);if(place)place_object(obj,8,7,env);
    vision_recalc(0);return obj;
}
const snapshot=()=>({buffers:liveVisionBufferViews().map(row=>Array.from(row)),world:structuredClone(game.level.locations),core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),grid:structuredClone(game.nhDisplay.grid),index:index(),pile:pile(game),context:structuredClone(game.context),hp:game.u.uhp,flag:game.vision_full_recalc});
for(const hallu of [false,true])for(const blind of [false,true])for(const kind of [BOULDER,STATUE])for(const blocked of [false,true]){
    test(`floor fracture Hallu=${hallu} Blind=${blind} kind=${kind} blocked=${blocked}`,async()=>{
        const live=[];
        for(const delegated of [false,true]){
            const obj=await setup(kind,blocked,hallu,blind),id=obj.o_id;
            const env=delegated?{redraw:(...args)=>newsym(...args)}:{};
            await fracture_rock(obj,game,createCoreRandom(game.coreCtx,game),env);
            assert.equal(obj.o_id,id);assert.equal(obj.otyp,ROCK);assert.equal(obj.where,OBJ_FLOOR);
            assert.ok(obj.quan>=7&&obj.quan<=66);assert.equal(obj.owt,obj.quan*game.objects[ROCK].oc_weight);
            assert.equal(obj.bknown,0);assert.equal(obj.rknown,0);
            assert.equal(clear_path(5,7,11,7),blocked?0:1);
            live.push(snapshot());
        }
        assert.deepEqual(live[0],live[1]);
    });
}
for(const kind of [BOULDER,STATUE])test('free-object fracture needs no floor index owner '+kind,async()=>{
    const obj=await setup(kind,false,false,false,false);assert.equal(obj.where,OBJ_FREE);
    await fracture_rock(obj,game,createCoreRandom(game.coreCtx,game));
    assert.equal(obj.otyp,ROCK);assert.equal(obj.where,OBJ_FREE);assert.ok(obj.quan>=7&&obj.quan<=66);
});

for(const name of ['normal','monochrome','before-control'])test('fracture rock vision '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/zap.c/fracture-rock-planning-vision-'+name+'.session.json',import.meta.url)));const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root);}});
