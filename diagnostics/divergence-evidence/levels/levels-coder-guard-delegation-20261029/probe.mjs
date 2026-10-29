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
import {ROOM} from '../../../../js/const.js';
class LoaderDone extends Error {}
import {createHash} from 'node:crypto';
async function run(mutate){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='CoderGuardEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  const take=()=>[Number(game.level.flags.rndmongen),Number(game.level.flags.deathdrops),game.level.flags.temperature];
  assert.deepEqual(take(),[1,1,0]);const stages=[];
  if(mutate){des.level_flags('nomongen','nodeathdrops','cold');stages.push({api:'level_flags',flags:take()});
   des.level_init({style:'solidfill',fg:'.',lit:0});stages.push({api:'level_init',flags:take()});
   des.terrain({x:1,y:1,typ:'.',lit:0});stages.push({api:'terrain',flags:take()});
   des.wall_property({region:[0,0,1,1],property:'nondiggable'});stages.push({api:'wall_property',flags:take()});
   des.exclusion({region:[0,0,1,1],type:'teleport'});stages.push({api:'exclusion',flags:take()});
   des.teleport_region({region:[0,0,1,1]});stages.push({api:'teleport_region',flags:take()});
   for(const s of stages)assert.deepEqual(s.flags,[0,0,-1]);
  }else stages.push({api:'fresh-loader',flags:take()});
  output=stages;throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const dir=dirname(fileURLToPath(import.meta.url));const contract=JSON.parse(readFileSync(join(dir,'source-contract.json')));
for(const [path,hash]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,path);
const c=readFileSync('nethack-c/upstream/src/sp_lev.c','utf8');const body=n=>{const a=c.indexOf('\n'+n+'(')+1;assert(a>0);return c.slice(a,c.indexOf('\n}',a)+2);};
for(const n of contract.cWrappers)assert(body(n).includes('create_des_coder();'));
const load=body('load_special');assert(load.indexOf('create_des_coder();')<load.indexOf('load_lua('));
const j=readFileSync('js/mklev.js','utf8'),start=j.indexOf('function createSpecialLevelApi('),end=j.indexOf('\n}',start),api=j.slice(start,end+2);assert(start>=0&&api.includes('const coder = create_des_coder(state, frame);'));assert(api.indexOf('const coder = create_des_coder')<api.indexOf('const des = l_register_des'));assert(api.includes('        coder,')&&api.includes('        frame,'));
const tmp=mkdtempSync(join(tmpdir(),'levels-coder-guard-'));try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(dir,'oracle.c'),'-o',exe]);const oracle=execFileSync(exe,[mode],{encoding:'utf8'}).trim();const results=[];if(mode==='target')results.push(await run(true));else{results.push(await run(false));results.push(await run(false));}console.log(JSON.stringify({mode,oracle,results,scope:'Guard lifecycle and three level flags only;no broad API or initialization-content parity claim.'},null,2));}finally{rmSync(tmp,{recursive:true,force:true});}
