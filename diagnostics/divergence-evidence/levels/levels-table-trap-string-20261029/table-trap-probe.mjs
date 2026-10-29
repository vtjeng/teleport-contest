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
async function run(name){resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RegionNameEvidence';game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{des.level_init({style:'solidfill',fg:'.',lit:0});let error=null;try{des.trap({type:name,x:10,y:6,spider_on_web:false,victim:false});}catch(e){error=e.message;}output={error,traps:game.level.traps.map(t=>[t.tx,t.ty,t.ttyp,Number(t.tseen)])};throw new LoaderDone();}}),e=>e instanceof LoaderDone);return output;}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'table-trap-source-contract.json'))),hash=s=>createHash('sha256').update(s).digest('hex');for(const[f,h]of Object.entries(contract.sourceHashes))if(f.startsWith('nethack-c/'))assert.equal(hash(readFileSync(f)),h,f);const oracle=readFileSync(join(p,'table-trap-oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-region-name-'));let failures=0;try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'table-trap-oracle.c'),'-o',exe]);for(const name of mode==='target'?['rust\0suffix','anti magic\0suffix']:['rust','anti magic','RuSt']){const inputHex=Buffer.from(name).toString('hex');const lines=execFileSync(exe,[inputHex],{encoding:'utf8'}).trimEnd().split('\n');const expected={error:null,traps:[lines[0].split(' ').map(Number)]};const actual=await run(name);const equal=JSON.stringify(expected)===JSON.stringify(actual);console.log(JSON.stringify({inputHex,expectedC:expected,observedJS:actual,equal}));if(!equal)failures++;}console.log(JSON.stringify({mode,failures}));if(failures)process.exitCode=1;}finally{rmSync(tmp,{recursive:true,force:true});}
