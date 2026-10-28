import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
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

async function run(form,text){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='EngravingPrefixEvidence';game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});assert(!game.head_engr);
  if(form)des.engraving([2,2],'engrave',text);else des.engraving({x:2,y:2,type:'engrave',text});
  const e=game.head_engr;assert(e&&!e.nxt_engr);output={x:e.engr_x,y:e.engr_y,type:e.engr_type,time:e.engr_time,size:e.engr_szeach,allocation:e.engr_alloc,guardobjects:Number(e.guardobjects),nowipeout:Number(e.nowipeout),textHex:e.engr_txt.map(t=>Buffer.from(t,'utf8').toString('hex'))};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const tmp=mkdtempSync(join(tmpdir(),'levels-engraving-prefix-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const form of [0,1])for(const text of mode==='target'?['alpha\0omega']:['alpha','','café']){
  const inputHex=Buffer.from(text,'utf8').toString('hex');const expected=JSON.parse(execFileSync(join(tmp,'oracle'),[String(form),inputHex],{encoding:'utf8'}));const actual=await run(form,text);results.push({form,inputHex,expected,actual,matched:JSON.stringify(expected)===JSON.stringify(actual)});
 }
 console.log(JSON.stringify({scope:'Level-construction engraving text/storage only; no player engraving commands, rendering or effects.',results},null,2));for(const r of results)if(!r.matched)process.exitCode=1;
}finally{rmSync(tmp,{recursive:true,force:true});}
