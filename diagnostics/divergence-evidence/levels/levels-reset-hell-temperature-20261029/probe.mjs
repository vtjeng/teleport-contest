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
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
// C provenance is immutable; JS hashes are recorded, not enforced, so Main can run the target after repair.
for(const[f,h]of Object.entries(contract.sourceHashes))if(f.startsWith('nethack-c/'))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-reset-temp-'));let count=0,mismatches=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(const depth of [1,2,3])for(const initial of [-1,0,1]){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='ResetTemperatureEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 const hell=Number(mode==='target'),dnum=hell?game.dungeons.findIndex(d=>d.flags.hellish):0;assert(dnum>=0);assert.equal(Number(Boolean(game.dungeons[dnum].flags.hellish)),hell);assert(game.dungeons[dnum].num_dunlevs>=depth);game.u.uz={dnum,dlevel:depth};let actual,before;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  assert.equal(game.level.flags.temperature,hell);assert.equal(game.level.monlist,null);assert.equal(game.stairs,null);
  des.level_flags(['cold','temperate','hot'][initial+1]);before=game.level.flags.temperature;assert.equal(before,initial);
  await des.reset_level();actual=game.level.flags.temperature;assert(game.iflags.lua_testing);assert(game.in_mklev);throw new LoaderDone();
 }}),LoaderDone);
 const expected=Number(execFileSync(exe,[dnum,hell,depth,initial].map(String),{encoding:'utf8'}).trim());assert.equal(expected,hell);const equal=actual===expected;if(!equal)mismatches++;
 console.log(JSON.stringify({dnum,dungeon:game.dungeons[dnum].dname,depth,initial,before,expected,actual,equal}));count++;
}console.log(JSON.stringify({mode,count,mismatches}));process.exitCode=mismatches?1:0;
}finally{rmSync(tmp,{recursive:true,force:true});}
