import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
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

async function run(vertical,reverse,offset,seed){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='CorridorEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:' ',lit:0});assert.equal(game.u.uz.dlevel,1);
  const rooms=vertical?[[21,25,12,16],[21+offset,25+offset,2,6]]:[[11,15,5,9],[31,35,5+offset,9+offset]];
  for(const [lx,hx,ly,hy]of rooms){for(let x=lx;x<=hx;x++)for(let y=ly;y<=hy;y++)des.terrain(x-1,y,'.');for(let x=lx-1;x<=hx+1;x++)for(const y of [ly-1,hy+1])des.terrain(x-1,y,'-');for(let y=ly;y<=hy;y++)for(const x of [lx-1,hx+1])des.terrain(x-1,y,'|');}
  const doors=vertical?[[23,11],[23+offset,7]]:[[16,7],[30,7+offset]];for(const [x,y]of doors)des.terrain(x-1,y,'+');
  for(const [lx,hx,ly,hy]of rooms)des.region({region:[lx-1,ly,hx-1,hy],type:'ordinary',lit:0,filled:0,arrival_room:true});
  assert.equal(game.level.nroom,2);assert.deepEqual(game.level.rooms.slice(0,2).map(r=>[r.lx,r.hx,r.ly,r.hy]),rooms);
  const map=()=>{const a=[];for(let x=0;x<80;x++)for(let y=0;y<21;y++)a.push(game.level.at(x,y).typ);return a;};const before=map();
  const srcwall=vertical?(reverse?'south':'north'):(reverse?'west':'east'),destwall=vertical?(reverse?'north':'south'):(reverse?'east':'west');initRng(seed);enableRngLog();
  des.corridor({srcroom:Number(reverse),srcdoor:0,srcwall,destroom:1-Number(reverse),destdoor:0,destwall});
  output={rooms,before,after:map(),rng:getRngLog()};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}


const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
for(const [f,h]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const [file,names]of [['sp_lev.c',['search_door','dig_corridor','create_corridor']],['mklev.c',['maybe_sdoor']]]){const src=readFileSync('nethack-c/upstream/src/'+file,'utf8');for(const n of names){const a=src.indexOf('\n'+n+'(')+1;assert(a>0&&oracle.includes(src.slice(a,src.indexOf('\n}',a)+2)),n);}}
const tmp=mkdtempSync(join(tmpdir(),'levels-authored-corridor-'));let cases=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(const vertical of [false,true])for(const reverse of [false,true])for(const seed of [24301,24302]){
 const offset=mode==='control'?0:vertical?15:6,actual=await run(vertical,reverse,offset,seed);const tape=actual.rng.map(s=>{const m=/^rn2\((\d+)\)=(\d+)$/.exec(s);assert(m,s);return m.slice(1).join(' ');});
 const wall=vertical?(reverse?2:1):(reverse?8:4),input=actual.rooms.map(a=>a.join(' ')).join('\n')+'\n'+actual.before.join(' ')+'\n'+tape.join('\n')+'\n';
 const raw=execFileSync(exe,[String(Number(reverse)),String(wall)],{input,encoding:'utf8'}).trim().split('\n'),expected=Buffer.from(raw[1],'hex');assert.equal(Number(raw[0]),tape.length);assert.equal(expected.length,1680);assert.deepEqual(Buffer.from(actual.after),expected);assert(actual.after.filter((v,i)=>v!==actual.before[i]).length>0);
 console.log(JSON.stringify({vertical,reverse,offset,seed,rooms:actual.rooms,changed:actual.after.filter((v,i)=>v!==actual.before[i]).length,rng:actual.rng,mapSha256:createHash('sha256').update(expected).digest('hex'),equal:true}));cases++;
}console.log(JSON.stringify({mode,cases,equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
