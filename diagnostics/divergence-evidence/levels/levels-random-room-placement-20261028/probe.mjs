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
async function run(mode,seed){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomObstructionEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:' ',lit:0});assert.deepEqual(get_rect({lx:0,ly:0,hx:79,hy:20}),{lx:0,ly:0,hx:79,hy:20});
  const spec={x:2,y:2,w:6,h:4,xalign:'left',yalign:'top',type:'ordinary',chance:0,lit:0,filled:0};if(mode===1){spec.x=spec.y=spec.w=spec.h=-1;spec.xalign=spec.yalign='random';}if(mode===2)spec.x=spec.y=-1;if(mode===3)spec.w=spec.h=-1;if(mode===4)spec.xalign=spec.yalign='random';
  initRng(seed);enableRngLog();let calls=0,bounds=null;spec.contents=room=>{calls++;const r=room.region;bounds=[r.x1,r.y1,r.x2,r.y2];};des.room(spec);const rawTape=getRngLog();const tape=rawTape.map(line=>{const m=/^(rn2|rnd)\((\d+)\)=(\d+)$/.exec(line);assert(m,line);return [+m[2],+m[3]-(m[1]==='rnd'?1:0)];});assert.equal(game.level.nroom,calls);output={calls,bounds,rawTape,tape};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const tmp=mkdtempSync(join(tmpdir(),'levels-random-room-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const form of mode==='control'?[0]:[1,2,3,4])for(const seed of [28105801,28105802]){
  const actual=await run(form,seed);const raw=execFileSync(join(tmp,'oracle'),[String(form)],{input:actual.tape.map(x=>x.join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split(/\s+/).map(Number);assert.equal(actual.calls,raw[0]);assert.equal(actual.tape.length,raw[1]);assert.deepEqual(actual.bounds,raw[0]?raw.slice(2):null);if(form===0)assert.equal(actual.tape.length,0);results.push({form,seed,...actual,matched:true});
 }
 console.log(JSON.stringify({scope:'Five first-room parameter configurations, two seeds. C bounds/acceptance capture and normalized primitive RNG tape; no full allocator mutation or room storage proof.',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
