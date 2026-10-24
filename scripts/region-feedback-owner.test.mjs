import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_HUMAN, NON_PM } from '../js/monsters.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, SEE_INVIS, ROOM, STONE } from '../js/const.js';
import { planningState } from '../js/unported_monster_actions.js';
import { finishElapsedTurn } from '../js/allmain.js';
import { create_region } from '../js/region.js';
import { canseemon, canspotmon } from '../js/display.js';
import { light_globals_init } from '../js/light.js';
import { init_vision_globals, vision_reset, vision_recalc, cansee } from '../js/vision.js';
import { createCoreRandom, cloneIsaacContext } from '../js/rng.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

for(const hallu of [true,false])for(const mode of ['visible','invisible-detected','unseen']){
    test(`elapsed gas-cloud feedback Hallu=${hallu} mode=${mode}`,async()=>{
        const outcomes=[];
        for(const planning of [true,false]){
            await runSegment({seed:8432063,datetime:'20270119100000',nethackrc:'OPTIONS=name:RegionOwner,role:Healer,race:human,gender:female,align:neutral,pettype:none,!debug_mongen,!acoustics,!legacy,!tutorial,!splash_screen,!tips\n',moves:''});
            game.level=new GameMap();game.head_engr=null;
            for(let x=2;x<=20;x++)for(let y=2;y<=15;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
            game.u.ux=5;game.u.uy=7;
            for(const [index,active] of [[BLINDED,false],[HALLUC,hallu],[DETECT_MONSTERS,true],[SEE_INVIS,false]]){game.u.uprops[index].intrinsic=active?1000:0;game.u.uprops[index].extrinsic=0;}
            if(mode==='unseen')game.level.at(6,7).typ=STONE;
            const x=mode==='unseen'?10:6,y=7;
            const mon=newMonster({data:game.mons[PM_HUMAN],mnum:PM_HUMAN,cham:NON_PM,m_id:9921,m_lev:1,mhp:30,mhpmax:30,mcanmove:true,mcansee:true,minvis:mode==='invisible-detected'});
            game.level.monlist=mon;place_monster(mon,x,y,game);
            // A canonical NhRegion callback record; its independent drawing
            // visibility does not change inside_gas_cloud's source effects.
            const cloud=create_region([{lx:x,ly:y,hx:x,hy:y}]);
            Object.assign(cloud,{ttl:5,inside_f:'inside_gas_cloud',arg:3,monsters:[mon.m_id],max_monst:1});
            game.level.regions=[cloud];
            game.context.seer_turn=100000;game.context.next_attrib_check=100000;
            light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
            clearTtyMessageWindow(game);
            for(let i=0;i<12;i++)game.nhDisplay.pushKey(10);
            const state=planning?planningState(game):game,target=state.level.monlist;
            assert.equal(cansee(x,y,state),mode!=='unseen');assert.equal(canspotmon(target,state),true);
            assert.equal(canseemon(target,state),mode==='visible');
            const liveDisplay=structuredClone(game.displayCtx),beforeDisplay=structuredClone(state.displayCtx),core=structuredClone(game.coreCtx),topline=game._ttyToplines;
            const randomContext=planning?cloneIsaacContext(state.coreCtx):state.coreCtx;
            const sourceRandom=createCoreRandom(randomContext,state),draws=[];
            const random=Object.fromEntries(Object.entries(sourceRandom).map(([name,fn])=>[name,(...args)=>{const value=fn(...args);draws.push({name,args,value});return value;}]));
            await finishElapsedTurn(state,random,{planning});
            assert.deepEqual(draws.map(d=>[d.name,...d.args]),[['rn2',12],['rn2',70],['rnd',3],['rn2',20],['rn2',67]]);
            if(!planning){if(mode==='unseen')assert.equal(game._ttyToplines,topline);else if(!hallu)assert.equal(game._ttyToplines,mode==='invisible-detected'?'The invisible human coughs!':'The human coughs!');else assert.match(game._ttyToplines,/ coughs!$/u);}
            const gasDraw=draws.find(d=>d.name==='rnd'&&d.args[0]===3);
            assert.ok(gasDraw);assert.equal(target.mhp,30-gasDraw.value-5);
            assert.equal(target.mblinded,1);assert.equal(target.mcansee,0);assert.equal(state.level.regions[0].ttl,4);
            if(hallu&&mode!=='unseen')assert.notDeepEqual(state.displayCtx,beforeDisplay);
            else assert.deepEqual(state.displayCtx,beforeDisplay);
            if(planning){assert.deepEqual(game.displayCtx,liveDisplay);assert.deepEqual(game.coreCtx,core);assert.equal(game._ttyToplines,topline);assert.equal(mon.mhp,30);assert.equal(mon.mcansee,true);assert.equal(cloud.ttl,5);}
            outcomes.push({core:structuredClone(randomContext),display:structuredClone(state.displayCtx),draws,hp:target.mhp,blind:target.mblinded,hunger:state.u.uhunger,props:structuredClone(state.u.uprops)});
        }
        assert.deepEqual(outcomes[0],outcomes[1]);
    });
}
for(const name of ['normal','monochrome','before-control']){
    test('region feedback owner '+name+' matches independent C',async()=>{
        const root=createScoringWorkspace(process.cwd(),[]);
        try{
            const c=JSON.parse(fs.readFileSync(new URL('../recordings/region.c/region-feedback-owner-'+name+'.session.json',import.meta.url)));
            const result=compareSessionOutputs(c,await runJsSession(c,root));
            assert.equal(result.passed,true,formatReport(result));
        }finally{removeScoringWorkspace(root);}
    });
}
