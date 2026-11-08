import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegmentStrict as runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {GameMap} from '../js/game.js';
import {POOL,MOAT,WATER,ROOM,HALLUC,BLINDED,FROMOUTSIDE,
    MAGICAL_BREATHING,MAGIC_PORTAL,OBJ_DELETED,OBJ_FLOOR} from '../js/const.js';
import {BOULDER,FOOD_RATION} from '../js/objects.js';
import {mksobj,place_object,weight} from '../js/obj.js';
import {addinv} from '../js/invent.js';
import {dropx,dropCommandEnv} from '../js/do.js';
import {getRngLog,rn2} from '../js/rng.js';
import {ttyPline} from '../js/tty_message.js';
import {init_vision_globals,vision_reset,vision_recalc,
    transparencyIndexViews,liveVisionBufferViews} from '../js/vision.js';
import {light_globals_init} from '../js/light.js';

async function setup({hallu,blind,terrain=WATER,water=true,underwater=true,quantity=1,kind=BOULDER}) {
    const seed=8432216+(hallu?12:0)+(blind?6:0)+(quantity-1)*3+[POOL,MOAT,WATER].indexOf(terrain);
    await runSegment({seed,datetime:'20270531100000',
        nethackrc:'OPTIONS=name:SubmergedBoulder,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
    game.level=new GameMap();game.head_engr=null;
    for(let x=2;x<16;++x)for(let y=2;y<14;++y){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
    game.u.ux=5;game.u.uy=7;game.level.at(5,7).typ=terrain;
    if(water)game.u.uz={...game.water_level};
    game.u.uinwater=underwater;
    game.u.uprops[MAGICAL_BREATHING].intrinsic=FROMOUTSIDE;
    game.u.uprops[HALLUC].intrinsic=hallu?FROMOUTSIDE:0;
    game.u.uprops[BLINDED].intrinsic=blind?800:0;
    game.context.mon_moving=false;
    const floor=mksobj(FOOD_RATION,false,false,{state:game});
    place_object(floor,5,7,{state:game});
    const trap={tx:5,ty:7,ttyp:MAGIC_PORTAL,tseen:true};game.level.traps.push(trap);
    const obj=mksobj(kind,false,false,{state:game});obj.quan=quantity;obj.owt=weight(obj,{state:game});addinv(obj,{state:game});
    light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
    return {obj,floor,trap};
}
function snapshot(){return {core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),
    grid:structuredClone(game.nhDisplay.grid),buffers:liveVisionBufferViews().map(r=>Array.from(r)),
    index:transparencyIndexViews().map(r=>Array.from(r)),world:structuredClone(game.level.locations),
    invent:structuredClone(game.invent),floor:structuredClone(game.level.objlist),
    traps:structuredClone(game.level.traps),u:structuredClone(game.u),
    iflags:structuredClone(game.iflags),disp:structuredClone(game.disp),context:structuredClone(game.context),
    bhitpos:structuredClone(game.gb?.bhitpos),pending:game._pending_message,toplin:game.nhDisplay.toplin,
    cursor:[game.nhDisplay.cursorCol,game.nhDisplay.cursorRow,game.nhDisplay.cursorVisible]};}

for(const hallu of [false,true])for(const blind of [false,true]){
    for(const terrain of [POOL,MOAT,WATER])for(const quantity of [1,2]){
        test(`live submerged boulder Hallu=${hallu} blind=${blind} terrain=${terrain} quantity=${quantity}`,async()=>{
            const outcomes=[];
            for(const delegated of [false,true]){
                const {obj,floor,trap}=await setup({hallu,blind,terrain,quantity});
                const before=snapshot(),start=getRngLog().length;
                for(let n=0;n<100;++n)game.nhDisplay.pushKey(32);
                const unexpected=()=>{throw new Error('Water boulder must not fill, redraw, wake, or encumber');};
                const env=dropCommandEnv(game,delegated?{
                    random:{rn2},message:(...args)=>ttyPline(...args),
                    newsym:unexpected,wakeNear:unexpected,
                    hooks:{newsym:unexpected,encumberMessage:unexpected},
                }:{});
                await dropx(obj,env);
                const calls=getRngLog().slice(start);
                assert.equal(calls.length,1);assert.match(calls[0],/rn2\(10\)=/u);
                assert.equal(obj.where,OBJ_DELETED);
                assert.deepEqual(game.gb?.bhitpos,before.bhitpos);
                for(let o=game.invent;o;o=o.nobj)assert.notEqual(o,obj);
                assert.equal(game.level.at(5,7).typ,terrain);
                assert.equal(game.level.objects[5][7],floor);
                assert.equal(floor.where,OBJ_FLOOR);
                assert.equal(game.level.objlist,floor);
                assert.strictEqual(game.level.traps[0],trap);
                assert.deepEqual(transparencyIndexViews().map(r=>Array.from(r)),before.index);
                assert.deepEqual(liveVisionBufferViews().map(r=>Array.from(r)),before.buffers);
                outcomes.push(snapshot());
            }
            assert.deepEqual(outcomes[0],outcomes[1]);
        });
    }
}

for(const name of ['normal','monochrome','before-control','ordinary-control'])test(`Submerged Water boulder ${name} matches independent C`,async()=>{
    const root=createScoringWorkspace(process.cwd(),[]);
    try{const c=JSON.parse(fs.readFileSync(new URL(`../recordings/do.c/submerged-water-boulder-${name}.session.json`,import.meta.url)));
        const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));
    }finally{removeScoringWorkspace(root);}
});
