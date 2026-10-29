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

async function run(wall,pos,kind,seed){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(seed);game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomDoorEvidence';game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});
  for(let x=11;x<=15;x++)for(const y of [4,10])des.terrain(x-1,y,'-');
  for(let y=5;y<=9;y++)for(const x of [10,16])des.terrain(x-1,y,'|');
  des.region({region:[10,5,14,9],type:'ordinary',lit:0,filled:0,arrival_room:true,contents:room=>{
   assert.deepEqual(room.region,{x1:11,y1:5,x2:15,y2:9});enableRngLog();des.door({wall,pos,state:['closed','secret','random'][kind]});
   const doors=[];for(let x=1;x<80;x++)for(let y=0;y<21;y++){const c=game.level.at(x,y);if(c.typ===23||c.typ===14)doors.push([x,y,c.typ,c.doormask]);}output={doors,rng:getRngLog()};
  }});throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const tmp=mkdtempSync(join(tmpdir(),'levels-room-door-rng-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const seed of [28105401,28105402])for(const [wall,mask]of [['north',1],['south',2],['west',8],['east',4]])for(const pos of [-1,2])for(const kind of mode==='target'?[2]:[0,1]){
  const actual=await run(wall,pos,kind,seed);const tape=actual.rng.map(s=>{const m=/^rn2\((\d+)\)=(\d+)$/.exec(s);assert(m,s);return m.slice(1).join(' ');}).join('\n')+'\n';
  const lines=execFileSync(join(tmp,'oracle'),[mask,pos,kind].map(String),{input:tape,encoding:'utf8'}).trim().split('\n');assert.equal(Number(lines.shift()),actual.rng.length);const expected=lines.map(s=>s.split(' ').map(Number));assert.deepEqual(actual.doors,expected);results.push({seed,wall,pos,kind,expected,actual});
 }
 console.log(JSON.stringify({scope:'Fixed five-by-five room, open exterior; four walls, fixed/random positions, two seeds. Coupled RNG replay and door writes only.',count:results.length,results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
