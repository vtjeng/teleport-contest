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
import {initRng,enableRngLog,getRngLog} from '../../../../js/rng.js';
import {str2align,str2gend,str2race,str2role} from '../../../../js/roles.js';
class LoaderDone extends Error {}
import {get_rect} from '../../../../js/rect.js';
import {mazexy} from '../../../../js/mkmaze.js';
async function run(kind,corrmaze){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomObstructionEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  const chr=corrmaze?'#':'.';des.level_init({style:'solidfill',fg:kind===3?chr:' ',lit:0});if(corrmaze)des.level_flags('corrmaze');
  if(kind!==3){des.terrain(1,7,chr);des.terrain(6,2,chr);assert.equal(game.level.at(2,7).typ,corrmaze?24:25);assert.equal(game.level.at(7,2).typ,corrmaze?24:25);}
  let tape=[],calls=0;let random;
  if(kind!==3){const values=kind===0?[7,2]:kind===1?[...Array(198).fill(1),7,2]:Array(200).fill(1);random=n=>{const value=values[calls++];assert(value!==undefined);tape.push([n,value]);return value;};}
  else {initRng(28105401+corrmaze);enableRngLog();}
  const coordinate={x:-9,y:-9};const point=mazexy(coordinate,{xMazeMax:78,yMazeMax:20},game,random);assert.equal(point,coordinate);
  if(kind===3)tape=getRngLog().map(line=>{const m=/^rnd\((\d+)\)=(\d+)$/.exec(line);assert(m,line);return [+m[1],+m[2]];});
  output={point,tape};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const tmp=mkdtempSync(join(tmpdir(),'levels-maze-coordinate-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const corrmaze of [0,1])for(const kind of mode==='target'?[1,2]:[0,3]){
  const actual=await run(kind,corrmaze);const expected=execFileSync(join(tmp,'oracle'),[String(kind),String(corrmaze)],{input:actual.tape.map(x=>x.join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split(/\s+/).map(Number);
  assert.deepEqual([actual.point.x,actual.point.y,actual.tape.length],expected);if(kind===1)assert.deepEqual(expected,[7,2,200]);if(kind===2)assert.deepEqual(expected,[2,7,200]);if(kind===0)assert.deepEqual(expected,[7,2,2]);if(kind===3)assert.equal(expected[2],2);
  results.push({kind,corrmaze,expected,...actual,matched:true});
 }
 console.log(JSON.stringify({scope:'Eight valid maze coordinate choices: immediate hit, 100th hit, scan fallback, and real default RNG with two terrain modes. Shared checked draw tapes.',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
