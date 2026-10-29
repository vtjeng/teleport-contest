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
 await assert.rejects(mklev({specialLevelLoader:async des=>{des.level_init({style:'solidfill',fg:'.',lit:0});des.levregion({region:[1,1,4,4],region_islev:true,type:'portal',padding:2,name});assert.equal(game.lregions.length,1);const q=game.lregions[0];output={fields:[q.rtype,q.padding,q.inarea.x1,q.inarea.y1,q.inarea.x2,q.inarea.y2],nameHex:Buffer.from(q.rname).toString('hex')};throw new LoaderDone();}}),e=>e instanceof LoaderDone);return output;}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json'))),hash=s=>createHash('sha256').update(s).digest('hex');for(const[f,h]of Object.entries(contract.sourceHashes))if(f.startsWith('nethack-c/'))assert.equal(hash(readFileSync(f)),h,f);const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-region-name-'));let failures=0;try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);for(const name of mode==='target'?['oracle\0suffix','medusa\0suffix']:['oracle','medusa','3']){const inputHex=Buffer.from(name).toString('hex');const lines=execFileSync(exe,[inputHex],{encoding:'utf8'}).trimEnd().split('\n');const expected={fields:lines[0].split(' ').map(Number),nameHex:lines[1]??''};const actual=await run(name);const equal=JSON.stringify(expected)===JSON.stringify(actual);console.log(JSON.stringify({inputHex,expectedC:expected,observedJS:actual,equal}));if(!equal)failures++;}console.log(JSON.stringify({mode,failures}));if(failures)process.exitCode=1;}finally{rmSync(tmp,{recursive:true,force:true});}
