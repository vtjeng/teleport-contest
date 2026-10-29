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
 await assert.rejects(mklev({specialLevelLoader:async des=>{des.level_init({style:'solidfill',fg:'.',lit:0});des.region({x1:10,y1:6,x2:14,y2:8,type:name,lit:0,filled:0});output=[game.level.nroom];for(const q of game.level.rooms.slice(0,game.level.nroom))output.push(q.rtype,q.lx,q.ly,q.hx,q.hy,q.needfill,Number(q.needjoining));throw new LoaderDone();}}),e=>e instanceof LoaderDone);return output;}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'room-source-contract.json'))),hash=s=>createHash('sha256').update(s).digest('hex');for(const[f,h]of Object.entries(contract.sourceHashes))if(f.startsWith('nethack-c/'))assert.equal(hash(readFileSync(f)),h,f);const oracle=readFileSync(join(p,'room-oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const topo=readFileSync('nethack-c/upstream/src/mklev.c','utf8');const ta=topo.indexOf('\n{',topo.indexOf('\ntopologize('));const tb=topo.slice(ta,topo.indexOf('\n}',ta)+2);assert.equal(hash(tb),contract.topologizeBodySha256);assert(oracle.includes(tb));
const tmp=mkdtempSync(join(tmpdir(),'levels-region-name-'));let failures=0;try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'room-oracle.c'),'-o',exe]);for(const name of mode==='target'?['morgue\0suffix','temple\0suffix']:['morgue','temple','ordinary']){const inputHex=Buffer.from(name).toString('hex');const lines=execFileSync(exe,[inputHex],{encoding:'utf8'}).trimEnd().split('\n');const expected=lines[0].split(' ').map(Number);const actual=await run(name);const equal=JSON.stringify(expected)===JSON.stringify(actual);console.log(JSON.stringify({inputHex,expectedC:expected,observedJS:actual,equal}));if(!equal)failures++;}console.log(JSON.stringify({mode,failures}));if(failures)process.exitCode=1;}finally{rmSync(tmp,{recursive:true,force:true});}
