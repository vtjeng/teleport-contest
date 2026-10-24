import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {PM_ANGEL} from '../js/monsters.js';
import {BLINDED,HALLUC,DEAF,DETECT_MONSTERS} from '../js/const.js';
import {lose_guardian_angel} from '../js/minion.js';
import {canseemon,canspotmon} from '../js/display.js';
import {vision_recalc} from '../js/vision.js';
import {createCoreRandom} from '../js/rng.js';
const prefix="  \u0017uncursed +0 helm of opposite alignment\n    #wizlevelport\n?\n>J                        nothing\n    ";
const options="OPTIONS=name:HealerAccessProbe,role:Healer,race:human,gender:female,align:neutral,playmode:debug,pettype:cat,!legacy,!tutorial,!splash_screen,acoustics,!autopickup,!tips\n";
function monsters(){const out=[];for(let m=game.level.monlist;m;m=m.nmon)out.push(m);return out;}
for(const hallu of [true,false])for(const deaf of [true,false])for(const mode of ['visible','detected','unseen']){
 test(`guardian departure Hallu=${hallu} Deaf=${deaf} perception=${mode}`,async()=>{
  await runSegment({seed:8432087,datetime:'20270211100000',nethackrc:options,moves:prefix});
  const guardian=monsters().find(m=>m.mhp>0&&m.mtame>0&&m.isminion&&m.mnum===PM_ANGEL);
  assert.ok(guardian,'canonical Astral arrival created a tame guardian');assert.equal(guardian.mtame,10);assert.equal(guardian.mextra?.edog,undefined);
  for(const [index,active] of [[HALLUC,hallu],[DEAF,deaf],[BLINDED,mode!=='visible'],[DETECT_MONSTERS,mode==='detected']]){game.u.uprops[index].intrinsic=active?800:0;game.u.uprops[index].extrinsic=0;}
  vision_recalc(0);
  assert.equal(canseemon(guardian,game),mode==='visible');assert.equal(canspotmon(guardian,game),mode!=='unseen');
  let inventoryCount=0;for(let o=guardian.minvent;o;o=o.nobj)inventoryCount++;
  const before=new Set(monsters().map(m=>m.m_id)),hp=game.u.uhp,max=game.u.uhpmax,old=[guardian.mx,guardian.my];
  const source=createCoreRandom(game.coreCtx,game),draws=[],lines=[];
  const random=Object.fromEntries(Object.entries(source).map(([name,fn])=>[name,(...args)=>{const value=fn(...args);draws.push([name,args,value]);return value;}]));
  await lose_guardian_angel(guardian,game,{random,message:async line=>{assert.equal(draws.length,0,'departure precedes replacement RNG');lines.push(line);}});
  if(mode==='unseen')assert.deepEqual(lines,[]);
  else {
   assert.equal(lines.length,deaf?1:2);
   if(hallu)assert.match(lines[0],deaf?/^.+ vanishes!$/:/^.+ rebukes you, saying:$/);
   else assert.equal(lines[0],deaf?'The guardian Angel of Hermes vanishes!':'The guardian Angel of Hermes rebukes you, saying:');
   if(!deaf)assert.equal(lines[1],'"Since you desire conflict, have some more!"');
  }
  const countIndex=draws.findIndex(d=>d[0]==='rn1'&&d[1][0]===3&&d[1][1]===2);assert.equal(countIndex,inventoryCount);for(const draw of draws.slice(0,countIndex)){assert.deepEqual(draw.slice(0,2),['rn2',[100]]);}const count=draws[countIndex][2];assert.ok(count>=2&&count<=4);
  const replacements=monsters().filter(m=>m.mhp>0&&!before.has(m.m_id));assert.equal(replacements.length,count);
  for(const m of replacements){assert.equal(m.mnum,PM_ANGEL);assert.equal(Boolean(m.mtame),false);assert.equal(Boolean(m.mpeaceful),false);assert.equal(m.mextra?.emin?.min_align,game.u.ualign.type);}
  assert.ok(guardian.mhp<=0);assert.notEqual(game.level.monsters[old[0]][old[1]],guardian);assert.equal(game.u.uhp,hp);assert.equal(game.u.uhpmax,max);
 });
}

for(const name of ['normal','monochrome','before-control']) {
 test('guardian sensed departure '+name+' matches independent C',async()=>{
  const root=createScoringWorkspace(process.cwd(),[]);
  try {
   const c=JSON.parse(fs.readFileSync(new URL('../recordings/minion.c/guardian-loss-perception-'+name+'.session.json',import.meta.url)));
   const result=compareSessionOutputs(c,await runJsSession(c,root));
   assert.equal(result.passed,true,formatReport(result));
  }finally{removeScoringWorkspace(root);}
 });
}
