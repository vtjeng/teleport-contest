import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';import test from 'node:test';
import {game} from '../js/gstate.js';import {GameMap} from '../js/game.js';import {runSegmentStrict as runSegment} from '../js/jsmain.js';
import {newMonster,place_monster} from '../js/monst.js';import {PM_KOBOLD_SHAMAN,PM_HUMAN,AD_CLRC,AD_SPEL,AT_MAGC} from '../js/monsters.js';
import {castmu} from '../js/mcastu.js';
import {ROOM,HALLUC,HALLUC_RES,CONFUSION,STUNNED,ANTIMAGIC,FREE_ACTION,HALF_SPDAM,NOT_HUNGRY,FAINTED,STRAT_WAITFORU,A_STR} from '../js/const.js';
import {light_globals_init} from '../js/light.js';import {vision_reset,vision_recalc,init_vision_globals} from '../js/vision.js';
const cases=[
 {id:'confuse-hallu-new',spell:2,cleric:true,hallu:true,half:true,old:0,suffix:'trippy!',confused:8},
 {id:'confuse-hallu-old',spell:2,cleric:true,hallu:true,old:3,suffix:'trippier!',confused:18},
 {id:'confuse-normal-new',spell:2,cleric:true,old:0,suffix:'confused!',confused:15},
 {id:'confuse-normal-old',spell:2,cleric:true,old:3,suffix:'more confused!',confused:18},
 {id:'confuse-antimagic',spell:2,cleric:true,anti:true,old:3,suffix:'momentarily dizzy.',confused:3},
 {id:'stun-antimagic',spell:3,anti:true,suffix:'momentarily disoriented.',stunned:1},
 {id:'stun-free-action',spell:3,free:true,suffix:'momentarily disoriented.',stunned:1},
 {id:'stun-already-stunned',spell:3,anti:true,oldStun:5,stunned:1},
 {id:'weaken-antimagic',spell:6,anti:true,suffix:'momentarily weakened.'},
 {id:'weaken-ordinary',spell:6,weaken:true},
 {id:'curse-items',spell:10,suffix:'as if you need some help.',curse:true},
 {id:'aggravation-control',spell:13,suffix:'that monsters are aware of your presence.',aggravate:true},
];
for(const c of cases)for(const awareness of ['awake','paralyzed','sleeping','fainted'])test(`spell sensation ${c.id} ${awareness}`,async()=>{
 await runSegment({seed:8432174,datetime:'20270419100000',nethackrc:'OPTIONS=name:SpellSensation,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips,!sparkle\n',moves:' '});
 game.level=new GameMap();game.head_engr=null;game.invent=null;game.uwep=null;
 for(let x=2;x<=20;x++)for(let y=2;y<=15;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
 game.u.ux=5;game.u.uy=7;
 const actor=newMonster({data:game.mons[PM_KOBOLD_SHAMAN],mnum:PM_KOBOLD_SHAMAN,m_id:9931,m_lev:15,mhp:40,mhpmax:40,mcanmove:true,mcansee:true,mux:5,muy:7});
 const waiting=newMonster({data:game.mons[PM_HUMAN],mnum:PM_HUMAN,m_id:9932,m_lev:1,mhp:10,mhpmax:10,mcanmove:true,mcansee:true,msleeping:true,mstrategy:STRAT_WAITFORU});
 actor.nmon=waiting;game.level.monlist=actor;place_monster(actor,6,7,game);place_monster(waiting,7,7,game);
 for(const [p,on] of [[HALLUC,c.hallu],[HALLUC_RES,false],[ANTIMAGIC,c.anti],[FREE_ACTION,c.free],[HALF_SPDAM,c.half]]){game.u.uprops[p].intrinsic=on?100:0;game.u.uprops[p].extrinsic=0;}
 // youprop.h:383 Free_action is EFree_action alone, so free action comes from a worn ring (extrinsic bit 1).
 game.u.uprops[FREE_ACTION].intrinsic=0;game.u.uprops[FREE_ACTION].extrinsic=c.free?1:0;
 game.u.uprops[CONFUSION].intrinsic=c.old??0;game.u.uprops[STUNNED].intrinsic=c.oldStun??0;
 game.multi=awareness==='awake'?0:-4;game.u.usleep=awareness==='sleeping'?1:0;game.u.uhs=awareness==='fainted'?FAINTED:NOT_HUNGRY;game.u.uhunger=awareness==='fainted'?-10:900;game.nomovemsg=awareness==='sleeping'?'You wake up.':null;
 light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
  game.multi=awareness==='awake'?0:-4;game.u.usleep=awareness==='sleeping'?1:0;game.u.uhs=awareness==='fainted'?FAINTED:NOT_HUNGRY;game.u.uhunger=awareness==='fainted'?-10:900;game.nomovemsg=awareness==='sleeping'?'You wake up.':null;
  const state=game;
  const before={core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),grid:structuredClone(game.nhDisplay.grid)};
  const lines=[],draws=[];let count=0,encumbrance=0;
  const random={rn2:n=>{draws.push(['rn2',n]);return count++===0?c.spell:50;},d:(n,s)=>{draws.push(['d',n,s]);return n;},rnd:n=>{draws.push(['rnd',n]);return 1;}};
  const agr=state.level.monlist,hp=state.u.uhp,str=state.u.acurr.a[A_STR];
  const result=await castmu(agr,{aatyp:AT_MAGC,adtyp:c.cleric?AD_CLRC:AD_SPEL,damn:1,damd:6},!c.aggravate,!c.aggravate,{state,random,monsterName:()=> 'The caster',losehp:async()=>{throw Error('unexpected strength-overflow HP loss');},encumberMessage:async()=>{encumbrance++;},message:async line=>lines.push(line),unsupported:r=>{throw Error(r);}});
  assert.equal(result,1);assert.equal(encumbrance,c.weaken?1:0);assert.equal(state.u.uhp,hp);assert.equal(agr.mspec_used,2);
  const dreaming=awareness==='sleeping'||awareness==='fainted';
  if(c.suffix)assert(lines.includes(`You ${dreaming?'dream that you feel':'feel'} ${c.suffix}`),JSON.stringify(lines));
  if(c.weaken){assert(lines.includes('You suddenly feel weaker!'));assert.equal(state.u.acurr.a[A_STR],str-1);}else assert.equal(state.u.acurr.a[A_STR],str);
  if(c.stunned!==undefined)assert.equal(state.u.uprops[STUNNED].intrinsic,c.stunned);
  if(c.confused!==undefined)assert.equal(state.u.uprops[CONFUSION].intrinsic,c.confused);
  if(c.curse)assert(lines.includes('You feel a malignant aura surround you.'),'sit.c uses You(mal_aura), without the dream sensation prefix');
  if(c.id==='stun-already-stunned')assert.equal(lines.length,1,'the already-stunned effect adds no sensation');
  if(c.aggravate)assert.equal(agr.nmon.msleeping,false);
  assert.deepEqual(draws,[['rn2',15],['rn2',150],...(c.aggravate?[]:[['d',8,6]]),...(c.weaken?[['rnd',9]]:c.curse?[['rnd',6]]:[])]);
  assert.deepEqual(game.coreCtx,before.core);assert.deepEqual(game.displayCtx,before.display);assert.deepEqual(game.nhDisplay.grid,before.grid);
});

for(const name of ['normal','monochrome','before-control'])test('monster spell sensation '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/mcastu.c/mcast-feel-prefix-'+name+'.session.json',import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}});
