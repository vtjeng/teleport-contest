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
async function run(f){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='SubroomPlacementEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);



 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});let bounds=null,calls=0;
  des.region({region:[10,5,10+f.pw-1,5+f.ph-1],arrival_room:true,lit:0,filled:0,contents:parent=>{
   assert.deepEqual(parent.region,{x1:11,y1:5,x2:10+f.pw,y2:4+f.ph});
   initRng(f.seed);enableRngLog();
   des.room({x:f.x,y:f.y,w:f.w,h:f.h,type:'vault',lit:0,chance:0,filled:0,contents:room=>{calls++;const r=room.region;bounds=[r.x1,r.y1,r.x2,r.y2];}});
   const tape=getRngLog().map(line=>{const m=/^rnd\((\d+)\)=(\d+)$/.exec(line);assert(m,line);return [+m[1],+m[2]];});
   output={calls,bounds,tape};
  }});
  assert.equal(game.nsubroom??0,calls);throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const fixtures=[
 {id:'near-adjustment',pw:12,ph:9,x:1,y:1,w:2,h:2,seed:28105100},
 {id:'far-adjustment',pw:12,ph:9,x:9,y:6,w:2,h:2,seed:28105100},
 ...[28105101,28105102].flatMap(seed=>[
  {id:'random-position',pw:12,ph:9,x:-1,y:-1,w:2,h:2,seed},
  {id:'random-size-position',pw:12,ph:9,x:-1,y:-1,w:-1,h:-1,seed},
  {id:'minimum-parent',pw:4,ph:4,x:-1,y:-1,w:-1,h:-1,seed},
 ]),
 {id:'narrow-parent',pw:3,ph:4,x:-1,y:-1,w:-1,h:-1,seed:28105100},
 {id:'short-parent',pw:4,ph:3,x:-1,y:-1,w:-1,h:-1,seed:28105100},
];
const tmp=mkdtempSync(join(tmpdir(),'levels-subroom-placement-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);const results=[];
 for(const f of fixtures){const actual=await run(f);const raw=execFileSync(join(tmp,'oracle'),[f.pw,f.ph,f.x,f.y,f.w,f.h].map(String),{input:actual.tape.map(x=>x.join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split(/\s+/).map(Number);
 assert.equal(actual.calls,raw[0]);assert.equal(actual.tape.length,raw[1]);assert.deepEqual(actual.bounds,raw[0]?raw.slice(2):null);results.push({...f,...actual,matched:true});}
 assert.deepEqual(results[0].bounds,[11,5,12,6]);assert.deepEqual(results[1].bounds,[21,12,22,13]);
 for(const r of results.slice(-2)){assert.equal(r.calls,0);assert.deepEqual(r.tape,[]);}
 console.log(JSON.stringify({scope:'10 create_subroom placement/acceptance cases; exact bounded shared draw tape; no finalization',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
