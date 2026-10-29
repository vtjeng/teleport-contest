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
async function run(name,prop){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomObstructionEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});
  des.level_flags(name);output=Number(game.level.flags[prop]);throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const names=["noteleport", "hardfloor", "nommap", "shortsighted", "arboreal", "mazelevel", "shroud", "graveyard", "corrmaze", "sokoban", "temperate", "hot", "cold", "nomongen", "nodeathdrops", "noautosearch", "fumaroles", "stormy"];const props={"noteleport": "noteleport", "hardfloor": "hardfloor", "nommap": "nommap", "shortsighted": "shortsighted", "arboreal": "arboreal", "mazelevel": "is_maze_lev", "shroud": "hero_memory", "graveyard": "graveyard", "corrmaze": "corrmaze", "sokoban": "sokoban_rules", "temperate": "temperature", "hot": "temperature", "cold": "temperature", "nomongen": "rndmongen", "nodeathdrops": "deathdrops", "noautosearch": "noautosearch", "fumaroles": "fumaroles", "stormy": "stormy"};
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const tmp=mkdtempSync(join(tmpdir(),'levels-flag-casefold-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const [i,name]of names.entries())for(const spelling of mode==='control'?[name]:[name.toUpperCase(),[...name].map((c,j)=>j%2?c:c.toUpperCase()).join('')]){
  const expected=Number(execFileSync(join(tmp,'oracle'),[String(i),spelling],{encoding:'utf8'}));const actual=await run(spelling,props[name]);assert.equal(actual,expected);results.push({spelling,field:props[name],expected,actual});
 }
 console.log(JSON.stringify({scope:'18 recognized ASCII level flag names, lowercase/uppercase/alternating case; level flag storage only.',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
