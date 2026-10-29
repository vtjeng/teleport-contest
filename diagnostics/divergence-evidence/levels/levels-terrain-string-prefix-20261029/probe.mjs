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
async function run(form,text){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='TerrainStringEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});let failed=0;
  try{if(form===1)des.terrain({x:13,y:10,typ:text,lit:0});else des.terrain(13,10,text);}catch(e){assert.match(e.message,/Erroneous map char/);failed=1;}
  output=[failed,game.level.at(14,10).typ];throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const dirpath=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(dirpath,'source-contract.json')));
for(const [path,hash]of Object.entries(contract.cSourceHashes))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,path);
const oracle=readFileSync(join(dirpath,'oracle.c'),'utf8');
for(const {path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0);assert(oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-terrain-string-'));let differences=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',exe]);
 for(const form of [1,3])for(const text of mode==='target'?['T\0suffix','T\0']:['T','TT','\0T']){
  const hex=Buffer.from(text).toString('hex'),expected=execFileSync(exe,[String(form),hex],{encoding:'utf8'}).trim().split(' ').map(Number),observed=await run(form,text);
  assert.deepEqual(expected,text.startsWith('T')&&text!=='TT'?[0,13]:[1,25]);console.log(JSON.stringify({form,hex,expected,observed}));if(JSON.stringify(expected)!==JSON.stringify(observed))differences++;
 }
 console.log(JSON.stringify({mode,differences}));process.exitCode=differences?1:0;
}finally{rmSync(tmp,{recursive:true,force:true});}
