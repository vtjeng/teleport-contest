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
async function run(map,x,y){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomObstructionEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output,calls=0;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:' ',lit:0});des.map({x,y,map,contents:size=>{calls++;assert.deepEqual(Object.keys(size).sort(),['height','width']);output=size;}});assert.equal(calls,1);for(let dx=0;dx<3;dx++)for(let dy=0;dy<2;dy++)assert.equal(game.level.at(x+dx,y+dy).typ,25);throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const tmp=mkdtempSync(join(tmpdir(),'levels-map-callback-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const map of mode==='target'?['...\n...\n','01...\n02...']:['...\n...'])for(const [x,y]of [[10,5],[20,8]]){
  const raw=execFileSync(join(tmp,'oracle'),[map],{encoding:'utf8'}).trim().split(' ').map(Number);const expected={width:raw[0],height:raw[1]};const actual=await run(map,x,y);assert.deepEqual(actual,expected);results.push({map,x,y,expected,actual});
 }
 console.log(JSON.stringify({scope:'Six top-level map callback size observations for 3x2 floor fragments; plain, trailing newline, ASCII digit labels; two interior positions.',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
