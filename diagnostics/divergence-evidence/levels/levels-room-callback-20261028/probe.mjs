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
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomCallbackEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);



 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});
  assert.deepEqual([des.frame.xstart,des.frame.ystart],[1,0]);
  let calls=0;
  des.region({region:[10,5,14,7],type:f.type,lit:f.lit,joined:f.joined,arrival_room:true,filled:0,contents:room=>{calls++;output=structuredClone(room);}});
  assert.equal(calls,1);assert.equal(game.level.nroom,1);
  const room=game.level.rooms[0];assert.deepEqual([room.lx,room.ly,room.hx,room.hy],[11,5,15,7]);
  assert.equal(room.rtype,f.rtype);assert.equal(Boolean(room.rlit),Boolean(f.lit));assert.equal(Boolean(room.needjoining),f.joined);assert.equal(Boolean(room.irregular),false);
  throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const tmp=mkdtempSync(join(tmpdir(),'levels-room-callback-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const results=[];
 for(const [type,rtype] of [['ordinary',0],['vault',4],['temple',10]])for(const lit of [0,1])for(const joined of [false,true]){
  const f={type,rtype,lit,joined};const expected=JSON.parse(execFileSync(join(tmp,'oracle'),[rtype,lit,+joined].map(String),{encoding:'utf8'}));const actual=await run(f);assert.deepEqual(actual,expected);results.push({...f,descriptor:actual,matched:true});
 }
 assert.equal(results[0].descriptor.width,5);assert.equal(results[0].descriptor.height,3);
 console.log(JSON.stringify({scope:'12 rectangular room callback descriptors; no filling/finalization or orig_rtype claim',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
