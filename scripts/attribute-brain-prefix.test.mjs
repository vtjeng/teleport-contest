import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {eat_brains} from '../js/eat.js';
import {newMonster} from '../js/monst.js';
import {PM_MIND_FLAYER,NON_PM} from '../js/monsters.js';
import {rnd,rn2} from '../js/rng.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {adjattrib} from '../js/attrib.js';
import {planningState} from '../js/unported_monster_actions.js';
import {A_INT,A_WIS,FAINTED,NOT_HUNGRY,M_ATTK_HIT} from '../js/const.js';
for(const awareness of ['awake','paralyzed','sleeping','fainted'])for(const increment of [-2,2])test(`attribute sensation ${awareness} delta=${increment}`,async()=>{
 for(const planning of [true,false]){
  await runSegment({seed:8432095,datetime:'20270219100000',nethackrc:'OPTIONS=name:AttributeFeel,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
  game.multi=awareness==='awake'?0:-4;game.u.usleep=awareness==='sleeping'?1:0;game.u.uhs=awareness==='fainted'?FAINTED:NOT_HUNGRY;game.u.uhunger=awareness==='fainted'?-10:900;
  game.u.acurr.a[A_INT]=12;game.u.amax.a[A_INT]=12;game.u.aexe[A_INT]=3;game.u.atemp[A_INT]=0;game.u.abon[A_INT]=0;
  const state=planning?planningState(game):game;
  if(planning){game.multi=0;game.u.usleep=0;game.u.uhs=NOT_HUNGRY;game.u.uhunger=900;}
  const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx),hp=state.u.uhp;
  const lines=[];assert.equal(await adjattrib(A_INT,increment,0,state,{message:async line=>{assert.equal(state.u.acurr.a[A_INT],12+increment);assert.equal(state.u.aexe[A_INT],0);lines.push(line);}}),true);
  assert.deepEqual(lines,[`You ${awareness==='sleeping'||awareness==='fainted'?'dream that you feel':'feel'} very ${increment>0?'smart':'stupid'}!`]);
  assert.equal(state.u.acurr.a[A_INT],12+increment);assert.equal(state.u.amax.a[A_INT],increment>0?14:12);assert.equal(state.u.uhp,hp);assert.deepEqual(game.coreCtx,core);assert.deepEqual(game.displayCtx,display);
  if(planning){assert.equal(game.u.acurr.a[A_INT],12);assert.equal(game.u.amax.a[A_INT],12);assert.equal(game.u.aexe[A_INT],3);assert.equal(game.multi,0);assert.equal(game.u.usleep,0);}
 }
});

for(const awareness of ['awake','paralyzed','sleeping','fainted'])test(`brain recovery sensation after real death refusal ${awareness}`,async()=>{
 await runSegment({seed:8432096,datetime:'20270220100000',nethackrc:'OPTIONS=name:BrainFeel,role:Healer,race:human,gender:female,align:neutral,playmode:debug,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:''});
 assert.equal(game.wizard,true);game.multi=awareness==='awake'?0:-4;game.u.usleep=awareness==='sleeping'?1:0;game.u.uhs=awareness==='fainted'?FAINTED:NOT_HUNGRY;game.u.uhunger=awareness==='fainted'?-10:900;game.nomovemsg=awareness==='sleeping'?'You wake up.':'You can move again.';
 game.u.acurr.a[A_INT]=game.urace.attrmin[A_INT];game.u.aexe[A_WIS]=0;game.context.mon_moving=true;
 const actor=newMonster({data:game.mons[PM_MIND_FLAYER],mnum:PM_MIND_FLAYER,cham:NON_PM,m_id:9972,m_lev:9,mhp:60,mhpmax:60,mcanmove:true,mcansee:true,mtame:0});
 const mortality=game.u.umortality,maximum=game.u.uhpmax,events=[],damage={value:7};
 for(const key of ' n\r'+' '.repeat(40))game.nhDisplay.pushKey(key.charCodeAt(0));
 const result=await eat_brains(actor,game.youmonst,false,damage,game,{random:{rnd:n=>{events.push(['rnd',n]);return rnd(n);},rn2:n=>{events.push(['rn2',n]);return rn2(n);}},message:async line=>{events.push(['message',line]);if(line.includes('scarecrow')){assert.equal(game.u.umortality,mortality+1);assert.equal(game.u.acurr.a[A_INT],game.urace.attrmin[A_INT]+2);assert.equal(game.killer.name,'');assert.ok(game.u.uhp>0);}}});
 assert.equal(result,M_ATTK_HIT);assert.equal(damage.value,7);assert.equal(actor.mhp,60);assert.equal(game.u.umortality,mortality+1);assert.equal(game.u.uhpmax,maximum);assert.equal(Boolean(game.program_state.gameover),false);assert.equal(game.multi,-1);assert.equal(game.u.uhs,NOT_HUNGRY);
 assert.deepEqual(events.map(x=>x.slice(0,2)),[['rnd',10],['message','Your brain is eaten!'],['message','Your last thought fades away.'],['message',`You ${awareness==='sleeping'?'dream that you feel':'feel'} like a scarecrow.`],['rn2',2]]);
});

for(const name of ['normal','monochrome','before-control'])test('attribute and brain dream prefix '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/attrib.c/attribute-brain-prefix-'+name+'.session.json',import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}});
