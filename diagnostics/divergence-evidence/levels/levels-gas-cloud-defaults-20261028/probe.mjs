import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newgame_pre_mklev} from '../../../../js/allmain.js';
import {game,resetGame} from '../../../../js/gstate.js';
import {mklev,lspo_gas_cloud} from '../../../../js/mklev.js';
import {monst_globals_init} from '../../../../js/monsters.js';
import {objects_globals_init} from '../../../../js/objects.js';
import {timeout_globals_init} from '../../../../js/timeout.js';
import {light_globals_init} from '../../../../js/light.js';
import {initRng} from '../../../../js/rng.js';
import {str2align,str2gend,str2race,str2role} from '../../../../js/roles.js';
class LoaderDone extends Error {}
import {selection_area} from '../../../../js/themerooms.js';
async function run(form,ttl){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='GasCloudEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});des.map({x:10,y:6,map:'...\n...\n...'});
  const selection=selection_area(2,2,2,2);des.terrain(selection,'#');assert.equal(game.level.at(12,8).typ,24);
  const calls=[],random={rn2:n=>{assert.equal(n,3);calls.push(n);return 2;}};
  const table=form==='selection'?{selection}:{x:2,y:2};if(ttl!==null)table.ttl=ttl;
  lspo_gas_cloud([table],{state:game,frame:des.frame,random});
  const regions=game.level.regions;assert.equal(regions.length,1);const reg=regions[0];assert.equal(reg.rects.length,1);
  const r=reg.rects[0];output={rect:[r.lx,r.ly,r.hx,r.hy],ttl:reg.ttl,calls};
  throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);
 return output;
}
const tmp=mkdtempSync(join(tmpdir(),'levels-cloud-defaults-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const results=[];
 for(const form of ['coordinate','selection'])for(const ttl of [null,-1,0,5]){
  const raw=execFileSync(join(tmp,'oracle'),[form==='selection'?'1':'0',String(ttl??-2)],{encoding:'utf8'}).trim().split(' ').map(Number);
  const expected={rect:raw.slice(0,4),ttl:raw[4],calls:Array(raw[5]).fill(3)};
  const actual=await run(form,ttl);assert.deepEqual(actual,expected);
  results.push({form,requestedTtl:ttl,...actual,matched:true});
 }
 assert.deepEqual(results[0].rect,[2,2,2,2]);assert.equal(results[0].ttl,6);
 assert.deepEqual(results[4].rect,[12,8,12,8]);assert.equal(results[4].ttl,-1);
 console.log(JSON.stringify({scope:'Eight harmless single-cell construction cases; no region runtime behavior',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
