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

async function run(midpoint,typ){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='MazewalkEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});
  des.terrain(13,11,midpoint===23?'+':'.');des.terrain(14,11,' ');
  assert.deepEqual([game.level.at(13,11).typ,game.level.at(14,11).typ,game.level.at(15,11).typ],[25,midpoint,0]);
  enableRngLog();des.mazewalk({x:11,y:11,dir:'east',typ:typ===25?'.':'#',stocked:0});
  const rng=getRngLog();output={cells:[13,14,15].map(x=>game.level.at(x,11).typ),rng};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const tmp=mkdtempSync(join(tmpdir(),'levels-mazewalk-door-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const typ of [25,24]){
  const midpoint=mode==='target'?23:25;
  const expected=execFileSync(join(tmp,'oracle'),[String(midpoint),String(typ)],{encoding:'utf8'}).trim().split(' ').map(Number);const actual=await run(midpoint,typ);results.push({midpoint,typ,expected,actual});
 }
 console.log(JSON.stringify({scope:'Two corridor terrain choices, fixed valid map, stocking disabled. Intermediate door target and floor control.',results},null,2));
 for(const r of results){assert.deepEqual(r.actual.rng,['rn2(1)=0']);if(JSON.stringify(r.actual.cells)!==JSON.stringify(r.expected.slice(0,3)))process.exitCode=1;assert.equal(r.expected[3],1);}
}finally{rmSync(tmp,{recursive:true,force:true});}
