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
async function run(fg,bg,lit,smooth,seed){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='CavePipelineEvidence';game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  initRng(seed);enableRngLog();des.level_init({style:'mines',fg,bg,lit,smoothed:smooth,joined:false,walled:false});const log=[...getRngLog()];assert.equal(game.level.nroom,0);assert.equal(game.level.monlist,null);const cells=[];for(let x=0;x<80;x++)for(let y=0;y<21;y++){const loc=game.level.at(x,y);cells.push([loc.typ,Number(loc.lit),loc.roomno,loc.icedpool??0]);}output={log,cells};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json'))),hash=s=>createHash('sha256').update(s).digest('hex');
for(const[f,h]of Object.entries(contract.sourceHashes))assert.equal(hash(readFileSync(f)),h,f);const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-cave-pipeline-'));let count=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);const types={'.':25,' ':0,'#':24,'T':13,'I':33,'W':18};
for(const [fg,bg] of [['.',' '],['#','T'],['I','W']])for(const lit of [0,1])for(const seed of [3,19,43,101]){
 const smooth=mode==='target';const actual=await run(fg,bg,lit,smooth,seed);const tape=actual.log.map(line=>{const m=/^(rn2|rnd)\((\d+)\)=(\d+)$/.exec(line);assert(m,line);return [Number(m[1]==='rnd'),Number(m[2]),Number(m[3])];});assert(tape.length>1248);for(let i=0;i<tape.length;i++)assert.deepEqual(tape[i].slice(0,2),i%2?[1,19]:[0,77]);
 const raw=execFileSync(exe,[types[fg],types[bg],lit,Number(smooth),tape.length].map(String),{input:tape.map(v=>v.join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split('\n');assert.equal(Number(raw.shift()),tape.length);const expected=raw.map(v=>v.split(' ').map(Number));assert.deepEqual(actual.cells,expected,JSON.stringify({fg,bg,lit,smooth,seed}));
 console.log(JSON.stringify({fg,bg,lit,smooth,seed,cells:actual.cells.length,rngCalls:tape.length,tapeSha256:hash(JSON.stringify(tape)),cellsSha256:hash(JSON.stringify(actual.cells)),equal:true}));count++;
}console.log(JSON.stringify({mode,count,equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
