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
async function run(f){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='MazeDeadendEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);


 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:' ',lit:0});
  if(f.corrmaze)des.level_flags('corrmaze');
  initRng(f.seed);enableRngLog();
  des.level_init({style:'maze',corrwid:f.width,wallthick:f.wall,deadends:!f.remove,lit:0});
  const cells=[];for(let y=0;y<21;y++)for(let x=0;x<80;x++)cells.push(game.level.at(x,y).typ);
  const tape=getRngLog().map(line=>{const m=/^rn2\((\d+)\)=(\d+)$/.exec(line);assert(m,line);return [+m[1],+m[2]];});
  assert.deepEqual([des.frame.xMazeMax,des.frame.yMazeMax],[78,20]);output={cells,tape};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const tmp=mkdtempSync(join(tmpdir(),'levels-maze-deadends-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const results=[];
 for(const seed of [28105001,28105002])for(const corrmaze of [false,true])for(const [width,wall] of [[1,1],[2,1]])for(const remove of [false,true]){
  const f={seed,corrmaze,width,wall,remove},actual=await run(f);
  const raw=execFileSync(join(tmp,'oracle'),[+corrmaze,width,wall,+remove].map(String),{input:actual.tape.map(x=>x.join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split(/\s+/).map(Number);
  assert.equal(raw.shift(),actual.tape.length);assert.deepEqual(raw,actual.cells);
  results.push({...f,draws:actual.tape.length,cells:actual.cells,matched:true});
 }
 for(let i=0;i<results.length;i+=2){assert.notDeepEqual(results[i].cells,results[i+1].cells);assert(results[i+1].draws>results[i].draws);}
 console.log(JSON.stringify({scope:'16 full terrain maps under checked shared draw tapes; no independent ISAAC proof',results}));
}finally{rmSync(tmp,{recursive:true,force:true});}
