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
async function run(f){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomObstructionEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:' ',lit:0});
  assert.deepEqual(get_rect({lx:0,ly:0,hx:79,hy:20}),{lx:0,ly:0,hx:79,hy:20});
  if(f.mode===1)des.terrain(13,2,'.');if(f.mode===2)des.terrain(19,8,'.');
  initRng(f.seed);enableRngLog();let calls=0,bounds=null;
  des.room({x:2,y:2,w:8,h:6,xalign:'left',yalign:'top',type:'ordinary',chance:0,lit:0,filled:0,contents:room=>{calls++;const r=room.region;bounds=[r.x1,r.y1,r.x2,r.y2];}});
  const tape=getRngLog().map(line=>{const m=/^rn2\((\d+)\)=(\d+)$/.exec(line);assert(m,line);return [+m[1],+m[2]];});
  assert.equal(game.level.nroom,calls);output={calls,bounds,tape};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'observe';assert(['target','control','observe'].includes(mode));
const tmp=mkdtempSync(join(tmpdir(),'levels-room-obstruction-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);const results=[];
 for(const seed of [28105201,28105202])for(const obstruction of [0,1,2]){
  if(mode==='target'&&obstruction===0||mode==='control'&&obstruction!==0)continue;
  const f={seed,mode:obstruction};const actual=await run(f);const raw=execFileSync(join(tmp,'oracle'),[String(obstruction)],{input:actual.tape.map(x=>x.join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split(/\s+/).map(Number);
  assert.equal(actual.calls,raw[0]);assert.equal(actual.tape.length,raw[1]);assert.deepEqual(actual.bounds,raw[0]?raw.slice(2):null);
  if(obstruction===0){assert.deepEqual(actual.bounds,[17,5,24,10]);assert.equal(actual.tape.length,0);}
  if(obstruction===1)assert.deepEqual(actual.bounds,[19,6,26,11]);
  if(obstruction===2){assert.equal(actual.calls,0);assert.equal(actual.tape.length,101);}
  results.push({...f,...actual,matched:true});
 }
 console.log(JSON.stringify({scope:'Six fixed-room acceptance/bounds handoffs with shared draw tapes; no full allocator/topology proof',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
