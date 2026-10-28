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
import {selection_area,selection_negate} from '../../../../js/themerooms.js';
async function run(xstart,ystart,operation){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='SelectionNegateEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});
  des.map({x:xstart,y:ystart,map:'...\n...\n...'});
  const operand=selection_area(0,0,0,0);des.terrain(operand,'-');
  const walls=[];for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(game.level.at(x,y).typ===2)walls.push([x,y]);
  assert.deepEqual(walls,[[xstart,ystart]],'public constructor denotes C absolute singleton');
  const result=operation==='empty'?selection_negate():operation==='single'?operand:operand.negate();
  des.terrain(result,'#');
  const rows=[];for(let y=0;y<21;y++){let row='';for(let x=1;x<80;x++)row+=game.level.at(x,y).typ===24?'#':'.';rows.push(row);}
  output=rows;
  throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);
 return output;
}
const mode=process.argv[2]??'observe';assert.ok(['observe','target','control'].includes(mode));
const tmp=mkdtempSync(join(tmpdir(),'levels-selection-negate-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const rows=[];
 for(const [x,y,operation,kind]of [[10,6,'negate','target'],[10,0,'negate','target'],[1,6,'negate','target'],[1,0,'negate','control'],[10,6,'empty','control'],[10,6,'single','control']]){
  if(mode!=='observe'&&mode!==kind)continue;
  const expected=execFileSync(join(tmp,'oracle'),[String(x),String(y),operation],{encoding:'utf8'}).trim().split('\n');
  const actual=await run(x,y,operation);
  const count=a=>a.join('').split('#').length-1;
  rows.push({origin:[x,y],operation,kind,cCount:count(expected),jsCount:count(actual),expectedC:expected,observedJS:actual,matched:JSON.stringify(expected)===JSON.stringify(actual)});
 }
 console.log(JSON.stringify(rows,null,2));
 if(mode!=='observe')for(const row of rows)assert.deepEqual(row.observedJS,row.expectedC,`${row.origin} ${row.operation}`);
}finally{rmSync(tmp,{recursive:true,force:true});}
