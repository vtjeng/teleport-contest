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
async function run(frame,type){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomObstructionEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});assert.equal(game.exclusion_zones,null);
  const place=()=>{for(const region of [[1,1,3,2],[0,0,2,1]]){const spec={region};if(type>=0)spec.type=['teleport','teleport-up','teleport-down','monster-generation'][type];des.exclusion(spec);}const head=game.exclusion_zones;assert(head&&head.next&&head!==head.next&&!head.next.next);output=[];for(let e=head;e;e=e.next)output.push([e.zonetype,e.lx,e.ly,e.hx,e.hy]);};
  if(frame===1){des.map({x:10,y:6,map:'.....\n.....\n.....\n.....\n.....'});place();}else if(frame===2){des.region({region:[10,5,14,9],type:'ordinary',lit:0,filled:0,arrival_room:true,contents:room=>{assert.deepEqual(room.region,{x1:11,y1:5,x2:15,y2:9});place();}});}else place();throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const tmp=mkdtempSync(join(tmpdir(),'levels-exclusion-reg-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const frame of [0,1,2])for(const type of mode==='control'?[-1]:[0,1,2,3]){
  const expected=execFileSync(join(tmp,'oracle'),[String(frame),String(type)],{encoding:'utf8'}).trim().split('\n').map(l=>l.split(' ').map(Number));const actual=await run(frame,type);assert.deepEqual(actual,expected);results.push({frame,type,expected,actual});
 }
 console.log(JSON.stringify({scope:'15 exclusion registrations with two entries each: three coordinate frames and default/four types. Registration only.',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
