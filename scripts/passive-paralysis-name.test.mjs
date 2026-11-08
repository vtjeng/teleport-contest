import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {GameMap} from '../js/game.js';
import {runSegmentStrict as runSegment} from '../js/jsmain.js';
import {newMonster,place_monster} from '../js/monst.js';
import {PM_HUMAN,PM_ANGEL,PM_GELATINOUS_CUBE,PM_FLOATING_EYE} from '../js/monsters.js';
import {mattackm} from '../js/mhitm.js';
import {wieldMonsterItemAgainstMonster} from '../js/unported_monster_actions.js';
import {ROOM,HALLUC,DETECT_MONSTERS,BLINDED,SEE_INVIS,STRAT_WAITFORU,A_LAWFUL,OBJ_MINVENT,W_ARMS} from '../js/const.js';
import {light_globals_init} from '../js/light.js';
import {vision_reset,vision_recalc,init_vision_globals} from '../js/vision.js';
import {canseemon} from '../js/display.js';
import {rn2_on_display_rng} from '../js/rng.js';
import {Monnam} from '../js/do_name.js';
import {newObject} from '../js/obj.js';
import {SHIELD_OF_REFLECTION} from '../js/objects.js';

for(const kind of ['cube','eye'])for(const hallu of [false,true])for(const detected of [false,true])for(const invisible of [false,true]){
 test(`passive paralysis ${kind} Hallu=${hallu} Detect=${detected} Invisible=${invisible}`,async()=>{
  await exercise({kind,hallu,detected,invisible,angel:false});
 });
}
for(const kind of ['cube','eye'])for(const hallu of [false,true])test(`passive paralysis actual Angel ${kind} Hallu=${hallu}`,async()=>{
 await exercise({kind,hallu,detected:true,invisible:true,angel:true});
});
for(const hallu of [false,true])for(const invisible of [false,true])test(`passive paralysis eye reflection Hallu=${hallu} Invisible=${invisible}`,async()=>{await exercise({kind:'eye',hallu,detected:true,invisible,angel:false,reflect:true});});
for(const kind of ['cube','eye'])for(const hallu of [false,true])test(`passive paralysis actual blind Angel ${kind} Hallu=${hallu}`,async()=>{await exercise({kind,hallu,detected:true,invisible:false,angel:true,blind:true});});
async function exercise({kind,hallu,detected,invisible,angel,reflect=false,blind=false}){
 await runSegment({seed:8432168,datetime:'20270413100000',nethackrc:'OPTIONS=name:PassiveParalysis,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
 game.level=new GameMap();game.head_engr=null;
 for(let x=2;x<=20;x++)for(let y=2;y<=15;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
 game.u.ux=5;game.u.uy=7;
 for(const [p,on] of [[HALLUC,hallu],[DETECT_MONSTERS,detected],[BLINDED,blind],[SEE_INVIS,false]]){game.u.uprops[p].intrinsic=on?1000:0;game.u.uprops[p].extrinsic=0;}
 const aType=angel?PM_ANGEL:PM_HUMAN,dType=kind==='cube'?PM_GELATINOUS_CUBE:PM_FLOATING_EYE;
 const attacker=newMonster({data:game.mons[aType],mnum:aType,m_id:9921,m_lev:1,mhp:40,mhpmax:40,mcansee:true,mcanmove:true,minvis:invisible,isminion:angel,mextra:angel?{emin:{min_align:A_LAWFUL,renegade:false}}:null,meating:5,mstrategy:STRAT_WAITFORU});
 const defender=newMonster({data:game.mons[dType],mnum:dType,m_id:9922,m_lev:1,mhp:40,mhpmax:40,mcansee:true,mcanmove:true});
 if(reflect){const shield=newObject({otyp:SHIELD_OF_REFLECTION,oclass:game.objects[SHIELD_OF_REFLECTION].oc_class,quan:1,where:OBJ_MINVENT,owornmask:W_ARMS,ocarry:attacker});attacker.minvent=shield;attacker.misc_worn_check=W_ARMS;}
 attacker.nmon=defender;game.level.monlist=attacker;place_monster(attacker,6,7,game);place_monster(defender,7,7,game);game.gb.bhitpos={x:7,y:7};
 light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
 const agr=game.level.monlist,def=agr.nmon;
 assert.equal(canseemon(agr,game),!invisible&&!blind);
 const before={core:structuredClone(game.coreCtx),context:structuredClone(game.context),grid:structuredClone(game.nhDisplay.grid)};
 const draws=[],lines=[];let passiveDisplayBefore;
 const result=await mattackm(agr,def,{state:game,random:{rnd:n=>{draws.push(['rnd',n]);return 1;},d:(n,s)=>{draws.push(['d',n,s]);if(s===(kind==='cube'?4:70))passiveDisplayBefore=structuredClone(game.displayCtx);return n;},rn2:n=>{draws.push(['rn2',n]);return 1;}},canSeeMonster:m=>canseemon(m,game),message:async line=>{lines.push(line);},wieldMonsterItemAgainstMonster,unsupported:r=>{throw Error(r);}});
 assert.equal(result,1);assert.equal(agr.mcanmove,reflect);if(reflect){assert.equal(agr.mfrozen,0);assert.equal(agr.meating,5);}else{assert(agr.mfrozen>0);assert.equal(agr.meating,0);assert.equal(agr.mstrategy&STRAT_WAITFORU,0);}assert.equal(agr.mhp,40);assert(def.mhp<40);
 assert(!draws.some(x=>x[0]==='rn2'&&[430,13].includes(x[1])),'cosmetic names must not use gameplay random');
 if(invisible||blind){
  if(!blind)assert.equal(lines.length,1,'unseen attacker has only active-hit feedback');
  assert(!lines.some(x=>x.includes('is frozen by')));assert(passiveDisplayBefore);
  // Replay the names on a copy of the display stream taken at the passive
  // roll, then compare it with the stream the attack actually left.
  const liveDisplay=game.displayCtx;let refDisplay;game.displayCtx=structuredClone(passiveDisplayBefore);const names={displayRandom:n=>rn2_on_display_rng(n,game)};
  try{
   // C computes the floating-eye format first, then the attacker name;
   // the cube arm computes only the attacker before its visibility check.
   if(kind==='eye')Monnam(def,game,names);
   if(!reflect)Monnam(agr,game,names);
  }finally{refDisplay=game.displayCtx;game.displayCtx=liveDisplay;}
  assert.deepEqual(game.displayCtx,refDisplay,'C unconditional name evaluation sequence');
 }else assert.match(lines.at(-1),reflect?/ gaze is reflected by .* shield\.$/:kind==='eye'?/ is frozen by .* gaze!$/:/ is frozen by .*\.$/);
 assert.deepEqual(game.coreCtx,before.core);assert.deepEqual(game.context,before.context);assert.deepEqual(game.nhDisplay.grid,before.grid);
}

for(const name of ['normal','monochrome','before-control'])test('passive paralysis names '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/mhitm.c/passive-paralysis-name-'+name+'.session.json',import.meta.url)));const r=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(r.passed,true,formatReport(r));}finally{removeScoringWorkspace(root);}});
