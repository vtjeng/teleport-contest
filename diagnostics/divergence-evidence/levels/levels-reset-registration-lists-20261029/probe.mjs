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
for(const[f,h]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const linked=head=>{let n=0;for(let p=head;p;p=p.next){assert(n<10);n++;}return n;};
const tmp=mkdtempSync(join(tmpdir(),'levels-reset-lists-'));let cases=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(const mask of mode==='target'?[1,2,3,4,5,6,7]:[0])for(const count of [1,2,5]){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='ResetListsEvidence';game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);const snapshots=[];
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  des.level_init({style:'solidfill',fg:'.',lit:0});assert.equal(game.level.monlist,null);
  for(let i=0;i<count;i++){
   if(mask&1)des.gas_cloud({x:20+i*3,y:10,damage:0,ttl:10});
   if(mask&2)des.ladder({x:3+i*2,y:4,dir:'down'});
   if(mask&4)des.exclusion({region:[30+i,4,31+i,5],type:'teleport'});
  }
  assert.equal(game.level.regions.length,mask&1?count:0);assert.equal(linked(game.stairs),mask&2?count:0);assert.equal(linked(game.exclusion_zones),mask&4?count:0);
  for(let repeat=0;repeat<2;repeat++){await des.reset_level();snapshots.push([game.level.regions.length,game.level.max_regions,Number(game.level.regions.length>0),Number(game.stairs!==null),Number(game.exclusion_zones!==null)]);}
  throw new LoaderDone();
 }}),LoaderDone);
 const expected=execFileSync(exe,[mask,count].map(String),{encoding:'utf8'}).trim().split('\n').map(l=>l.split(' ').map(Number));assert.deepEqual(snapshots,expected);assert.deepEqual(snapshots,[[0,0,0,0,0],[0,0,0,0,0]]);console.log(JSON.stringify({mask,count,snapshots,equal:true}));cases++;
}console.log(JSON.stringify({mode,cases,resets:cases*2,equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
