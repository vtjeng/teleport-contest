import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { PM_HUMAN, NON_PM } from '../js/monsters.js';
import { SPLINT_MAIL } from '../js/objects.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, SEE_INVIS, ROOM, OBJ_MINVENT, W_ARM, I_SPECIAL } from '../js/const.js';
import { planningState } from '../js/unported_monster_actions.js';
import { dobuzz } from '../js/zap.js';
import { canseemon, canspotmon } from '../js/display.js';
import { light_globals_init } from '../js/light.js';
import { init_vision_globals, vision_reset, vision_recalc } from '../js/vision.js';
import { rn2_on_display_rng } from '../js/rng.js';

for(const hallu of [true,false])for(const visible of [true,false]) {
    test(`disintegrated armor feedback Hallu=${hallu} visible=${visible}`,async()=>{
        for(const planning of [true,false]){
            await runSegment({seed:8432062,datetime:'20270118100000',nethackrc:'OPTIONS=name:ArmorBeam,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:''});
            game.level=new GameMap();game.head_engr=null;
            for(let x=2;x<=20;x++)for(let y=2;y<=15;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
            game.u.ux=5;game.u.uy=7;
            for(const [index,active] of [[BLINDED,false],[HALLUC,hallu],[DETECT_MONSTERS,true],[SEE_INVIS,false]]){game.u.uprops[index].intrinsic=active?1000:0;game.u.uprops[index].extrinsic=0;}
            const mon=newMonster({data:game.mons[PM_HUMAN],mnum:PM_HUMAN,cham:NON_PM,m_id:9911,m_lev:1,mhp:30,mhpmax:30,mcanmove:true,mcansee:true,minvis:!visible});
            const armor=newObject({otyp:SPLINT_MAIL,oclass:game.objects[SPLINT_MAIL].oc_class,material:game.objects[SPLINT_MAIL].oc_material,quan:1,spe:0,where:OBJ_MINVENT,ocarry:mon,owornmask:W_ARM,dknown:true});
            mon.minvent=armor;mon.misc_worn_check=W_ARM;game.level.monlist=mon;place_monster(mon,6,7,game);
            light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
            const state=planning?planningState(game):game,target=state.level.monlist;
            assert.equal(canseemon(target,state),visible);assert.equal(canspotmon(target,state),true);
            const core=structuredClone(game.coreCtx),liveDisplay=structuredClone(game.displayCtx);
            const draws=[],cosmetic=[],lines=[];
            await dobuzz(-24,6,5,7,1,0,false,false,false,state,{
                rn2:bound=>{draws.push(['rn2',bound]);return bound-1;},
                rn1:(range,base)=>{draws.push(['rn1',range,base]);return base;},
                rnd:bound=>{draws.push(['rnd',bound]);return bound;},
                d:(count,size)=>{draws.push(['d',count,size]);return count;},
            },{planning,redraw:()=>{},displayRandom:bound=>{cosmetic.push(bound);rn2_on_display_rng(bound,state);return 0;},message:async text=>lines.push(text)});
            assert.deepEqual(draws,[...(hallu?[['rn2',6]]:[]),['rn1',7,7],['rn2',20]]);
            assert.equal(target.mhp,30);assert.equal(target.minvent,null);assert.equal(target.misc_worn_check,I_SPECIAL);
            assert.deepEqual(cosmetic,hallu&&visible?[430,2]:[]);
            assert.deepEqual(lines,!planning&&visible?[`The ${hallu?'giant ant':'human'}'s splint mail is disintegrated!`]:[]);
            assert.deepEqual(game.coreCtx,core);
            if(planning){assert.deepEqual(game.displayCtx,liveDisplay);assert.equal(mon.minvent,armor);assert.equal(mon.misc_worn_check,W_ARM);assert.equal(mon.mhp,30);}
        }
    });
}
for(const name of ['normal','monochrome','before-control']){
    test('disintegrated armor feedback '+name+' matches independent C',async()=>{
        const root=createScoringWorkspace(process.cwd(),[]);
        try{
            const c=JSON.parse(fs.readFileSync(new URL('../recordings/zap.c/disintegrated-armor-name-'+name+'.session.json',import.meta.url)));
            const result=compareSessionOutputs(c,await runJsSession(c,root));
            assert.equal(result.passed,true,formatReport(result));
        }finally{removeScoringWorkspace(root);}
    });
}
