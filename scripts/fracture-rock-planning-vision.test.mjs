import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {GameMap} from '../js/game.js';
import {mksobj,place_object,newObject} from '../js/obj.js';
import {BOULDER,STATUE,ROCK} from '../js/objects.js';
import {ROOM,HALLUC,BLINDED,OBJ_FLOOR,OBJ_FREE} from '../js/const.js';
import {objectGenerationEnv} from '../js/object_generation.js';
import {fracture_rock} from '../js/zap.js';
import {newsym} from '../js/display.js';
import {createCoreRandom,cloneIsaacContext} from '../js/rng.js';
import {light_globals_init} from '../js/light.js';
import {init_vision_globals,vision_reset,vision_recalc,transparencyIndexViews,liveVisionBufferViews,clear_path} from '../js/vision.js';
import {admitPlannedVisionChange,preflightElapsedTurnTail,preflightSimpleMonsterActions,planningState} from '../js/unported_monster_actions.js';

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
        for(const tail of [false,true])for(const fail of [false,true]){
            const obj=await setup(kind,blocked,hallu,blind),before=snapshot(),id=obj.o_id;
            const marker=new Error('after fracture');let calls=0,result;
            const callback=async (planned,planningRandom)=>{
                calls++;let target=planned.level.objlist;while(target&&target.o_id!==id)target=target.nobj;assert.ok(target);
                await fracture_rock(target,planned,planningRandom,{planning:true,admitPlannedVisionChange});
                assert.equal(target.otyp,ROCK);assert.equal(target.where,OBJ_FLOOR);
                assert.equal(clear_path(5,7,11,7),blocked?0:1);
                result={quantity:target.quan,weight:target.owt,next:planningRandom.rn2(1000)};
                if(fail)throw marker;return true;
            };
            const run=()=>tail?preflightElapsedTurnTail(game,callback):preflightSimpleMonsterActions(game,{consumeHeroRation:false,advanceRound:callback});
            if(fail)await assert.rejects(run,error=>error===marker);else await run();
            assert.equal(calls,1);assert.deepEqual(snapshot(),before);
            assert.equal(result.quantity,live[0].pile.find(o=>o.id===id).quantity);
            assert.equal(result.weight,live[0].pile.find(o=>o.id===id).weight);
            assert.equal(result.next,createCoreRandom(cloneIsaacContext(live[0].core),game).rn2(1000));
            assert.equal(obj.otyp,kind);
        }
    });
}
test('planned floor fracture rejects a missing index owner before mutation',async()=>{
    const obj=await setup(BOULDER,false,true,false),before=snapshot(),planned=planningState(game);
    const target=planned.level.objlist,copy=objectView(target),core=cloneIsaacContext(planned.coreCtx),beforeCore=structuredClone(core);
    await assert.rejects(()=>fracture_rock(target,planned,createCoreRandom(core,planned),{planning:true}),/admitPlannedVisionChange/);
    assert.deepEqual(objectView(target),copy);assert.deepEqual(core,beforeCore);assert.deepEqual(snapshot(),before);assert.equal(obj.otyp,BOULDER);
});
for(const kind of [BOULDER,STATUE])test('free-object fracture needs no floor index owner '+kind,async()=>{
    const obj=await setup(kind,false,false,false,false),before=snapshot();assert.equal(obj.where,OBJ_FREE);
    const planned=planningState(game),free=newObject({...obj}),core=cloneIsaacContext(planned.coreCtx);
    await fracture_rock(free,planned,createCoreRandom(core,planned),{planning:true});
    assert.equal(free.otyp,ROCK);assert.equal(free.where,OBJ_FREE);assert.ok(free.quan>=7&&free.quan<=66);
    assert.deepEqual(snapshot(),before);assert.equal(obj.otyp,kind);
});

for(const name of ['normal','monochrome','before-control'])test('fracture planning vision '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/zap.c/fracture-rock-planning-vision-'+name+'.session.json',import.meta.url)));const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root);}});
