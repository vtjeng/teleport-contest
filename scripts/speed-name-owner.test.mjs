import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {newMonster} from '../js/monst.js';
import {PM_KITTEN} from '../js/monsters.js';
import {HALLUC,MFAST,IN_SIGHT,COULD_SEE} from '../js/const.js';
import {mon_adjust_speed} from '../js/worn.js';
for(const planning of [false,true])for(const hallu of [false,true])for(const adjust of [-3,-1,1])test(`speed presentation owner planning=${planning} hallu=${hallu} adjust=${adjust}`,async()=>{
 await runSegment({seed:8432276,datetime:'20270707100000',nethackrc:'OPTIONS=name:SpeedOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
 game.u.uprops[HALLUC].intrinsic=hallu?800:0;game.flags.verbose=true;
 const x=game.u.ux,y=game.u.uy;game.viz_array[y][x]=IN_SIGHT|COULD_SEE;
 const mon=newMonster({data:game.mons[PM_KITTEN],mnum:PM_KITTEN,mx:x,my:y,mspeed:adjust===1?0:MFAST,permspeed:adjust===1?0:MFAST});
 const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),draws=[],messages=[];
 await mon_adjust_speed(mon,adjust,null,game,{planning,canseemon:()=>true,displayRandom:n=>{draws.push(n);return 0;},message:text=>messages.push(text)});
 assert.equal(mon.permspeed,adjust===1?MFAST:adjust===-1?0:0);assert.equal(mon.mspeed,mon.permspeed);
 assert.deepEqual(game.coreCtx,core);assert.deepEqual(game.displayCtx,display,'active display source must be the supplied owner');
 assert.equal(messages.length,1);assert.equal(draws.length,hallu?2:0);
});

// C worn.c:488-568; mcastu.c:852-855 reaches the same speed helper.
for(const name of ['normal','monochrome','before-control','ordinary-control'])test('monster speed names '+name+' match independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/worn.c/speed-name-owner-'+name+'.session.json',import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}});
