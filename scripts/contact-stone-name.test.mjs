import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_DOG, PM_COCKATRICE, PM_GOBLIN, NON_PM } from '../js/monsters.js';
import { STATUE } from '../js/objects.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, ROOM, STONE, M_ATTK_AGR_DIED, M_ATTK_HIT, OBJ_FLOOR } from '../js/const.js';
import { planningState, wieldMonsterItemAgainstMonster } from '../js/unported_monster_actions.js';
import { mattackm } from '../js/mhitm.js';
import { canseemon, canspotmon } from '../js/display.js';
import { light_globals_init } from '../js/light.js';
import { init_vision_globals, vision_reset, vision_recalc } from '../js/vision.js';
import { createCoreRandom, cloneIsaacContext, rn2_on_display_rng } from '../js/rng.js';

for(const hallu of [true,false])for(const visible of [true,false])for(const stone of [true,false]){
    test(`contact stone feedback Hallu=${hallu} visible=${visible} petrifies=${stone}`,async()=>{
        const outcomes=[];
        for(const planning of [true,false]){
            await runSegment({seed:8432069,datetime:'20270125100000',nethackrc:'OPTIONS=name:ContactStone,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
            game.level=new GameMap();game.head_engr=null;
            for(let x=2;x<=15;x++)for(let y=2;y<=13;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
            game.u.ux=5;game.u.uy=7;
            for(const [index,active] of [[BLINDED,false],[HALLUC,hallu],[DETECT_MONSTERS,true]]){game.u.uprops[index].intrinsic=active?1000:0;game.u.uprops[index].extrinsic=0;}
            if(!visible)game.level.at(6,7).typ=STONE;
            const agr=newMonster({data:game.mons[PM_DOG],mnum:PM_DOG,cham:NON_PM,m_id:9970,m_lev:game.mons[PM_DOG].mlevel,mhp:32,mhpmax:32,mcanmove:true,mcansee:true});
            const type=stone?PM_COCKATRICE:PM_GOBLIN;
            const def=newMonster({data:game.mons[type],mnum:type,cham:NON_PM,m_id:9971,m_lev:game.mons[type].mlevel,mhp:20,mhpmax:20,mcanmove:true,mcansee:true});
            agr.nmon=def;game.level.monlist=agr;place_monster(agr,7,7,game);place_monster(def,7,6,game);
            game.gb.bhitpos={x:7,y:6};game.gn.notonhead=false;
            light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
            const state=planning?planningState(game):game,a=state.level.monlist,b=a.nmon;
            assert.equal(canseemon(a,state),visible);assert.equal(canspotmon(a,state),true);assert.equal(canseemon(b,state),true);
            const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),randomContext=cloneIsaacContext(state.coreCtx);
            const source=createCoreRandom(randomContext,state),draws=[],lines=[],cosmetic=[];let hitForced=false, nameChoice=0;
            const random=Object.fromEntries(Object.entries(source).map(([name,fn])=>[name,(...args)=>{let value=fn(...args);if(name==='rnd'&&args[0]===20&&!hitForced){value=1;hitForced=true;}draws.push({name,args,value});return value;}]));
            const result=await mattackm(a,b,{state,planning,random,canSeeMonster:mon=>canseemon(mon,state),displayRandom:bound=>{cosmetic.push(bound);rn2_on_display_rng(bound,state);return bound===430&&nameChoice++===2?1:0;},message:async line=>lines.push(line),redraw:()=>{},wieldMonsterItemAgainstMonster,unsupported:reason=>{throw new Error(reason);}});
            assert.deepEqual(draws.slice(0,2).map(d=>[d.name,...d.args]),[['rnd',20],['d',1,6]]);
            assert.equal(Boolean(result&M_ATTK_AGR_DIED),stone);
            const name=hallu?'giant ant':'dog',target=hallu?'giant ant':stone?'cockatrice':'goblin';
            assert.deepEqual(lines,[`The ${name} bites the ${target}.`,...(stone?[`The ${hallu?'killer bee':name} turns to stone!`]:[])]);
            assert.deepEqual(cosmetic,hallu?[430,2,430,2,...(stone?[430,2]:[])]:[]);
            if(stone){
                assert.equal(a.mhp,0);assert.equal(b.mhp,20);assert.equal(state.level.monsters[7][7],null);
                let statue=state.level.objlist;while(statue&&statue.otyp!==STATUE)statue=statue.nobj;
                assert.ok(statue);assert.equal(statue.corpsenm,PM_DOG);assert.equal(statue.where,OBJ_FLOOR);assert.deepEqual([statue.ox,statue.oy],[7,7]);
            }else{assert.ok(result&M_ATTK_HIT);assert.equal(a.mhp,32);assert.equal(b.mhp,20-draws[1].value);assert.equal(state.level.objlist,null);}
            assert.deepEqual(game.coreCtx,core);
            if(planning){assert.deepEqual(game.displayCtx,display);assert.equal(agr.mhp,32);assert.equal(def.mhp,20);assert.equal(game.level.objlist,null);assert.equal(game.level.monsters[7][7],agr);}
            outcomes.push({draws,lines,cosmetic,hp:[a.mhp,b.mhp],result});
        }
        assert.deepEqual(outcomes[0],outcomes[1]);
    });
}

for (const name of ['normal','monochrome','before-control']) {
    test('contact petrification '+name+' matches independent C',async()=>{
        const root=createScoringWorkspace(process.cwd(),[]);
        try {
            const c=JSON.parse(fs.readFileSync(new URL('../recordings/mhitm.c/contact-stone-name-'+name+'.session.json',import.meta.url)));
            const result=compareSessionOutputs(c,await runJsSession(c,root));
            assert.equal(result.passed,true,formatReport(result));
        } finally {removeScoringWorkspace(root);}
    });
}
