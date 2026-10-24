import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster } from '../js/monst.js';
import { newObject, place_object, weight } from '../js/obj.js';
import { PM_PURPLE_WORM, PM_HUMAN, PM_LICHEN, NON_PM } from '../js/monsters.js';
import { DAGGER, ROCK } from '../js/objects.js';
import { BLINDED, HALLUC, ROOM } from '../js/const.js';
import { unstuck, set_ustuck } from '../js/mon.js';
import { docrt, swallowed } from '../js/display.js';
import { light_globals_init } from '../js/light.js';
import { init_vision_globals, vision_reset, vision_recalc } from '../js/vision.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

async function scene(hallu, blind, engulfed=true){
    await runSegment({seed:8432065,datetime:'20270121100000',nethackrc:'OPTIONS=name:ReleasedView,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:''});
    game.level=new GameMap();game.head_engr=null;
    for(let x=2;x<=15;x++)for(let y=2;y<=13;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
    game.u.ux=5;game.u.uy=7;
    for(const [i,active] of [[HALLUC,hallu],[BLINDED,blind]]){game.u.uprops[i].intrinsic=active?1000:0;game.u.uprops[i].extrinsic=0;}
    const type=engulfed?PM_PURPLE_WORM:PM_LICHEN;
    const holder=newMonster({data:game.mons[type],mnum:type,cham:NON_PM,m_id:9940,m_lev:engulfed?15:0,mhp:30,mhpmax:30,mcansee:true,mcanmove:true,mspec_used:0});
    const other=newMonster({data:game.mons[PM_HUMAN],mnum:PM_HUMAN,cham:NON_PM,m_id:9941,m_lev:1,mhp:20,mhpmax:20,mcansee:true,mcanmove:true});
    holder.nmon=other;game.level.monlist=holder;place_monster(holder,engulfed?5:6,7,game);place_monster(other,7,7,game);
    for(const [otyp,x,y] of [[DAGGER,5,7],[ROCK,6,7]]){
        const obj=newObject({otyp,oclass:game.objects[otyp].oc_class,material:game.objects[otyp].oc_material,quan:1,spe:0,o_id:9950+x});
        obj.owt=weight(obj,{state:game});
        place_object(obj,x,y,{state:game});
    }
    light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
    clearTtyMessageWindow(game);for(let i=0;i<16;i++)game.nhDisplay.pushKey(32);
    set_ustuck(holder,game);
    if(engulfed){game.u.uswallow=1;game.u.uswldtim=4;game.gm.mswallower=holder;vision_recalc(2);await swallowed(true);}
    clearTtyMessageWindow(game);for(let i=0;i<12;i++)game.nhDisplay.pushKey(10);
    return holder;
}

for(const hallu of [true,false])for(const blind of [true,false]){
    test(`released swallowed view equals one ordinary redraw Hallu=${hallu} Blind=${blind}`,async()=>{
        const outcomes=[];
        for(const release of [true,false]){
            const holder=await scene(hallu,blind),beforeCore=structuredClone(game.coreCtx),draws=[];
            if(release){
                await unstuck(holder,game,{random:{rnd:bound=>{draws.push(bound);return bound;}}});
                assert.deepEqual(draws,[2]);assert.equal(holder.mspec_used,2);
                assert.equal(game.u.ustuck,null);assert.equal(game.u.uswallow,0);assert.equal(game.u.uswldtim,0);assert.equal(game.gm.mswallower,null);
            }else{
                // C unstuck's released view is an ordinary docrt at the
                // former swallower square, with the holding state cleared.
                set_ustuck(null,game);game.gm.mswallower=null;
                game.u.ux=holder.mx;game.u.uy=holder.my;game.vision_full_recalc=1;
                await docrt();
            }
            assert.equal(holder.mhp,30);assert.deepEqual(game.coreCtx,beforeCore);assert.equal(game.vision_full_recalc,0);
            outcomes.push({screen:game.nhDisplay.serialize(),display:structuredClone(game.displayCtx),hero:[game.u.ux,game.u.uy],map:Array.from({length:15},(_,x)=>Array.from({length:14},(_,y)=>{const loc=game.level.at(x,y);return {seenv:loc?.seenv,glyph:loc?.remembered_glyph};})) });
        }
        assert.deepEqual(outcomes[0],outcomes[1]);
    });
}

for(const hallu of [true,false]){
    test(`ordinary holder release performs no swallowed redraw Hallu=${hallu}`,async()=>{
        const holder=await scene(hallu,false,false),before=structuredClone(game.displayCtx),screen=game.nhDisplay.serialize(),draws=[];
        await unstuck(holder,game,{random:{rnd:bound=>{draws.push(bound);return bound;}}});
        assert.equal(game.u.ustuck,null);assert.equal(game.u.uswallow,0);assert.equal(holder.mspec_used,2);assert.deepEqual(draws,[2]);
        assert.deepEqual(game.displayCtx,before);assert.equal(game.nhDisplay.serialize(),screen);
    });
}

for(const name of ['normal','monochrome','before-control']){
    test('swallowed redraw phases '+name+' matches independent C',async()=>{
        const root=createScoringWorkspace(process.cwd(),[]);
        try{
            const c=JSON.parse(fs.readFileSync(new URL('../recordings/mon.c/swallowed-redraw-phases-'+name+'.session.json',import.meta.url)));
            const result=compareSessionOutputs(c,await runJsSession(c,root));
            assert.equal(result.passed,true,formatReport(result));
        }finally{removeScoringWorkspace(root);}
    });
}
