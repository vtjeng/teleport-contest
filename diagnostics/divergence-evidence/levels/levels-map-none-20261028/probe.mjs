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
import {ROOM} from '../../../../js/const.js';
class LoaderDone extends Error {}
async function run(halign,valign){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='MapNoneEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  const spec={x:10,y:6,map:'...\n...\n...'};
  if(halign!=='absent')spec.halign=halign;if(valign!=='absent')spec.valign=valign;
  const placed=des.map(spec),points=[];
  for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(placed.selection.get(x,y)){
   assert.equal(game.level.at(x,y).typ,ROOM);points.push([x,y]);
  }
  assert.equal(points.length,9);
  output={frame:[placed.xstart,placed.ystart,placed.xsize,placed.ysize],points};
  throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);
 return output;
}
const mode=process.argv[2]??'observe';assert.ok(['observe','target','control'].includes(mode));
const tmp=mkdtempSync(join(tmpdir(),'levels-map-none-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const rows=[];
 for(const [halign,valign,kind]of [['none','none','target'],['none','center','target'],['center','none','target'],['absent','absent','control'],['center','center','control'],['absent','center','control'],['center','absent','control']]){
  if(mode!=='observe'&&mode!==kind)continue;
  const raw=execFileSync(join(tmp,'oracle'),[halign,valign],{encoding:'utf8'}).trim().split('\n');
  const expected={frame:raw.shift().split(' ').map(Number),points:raw.map(s=>s.split(',').map(Number))};
  const actual=await run(halign,valign);rows.push({halign,valign,kind,expectedC:expected,observedJS:actual,matched:JSON.stringify(expected)===JSON.stringify(actual)});
 }
 console.log(JSON.stringify(rows,null,2));
 if(mode!=='observe')for(const row of rows)assert.deepEqual(row.observedJS,row.expectedC,`${row.halign}/${row.valign}`);
}finally{rmSync(tmp,{recursive:true,force:true});}
