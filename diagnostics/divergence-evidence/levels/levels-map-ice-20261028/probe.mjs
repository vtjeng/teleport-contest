import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newgame_pre_mklev} from '../../../../js/allmain.js';
import {game,resetGame} from '../../../../js/gstate.js';
import {mklev} from '../../../../js/mklev.js';
import {monst_globals_init} from '../../../../js/monsters.js';
import {objects_globals_init} from '../../../../js/objects.js';
import {timeout_globals_init} from '../../../../js/timeout.js';
import {light_globals_init} from '../../../../js/light.js';
import {initRng} from '../../../../js/rng.js';
import {str2align,str2gend,str2race,str2role} from '../../../../js/roles.js';
class LoaderDone extends Error {}
async function run(init,pools,method){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='MapIceEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  if(init)des.level_init({style:'solidfill',fg:'.',lit:0});
  if(pools)des.level_flags('icedpools');
  const cells=[];
  if(method==='map'){
   const placed=des.map({x:10,y:6,map:'III\nIII\nIII'});
   for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(placed.selection.get(x,y))cells.push([x,y]);
  }else{
   for(let x=10;x<13;x++)for(let y=6;y<9;y++){des.terrain({x:x-1,y,typ:'I',lit:0});cells.push([x,y]);}
  }
  assert.equal(cells.length,9);
  output=cells.map(([x,y])=>{const c=game.level.at(x,y);return [x,y,c.typ,c.icedpool??0];});
  throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);
 return output;
}
const mode=process.argv[2]??'observe';assert.ok(['observe','target','control'].includes(mode));
const tmp=mkdtempSync(join(tmpdir(),'levels-map-ice-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const rows=[];
 for(const [init,pools,method,kind]of [[true,false,'map','target'],[true,true,'map','target'],[false,false,'map','control'],[false,true,'map','control'],[true,false,'terrain','control'],[true,true,'terrain','control']]){
  if(mode!=='observe'&&mode!==kind)continue;
  const expected=execFileSync(join(tmp,'oracle'),[String(Number(init)),String(Number(pools)),method],{encoding:'utf8'}).trim().split('\n').map(s=>s.split(',').map(Number));
  const actual=await run(init,pools,method);rows.push({init,pools,method,kind,expectedC:expected,observedJS:actual,matched:JSON.stringify(expected)===JSON.stringify(actual)});
 }
 console.log(JSON.stringify(rows,null,2));
 if(mode!=='observe')for(const row of rows)assert.deepEqual(row.observedJS,row.expectedC,`init=${row.init} pools=${row.pools} ${row.method}`);
}finally{rmSync(tmp,{recursive:true,force:true});}
