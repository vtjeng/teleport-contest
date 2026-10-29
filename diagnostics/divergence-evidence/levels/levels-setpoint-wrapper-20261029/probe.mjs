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
import {selection_new} from '../../../../js/themerooms.js';
import {l_selection_setpoint} from '../../../../js/nhlsel.js';
class LoaderDone extends Error {}

async function run(form,value,frame,point){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='SetpointEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});if(frame)des.map({x:10,y:6,map:'.......\n.......\n.......\n.......\n.......'});
  assert.equal(des.frame.xstart,frame?10:1);assert.equal(des.frame.ystart,frame?6:0);assert.equal(game.level.nroom,0);
  const x=point?4:2,y=point?3:2,prior=form===2?null:selection_new().set(35,17,1);
  const args=form===2?[x,y]:form===3?[prior,x,y]:[prior,x,y,value];
  const result=l_selection_setpoint(args,{state:game,frame:des.frame,coder:{croom:null}});
  assert.equal(result.absolute,true);if(prior)assert.equal(result,prior);
  output={bytes:Buffer.from(result.points),bounds:result.bounds()};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}


const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
for(const [f,h]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const [file,names]of [['nhlsel.c',['l_selection_setpoint']],['selvar.c',['selection_new','selection_free','selection_getbounds','selection_recalc_bounds','selection_getpoint','selection_setpoint']]]){const src=readFileSync('nethack-c/upstream/src/'+file,'utf8');for(const n of names){const a=src.indexOf('\n'+n+'(')+1;assert(a>0);assert(oracle.includes(src.slice(a,src.indexOf('\n}',a)+2)),n);}}
const tmp=mkdtempSync(join(tmpdir(),'levels-setpoint-'));let cases=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(const form of mode==='target'?[4]:[2,3])for(const value of mode==='target'?[0,1,2,7,126]:[1])for(const frame of [0,1])for(const point of [0,1]){
 const actual=await run(form,value,frame,point),raw=execFileSync(exe,[form,value,frame,point,Number(form!==2)].map(String),{encoding:'utf8'}).trim().split(' '),expected=Buffer.from(raw[0],'hex');assert.equal(expected.length,1680);assert.deepEqual(actual.bytes,expected);assert.deepEqual(Object.values(actual.bounds),raw.slice(1).map(Number));console.log(JSON.stringify({form,value,frame,point,anchor:form!==2,bounds:actual.bounds,bytesSha256:createHash('sha256').update(expected).digest('hex'),equal:true}));cases++;
}console.log(JSON.stringify({mode,cases,equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
