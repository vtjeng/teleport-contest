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
import {selection_randline} from '../../../../js/quest_levels.js';
async function run(rough){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RandlineWidthEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:' ',lit:0});initRng(0x5eed);enableRngLog();
  const selection=selection_randline(20,8,30,12,rough);des.terrain(selection,'.');
  const points=[];for(let x=0;x<80;x++)for(let y=0;y<21;y++)if(game.level.at(x,y).typ===25)points.push([x,y]);
  output={points,rng:getRngLog().map(s=>{const m=/^rn2\((\d+)\)=(\d+)$/.exec(s);assert(m,s);return [Number(m[1]),Number(m[2])];})};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const dirpath=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(dirpath,'source-contract.json')));
for(const [path,hash]of Object.entries(contract.cSourceHashes))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,path);
const oracle=readFileSync(join(dirpath,'oracle.c'),'utf8');
for(const {path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0);assert(oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-randline-width-'));let differences=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',exe]);
 for(const rough of mode==='target'?[128,255,256]:[0,1,7,127]){
  const observed=await run(rough),raw=execFileSync(exe,[String(rough)],{input:observed.rng.map(a=>a.join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split('\n').map(s=>s.split(' ').map(Number));
  const [narrowed,calls]=raw.shift(),expected={points:raw,calls};assert.equal(narrowed,rough<128?rough:rough-256);if(mode==='target'){assert.equal(calls,0);assert.equal(raw.length,11);}console.log(JSON.stringify({rough,narrowed,expected,observed}));
  if(JSON.stringify(expected.points)!==JSON.stringify(observed.points)||calls!==observed.rng.length)differences++;
 }
 console.log(JSON.stringify({mode,differences}));process.exitCode=differences?1:0;
}finally{rmSync(tmp,{recursive:true,force:true});}
