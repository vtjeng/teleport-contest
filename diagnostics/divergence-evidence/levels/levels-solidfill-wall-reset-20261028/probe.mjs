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
async function run(property,method){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='MapWallResetEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});
  const cells=[];
  for(let x=10;x<13;x++)for(let y=6;y<9;y++){
   des.terrain({x:x-1,y,typ:'-',lit:0});cells.push([x,y]);
  }
  des.wall_property({region:[9,6,11,8],property});
  const before=cells.map(([x,y])=>game.level.at(x,y).wall_info);
  assert.deepEqual(before,Array(9).fill(property==='nondiggable'?8:16));
  if(method==='solidfill'||method==='mazegrid')des.level_init({style:method,fg:'-',bg:'-',lit:0});
  else for(const [x,y]of cells)des.terrain({x:x-1,y,typ:'-',lit:0});
  output={before,after:cells.map(([x,y])=>{const c=game.level.at(x,y);return [x,y,c.typ,c.wall_info];})};
  throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);
 return output;
}
const mode=process.argv[2]??'target';assert.ok(['target','control'].includes(mode));
const tmp=mkdtempSync(join(tmpdir(),'levels-map-wall-reset-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const rows=[];
 for(const property of ['nondiggable','nonpasswall'])for(const method of ['solidfill','mazegrid','terrain']){
  const kind=method==='solidfill'?'target':'control';if(mode!==kind)continue;
  const raw=execFileSync(join(tmp,'oracle'),[property==='nondiggable'?'8':'16',method],{encoding:'utf8'}).trim().split('\n');
  const expected={before:raw.shift().split(',').map(Number),after:raw.map(s=>s.split(',').map(Number))};
  const actual=await run(property,method);rows.push({property,method,kind,expectedC:expected,observedJS:actual,matched:JSON.stringify(expected)===JSON.stringify(actual)});
 }
 console.log(JSON.stringify(rows,null,2));
 for(const row of rows)if(!row.matched)process.exitCode=1;
}finally{rmSync(tmp,{recursive:true,force:true});}
