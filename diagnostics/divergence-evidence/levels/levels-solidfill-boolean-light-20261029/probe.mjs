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
async function run(fg,lit){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='BooleanLightEvidence';game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg,lit});output=[];for(let x=2;x<=78;x++)for(let y=0;y<=20;y++){const cell=game.level.at(x,y);output.push([cell.typ,Number(cell.lit)]);}throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json'))),hash=s=>createHash('sha256').update(s).digest('hex');
// C oracle stays pinned; JS hashes are provenance, permitting the same target after repair.
for(const[f,h]of Object.entries(contract.sourceHashes))if(f.startsWith('nethack-c/'))assert.equal(hash(readFileSync(f)),h,f);const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-boolean-light-'));let count=0,failures=0;
try{const executables=[false,true].map(sanity=>{const exe=join(tmp,sanity?'sanity':'normal');execFileSync(process.env.CC??'clang',['-std=c11','-O2',...(sanity?['-DEXTRA_SANITY_CHECKS']:[]),join(p,'oracle.c'),'-o',exe]);return exe;});
for(const fg of ['.','#','I','L'])for(const lit of ['yes','true','false','no',false,true,0,1]){
 const target=lit==='yes'&&fg!=='L';if((mode==='target')!==target)continue;const kind=typeof lit==='string'?4:typeof lit==='boolean'?1:3;const args=[String(kind),typeof lit==='boolean'?String(Number(lit)):String(lit),fg];
 const results=executables.map(exe=>{const lines=execFileSync(exe,args,{encoding:'utf8'}).trim().split('\n');return {header:lines.shift().split(' ').map(Number),cells:lines.map(s=>s.split(' ').map(Number))};});assert.deepEqual(results[0].cells,results[1].cells);assert.equal(results[0].header[1],0);assert.equal(results[1].header[1],results[0].header[0]>1?1617:0);
 const expected=results[0].cells,actual=await run(fg,lit);assert.equal(actual.length,1617);const mismatches=actual.filter((v,i)=>JSON.stringify(v)!==JSON.stringify(expected[i])).length;
 console.log(JSON.stringify({fg,lit,parsedC:results[0].header[0],cells:1617,expectedC:expected[0],observedJS:actual[0],mismatches,cSanityDiagnostics:results[1].header[1],expectedSha256:hash(JSON.stringify(expected)),observedSha256:hash(JSON.stringify(actual))}));count++;if(mismatches)failures++;
}console.log(JSON.stringify({mode,count,failures}));if(failures)process.exitCode=1;
}finally{rmSync(tmp,{recursive:true,force:true});}
