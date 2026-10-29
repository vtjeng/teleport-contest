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
import {get_rect} from '../../../../js/rect.js';
async function run(type,fields,value){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomObstructionEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});const spec={type,x:10,y:7};if(value!==undefined)for(const field of fields)spec[field]=value;enableRngLog();des.feature(spec);assert.deepEqual(getRngLog(),[]);output=game.level.at(11,7).flags;throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const values=[undefined,true,false,0,1,'true','false','yes','no'];const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const tmp=mkdtempSync(join(tmpdir(),'levels-feature-reader-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const [type,fields]of [['fountain',['looted','warned']],['throne',['looted']],['tree',['looted','swarm']]])for(const [i,value]of values.entries()){
  const control=i===1||i===2;if((mode==='control')!==control)continue;const expected=Number(execFileSync(join(tmp,'oracle'),[String(i),String(fields.length)],{encoding:'utf8'}));const actual=await run(type,fields,value);assert.equal(actual,expected);results.push({type,fields,value:i===0?'absent':value,expected,actual,rngCalls:0});
 }
 console.log(JSON.stringify({scope:'27 fresh feature initializations: three feature types × nine valid optional boolean representations. Exact C readers and flag helper; no runtime.',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
