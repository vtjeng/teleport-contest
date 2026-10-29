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
async function run(form,frame){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomObstructionEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});assert.equal(game.u.uz.dnum,0);assert.equal(game.u.uz.dlevel,1);assert(!game.stairs);assert.equal(game.level.traps.length,0);if(frame)des.map({x:10,y:6,map:'.....\n.....\n.....\n.....\n.....'});
  if(form===0)des.ladder({x:2,y:2,dir:'down'});else if(form===1)des.ladder({coord:[2,2],dir:'down'});else if(form===2)des.ladder('down',2,2);else des.ladder(2,2);
  const st=game.stairs;assert(st&&!st.next);const loc=game.level.at(st.sx,st.sy);output=[st.sx,st.sy,Number(st.up),Number(st.isladder),st.tolev.dnum,st.tolev.dlevel,loc.typ,loc.ladder,des.frame.splevMap[st.sx][st.sy]];throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const tmp=mkdtempSync(join(tmpdir(),'levels-ladder-descriptor-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const form of mode==='target'?[0,1]:[2,3])for(const frame of [0,1]){
  const expected=execFileSync(join(tmp,'oracle'),[String(form),String(frame)],{encoding:'utf8'}).trim().split(' ').map(Number);const actual=await run(form,frame);assert.deepEqual(actual,expected);results.push({form,frame,expected,actual});
 }
 console.log(JSON.stringify({scope:'Eight fixed down-ladder descriptor calls on D:1: four argument forms/two frames. C captures stairway_add arguments; no C linked-list or movement proof.',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
