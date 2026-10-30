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
import {initRng} from '../../../../js/rng.js';
import {str2align,str2gend,str2race,str2role} from '../../../../js/roles.js';
class LoaderDone extends Error {}
async function run(dir,mode){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='DrawbridgeDoorEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});
  const x=14,y=10,wx=x+(dir===2?1:0)-(dir===3?1:0),wy=y+(dir===1?1:0)-(dir===0?1:0);
  des.terrain({x:x-1,y,typ:'}',lit:0});des.terrain({x:wx-1,y:wy,typ:'-',lit:0});
  des.drawbridge({x:x-1,y,dir:['north','south','east','west'][dir],state:mode===1?'open':'closed'});
  const c=game.level.at(wx,wy),before=[c.typ,c.wall_info,Number(c.horizontal)];
  // Open bridge's C wall_info aliases its zero door mask; JS keeps a separate field.
  des.terrain({x:wx-1,y:wy,typ:mode===2?'S':'+',lit:0});
  des.terrain({x:x-1,y,typ:'.',lit:0});assert.equal(game.level.at(x,y).typ,25);
  output={before,after:[c.typ,c.doormask,Number(c.horizontal)]};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const dirpath=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(dirpath,'source-contract.json')));
for(const [path,hash]of Object.entries(contract.cSourceHashes))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,path);
const oracle=readFileSync(join(dirpath,'oracle.c'),'utf8');
for(const {path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0);assert(oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-drawbridge-door-'));let differences=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',exe]);
 for(let dir=0;dir<4;dir++)for(const kind of mode==='target'?[0]:[1,2]){
  const raw=execFileSync(exe,[String(dir),String(kind)],{encoding:'utf8'}).trim().split('\n').map(s=>s.split(' ').map(Number));const expected={before:raw[0],after:raw[1]},observed=await run(dir,kind);
  assert.equal(expected.after[1],kind===0?8:kind===1?0:4);assert.deepEqual(observed.before,expected.before);console.log(JSON.stringify({dir,kind,expected,observed}));
  if(JSON.stringify(expected.after)!==JSON.stringify(observed.after))differences++;
 }
 console.log(JSON.stringify({mode,differences}));process.exitCode=differences?1:0;
}finally{rmSync(tmp,{recursive:true,force:true});}
