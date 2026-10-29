import assert from 'node:assert/strict';
import {ALTAR} from '../../../../js/const.js';
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
async function run(role,alignment,nonco,seed){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='RoomObstructionEvidence';
 game.flags={initrole:str2role(role),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align(alignment),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);




 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});const original=game.u.ualignbase[0];assert.equal(original,{lawful:1,neutral:0,chaotic:-1}[alignment]);initRng(seed);enableRngLog();des.altar({x:10,y:7,type:'altar',align:nonco?'noncoaligned':'coaligned'});assert(!game.level.monlist);const tape=getRngLog().map(line=>{const m=/^rn2\((\d+)\)=(\d+)$/.exec(line);assert(m,line);return [+m[1],+m[2]];});const loc=game.level.at(11,7);assert.equal(loc.typ,ALTAR);output={original,mask:loc.flags,tape};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const nonco=mode==='target';const tmp=mkdtempSync(join(tmpdir(),'levels-altar-align-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const [role,alignment]of [['Knight','lawful'],['Tourist','neutral'],['Barbarian','chaotic']])for(const seed of [28105701,28105702]){
  const actual=await run(role,alignment,nonco,seed);const expected=execFileSync(join(tmp,'oracle'),[String(actual.original),nonco?'1':'0'],{input:actual.tape.map(x=>x.join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split(' ').map(Number);assert.deepEqual([actual.mask,actual.tape.length],expected);assert(nonco?[2,3].includes(actual.tape.length):actual.tape.length===0);results.push({role,alignment,nonco,seed,...actual,matched:true});
 }
 console.log(JSON.stringify({scope:'Three valid original alignments, two JS seeds, coaligned/noncoaligned public altar initialization; exact C macro evaluation and shared RNG tape. No priests or runtime.',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
