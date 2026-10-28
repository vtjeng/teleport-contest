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
import {selection_new} from '../../../../js/themerooms.js';
async function run(form,chance,seed){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomObstructionEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:' ',lit:0});for(const [x,y] of [[2,2],[3,2],[4,2],[4,3],[8,8]]){des.terrain(x-1,y,'.');assert.equal(game.level.at(x,y).typ,25);}
  const opts={fromterrain:'.',toterrain:'#',chance,lit:-2};if(form===1)opts.region=[0,0,3,2];if(form===2)Object.assign(opts,{x1:0,y1:0,x2:3,y2:2});if(form>=3){opts.selection=selection_new();if(form===3){opts.selection.set(2,2);opts.selection.set(4,3);}}
  initRng(seed);enableRngLog();des.replace_terrain(opts);const tape=getRngLog().map(line=>{const m=/^rn2\((\d+)\)=(\d+)$/.exec(line);assert(m,line);return [+m[1],+m[2]];});const points=[];for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(game.level.at(x,y).typ===24)points.push(`${x},${y}`);output={points,tape};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const tmp=mkdtempSync(join(tmpdir(),'levels-replace-selection-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const form of [0,1,2,3,4])for(const chance of [0,50,100])for(const seed of [28105501,28105502]){
  const control=chance===0||form===4;if((mode==='control')!==control)continue;
  const actual=await run(form,chance,seed);const expected=execFileSync(join(tmp,'oracle'),[String(form),String(chance)],{input:actual.tape.map(x=>x.join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split(' ');assert.equal(actual.tape.length,+expected[0]);assert.deepEqual(actual.points,expected.slice(1));assert.equal(actual.tape.length,[5,3,3,2,0][form]);if(chance===0||form===4)assert.equal(actual.points.length,0);if(chance===100)assert.equal(actual.points.length,[5,3,3,2,0][form]);results.push({form,chance,seed,...actual,matched:true});
 }
 console.log(JSON.stringify({scope:'Five area forms, three chances, two seeds; fromterrain floor to corridor only. Exact selection helpers; fixed typed table/coordinate/write adapters. Shared RNG tape.',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
