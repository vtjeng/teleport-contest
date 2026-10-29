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

async function run(fg,bg,lit,icedpools){
 resetGame();objects_globals_init(game);monst_globals_init(game);timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);
 game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='CaveFinishEvidence';
 game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),initalign:str2align('neutral'),female:true,bones:false};
 game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
 let output;
 await assert.rejects(mklev({specialLevelLoader:async des=>{
  initRng(0x5eed);if(icedpools)des.level_flags('icedpools');des.level_init({style:'mines',fg,bg,lit,smoothed:false,joined:false,walled:false});assert.equal(game.level.nroom,0);
  const terrain=[],metadata=[];
  for(let x=1;x<80;x++)for(let y=0;y<21;y++){const loc=game.level.at(x,y);terrain.push(loc.typ);metadata.push([Number(loc.lit),loc.icedpool??0]);}
  output={terrain,metadata};throw new LoaderDone();
 }}),e=>e instanceof LoaderDone);return output;
}

const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
for(const [f,h]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h,f);
const src=readFileSync('nethack-c/upstream/src/mkmap.c','utf8'),a=src.indexOf('\nfinish_map(')+1;assert(a>0);assert(readFileSync(join(p,'oracle.c'),'utf8').includes(src.slice(a,src.indexOf('\n}',a)+2)));
const tmp=mkdtempSync(join(tmpdir(),'levels-cave-finish-'));const types={'.':25,' ':0,'I':33,'L':20,'T':13};let cases=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(const [fg,bg]of mode==='target'?[['I','L'],['.','T'],['T','.']]:[['.',' '],['I',' ']])for(const lit of [0,1])for(const icedpools of [false,true]){
 const actual=await run(fg,bg,lit,icedpools);assert.equal(actual.terrain.length,1659);assert(actual.terrain.includes(types[fg])&&actual.terrain.includes(types[bg]));
 const expected=execFileSync(exe,[String(types[fg]),String(types[bg]),String(lit),String(Number(icedpools))],{input:actual.terrain.join(' ')+'\n',encoding:'utf8'}).trim().split('\n').map(s=>s.split(' ').map(Number));
 assert.equal(expected.length,actual.metadata.length);const bad=actual.metadata.findIndex((v,i)=>v[0]!==expected[i][0]||v[1]!==expected[i][1]);assert.equal(bad,-1,JSON.stringify({fg,bg,lit,icedpools,firstMismatch:bad,actual:actual.metadata[bad],expected:expected[bad]}));
 const counts={};for(let i=0;i<actual.terrain.length;i++){const key=[actual.terrain[i],...actual.metadata[i]].join('/');counts[key]=(counts[key]??0)+1;}
 console.log(JSON.stringify({fg,bg,lit,icedpools,seed:24301,cells:1659,counts,terrainSha256:createHash('sha256').update(JSON.stringify(actual.terrain)).digest('hex'),metadataSha256:createHash('sha256').update(JSON.stringify(actual.metadata)).digest('hex'),equal:true}));cases++;
}
console.log(JSON.stringify({mode,cases,equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
