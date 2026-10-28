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
async function run(messages){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='LevelMessageBufferEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});assert.equal(game.gl?.lev_message??null,null);
  for(const message of messages)des.message(message);
  output=game.gl.lev_message;throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const fixtures=[
 {id:'embedded-nul',target:true,messages:['alpha\0omega'],expected:'alpha'},
 {id:'embedded-nul-then-append',target:true,messages:['alpha\0omega','tail'],expected:'alpha\ntail'},
 {id:'ordinary-append',target:false,messages:['alpha','tail'],expected:'alpha\ntail'},
 {id:'empty-then-append',target:false,messages:['','tail'],expected:'\ntail'},
];
const mode=process.argv[2]??'observe';assert(['observe','target','control'].includes(mode));
const tmp=mkdtempSync(join(tmpdir(),'levels-message-buffer-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);const results=[];
 for(const f of fixtures){if(mode==='target'&&!f.target||mode==='control'&&f.target)continue;
  const hex=execFileSync(join(tmp,'oracle'),f.messages.map(x=>Buffer.from(x).toString('hex')),{encoding:'utf8'}).trim();
  const expected=Buffer.from(hex,'hex').toString();assert.equal(expected,f.expected);const actual=await run(f.messages);
  results.push({...f,expectedC:expected,observedJS:actual,matched:actual===expected});
 }
 console.log(JSON.stringify({scope:'Initialization message buffer only; no rendering or player-command behavior',results},null,2));
 if(mode!=='observe')for(const r of results)assert.equal(r.observedJS,r.expectedC,r.id);
 else {assert(results.filter(x=>x.target).every(x=>!x.matched));assert(results.filter(x=>!x.target).every(x=>x.matched));}
}finally{rmSync(tmp,{recursive:true,force:true});}
