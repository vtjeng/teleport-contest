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
import {flip_level_rnd} from '../../../../js/sp_lev.js';
async function run(f){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomObstructionEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});des.terrain(10,7,'#');assert.equal(game.level.at(11,7).typ,24);assert.equal(game.level.traps.length,0);assert(!game.level.monlist&&!game.level.objlist);
  let tape=[];if(f.values){let i=0;await flip_level_rnd(f.flp,false,game,{random:{rn2(n){const value=f.values[i++];assert(value!==undefined);tape.push([n,value]);return value;}}});assert.equal(i,f.values.length);}else{initRng(f.seed);enableRngLog();await flip_level_rnd(f.flp,false,game);tape=getRngLog().map(line=>{const m=/^rn2\((\d+)\)=(\d+)$/.exec(line);assert(m,line);return [+m[1],+m[2]];});}
  const points=[];for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(game.level.at(x,y).typ===24)points.push([x,y]);assert.equal(points.length,1);output={point:points[0],tape};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const fixtures=[];
for(const flp of [0,1,2,3]){const n=(flp&1?1:0)+(flp&2?1:0);for(let bits=0;bits<(1<<n);bits++)fixtures.push({flp,values:Array.from({length:n},(_,i)=>(bits>>i)&1),control:bits===0});}
fixtures.push({flp:3,seed:28105601,control:false},{flp:3,seed:28105602,control:false});
const tmp=mkdtempSync(join(tmpdir(),'levels-flip-dispatch-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const f of fixtures){if((mode==='control')!==f.control)continue;const actual=await run(f);const [mask,draws]=execFileSync(join(tmp,'oracle'),[String(f.flp)],{input:actual.tape.map(x=>x.join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split(' ').map(Number);assert.equal(actual.tape.length,draws);assert.equal(draws,(f.flp&1?1:0)+(f.flp&2?1:0));const expected=[mask&2?69:11,mask&1?13:7];assert.deepEqual(actual.point,expected);results.push({...f,mask,draws,expected,...actual,matched:true});}
 console.log(JSON.stringify({scope:'Nine legal dispatch mask/draw combinations plus two default RNG seeds; one empty-level terrain marker. C flip callback captures mask only, not full flip implementation.',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
