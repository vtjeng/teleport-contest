import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_ARCH_LICH, NON_PM } from '../js/monsters.js';
import { ROOM, ANTIMAGIC, FAINTED, NOT_HUNGRY } from '../js/const.js';
import { touch_of_death } from '../js/mcastu.js';
import { planningState } from '../js/unported_monster_actions.js';

for(const awareness of ['awake','paralyzed','sleeping','fainted']){
    test(`monster death-touch sensation awareness=${awareness}`,async()=>{
        for(const planning of [true,false]){
            await runSegment({seed:8432067,datetime:'20270123100000',nethackrc:'OPTIONS=name:TouchFeel,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
            game.level=new GameMap();game.head_engr=null;
            for(let x=2;x<=15;x++)for(let y=2;y<=13;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
            game.u.ux=5;game.u.uy=7;game.context.mon_moving=true;
            game.u.uhp=game.u.uhpmax=150;
            assert.equal(game.u.uprops[ANTIMAGIC].intrinsic||game.u.uprops[ANTIMAGIC].extrinsic,0);
            game.multi=awareness==='awake'?0:-4;
            game.u.usleep=awareness==='sleeping'?1:0;
            game.u.uhs=awareness==='fainted'?FAINTED:NOT_HUNGRY;
            game.u.uhunger=awareness==='fainted'?-10:900;
            game.nomovemsg=awareness==='sleeping'?'You wake up.':'You can move again.';
            const caster=newMonster({data:game.mons[PM_ARCH_LICH],mnum:PM_ARCH_LICH,cham:NON_PM,m_id:9960,m_lev:game.mons[PM_ARCH_LICH].mlevel,mhp:150,mhpmax:150,mcanmove:true,mcansee:true});
            game.level.monlist=caster;place_monster(caster,6,7,game);
            const state=planning?planningState(game):game,actor=state.level.monlist;
            // Earlier planned actions may change awareness before the live pass.
            if(planning){game.multi=0;game.u.usleep=0;game.u.uhs=NOT_HUNGRY;game.u.uhunger=900;}
            const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),multi=game.multi,sleep=game.u.usleep;
            const lines=[],events=[];
            await touch_of_death(actor,{state,planning,random:{d:(n,size)=>{events.push(['d',n,size]);assert.deepEqual([n,size],[8,6]);return 8;}},message:async line=>{assert.equal(state.u.uhp,150);assert.equal(state.u.uhpmax,150);lines.push(line);events.push(['message',line]);}});
            const expected=`You ${awareness==='sleeping'||awareness==='fainted'?'dream that you feel':'feel'} drained...`;
            assert.deepEqual(lines,[expected]);assert.deepEqual(events,[['d',8,6],['message',expected]]);
            assert.equal(state.u.uhpmax,121);assert.equal(state.u.uhp,92);assert.equal(Boolean(state.program_state.gameover),false);assert.equal(state.killer.name,'');
            assert.deepEqual(game.coreCtx,core);assert.deepEqual(game.displayCtx,display);assert.equal(actor.mhp,150);
            if(planning){assert.equal(game.u.uhp,150);assert.equal(game.u.uhpmax,150);assert.equal(game.multi,multi);assert.equal(game.u.usleep,sleep);}
        }
    });
}

for(const name of ['normal','monochrome','before-control']){
    test('touch-of-death prefix '+name+' matches independent C',async()=>{
        const root=createScoringWorkspace(process.cwd(),[]);
        try{
            const c=JSON.parse(fs.readFileSync(new URL('../recordings/mcastu.c/touch-of-death-prefix-'+name+'.session.json',import.meta.url)));
            const result=compareSessionOutputs(c,await runJsSession(c,root));
            assert.equal(result.passed,true,formatReport(result));
        }finally{removeScoringWorkspace(root);}
    });
}
