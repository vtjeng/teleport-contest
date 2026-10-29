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

async function run(path,form,text){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='OptionStringEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});assert.equal(game.u.uz.dnum,0);assert.equal(game.u.uz.dlevel,1);assert.equal(game.level.at(14,10).typ,25);assert(!game.stairs);
  let accepted=true;
  try{if(path===0){if(form)des.door(text,13,10);else des.door({x:13,y:10,state:text});}
   else if(path===1){if(form)des.ladder(text,13,10);else des.ladder({x:13,y:10,dir:text});}
   else{if(form)des.feature(text,13,10);else des.feature({x:13,y:10,type:text});}
  }catch(e){assert(e instanceof Error);accepted=false;}
  let count=0;for(let t=game.stairs;t;t=t.next){assert.equal(t.sx,14);assert.equal(t.sy,10);assert.equal(t.isladder,true);assert.equal(t.up,false);assert.deepEqual(t.tolev,{dnum:0,dlevel:2});count++;}
  const loc=game.level.at(14,10);output=[Number(accepted),loc.typ,loc.doormask??0,loc.ladder??0,Number(loc.horizontal??0),des.frame.splevMap[14][10],count];throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}


const mode=process.argv[2]??'target',only=process.argv[3];assert(['target','control'].includes(mode));const names=['door','ladder','feature'];if(only)assert(names.includes(only));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
for(const [f,h]of Object.entries(contract.cSourceHashes))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h,f);
assert.equal(createHash('sha256').update(readFileSync(join(p,'lua-checkoption.inc'))).digest('hex'),contract.lua.packagedSnippetSha256);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const [file,names]of [['sp_lev.c',['lspo_door','sel_set_door','set_door_orientation','lspo_ladder','l_create_stairway','lspo_feature','sel_set_feature','l_table_getset_feature_flag']],['nhlua.c',['get_table_option','nhl_get_xy_params']],['stairs.c',['stairway_add']]]){const src=readFileSync('nethack-c/upstream/src/'+file,'utf8');for(const n of names){const a=src.indexOf('\n'+n+'(')+1;assert(a>0&&oracle.includes(src.slice(a,src.indexOf('\n}',a)+2)),n);}}
const tmp=mkdtempSync(join(tmpdir(),'levels-option-string-'));let cases=0,differences=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(let path=0;path<3;path++){if(only&&names[path]!==only)continue;const base=['closed','down','tree'][path];for(const form of [0,1])for(const text of mode==='target'?[base+'\0suffix',base+'\0']:[base,base+'x','\0'+base]){
 const hex=Buffer.from(text).toString('hex'),expected=execFileSync(exe,[String(path),String(form),hex],{encoding:'utf8'}).trim().split(' ').map(Number),actual=await run(path,form,text);
 const accepts=mode==='target'||text===base,want=accepts?[[1,23,4,0,0,1,0],[1,27,0,2,0,1,1],[1,13,0,0,0,0,0]][path]:[0,25,0,0,0,0,0];assert.deepEqual(expected,want);
 const equal=JSON.stringify(expected)===JSON.stringify(actual);if(!equal)differences++;console.log(JSON.stringify({path:names[path],form:form?'positional':'table',hex,expected,actual,equal}));cases++;
}}
console.log(JSON.stringify({mode,only:only??'all',cases,differences}));process.exitCode=differences?1:0;
}finally{rmSync(tmp,{recursive:true,force:true});}
