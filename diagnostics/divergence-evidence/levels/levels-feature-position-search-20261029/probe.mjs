import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {GameMap} from '../../../../js/game.js';
import {find_okay_roompos} from '../../../../js/room_features.js';
import {somexyspace} from '../../../../js/mklev.js';
import {IS_DOOR,SDOOR,DOOR,ROOM,FOUNTAIN} from '../../../../js/const.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
for(const[f,h]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const {path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
// Private predicate is copied verbatim for dependency injection, not exported or rewritten.
// The production find_okay_roompos and somexyspace functions execute directly.
const src=readFileSync('js/mklev.js','utf8'),start=src.indexOf('function bydoor('),bydoorSource=src.slice(start,src.indexOf('\n}',start)+2);assert(start>0);
const makeBydoor=new Function('game','isok','IS_DOOR','SDOOR',bydoorSource+'; return bydoor;');
const tmp=mkdtempSync(join(tmpdir(),'levels-feature-search-'));let count=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(let side=0;side<4;side++)for(const secret of mode==='target'?[0,1]:[0])for(const success of mode==='target'?[1,2,50,199,200,201]:[201])for(const setup of mode==='target'?[0]:[1,2]){
 const xy=[[10,6,9,6],[14,10,15,10],[10,6,10,5],[14,10,14,11]][side];
 const state={level:new GameMap(),u:{uz:{dnum:0,dlevel:1}}},room={lx:10,hx:14,ly:6,hy:10,irregular:false,nsubrooms:0};
 for(let x=10;x<=14;x++)for(let y=6;y<=10;y++)state.level.at(x,y).typ=setup===2?FOUNTAIN:ROOM;
 if(setup===0)state.level.at(xy[2],xy[3]).typ=secret?SDOOR:DOOR;
 const tape=Array.from({length:1000},(_,i)=>i%2?xy[1]-6:xy[0]-10);tape[2*(success-1)]=2;tape[2*(success-1)+1]=2;let calls=0,attempts=0,doorChecks=0;
 const randomCore=n=>{assert(calls<tape.length);const v=tape[calls++];assert(v>=0&&v<n);return v;};
 const pred=makeBydoor(state,(x,y)=>x>0&&x<80&&y>=0&&y<21,IS_DOOR,SDOOR);
 const env={state,randomCore,randomOneBased:(n,b)=>b+randomCore(n),hooks:{somexyspace:(r,c,e)=>{attempts++;return somexyspace(r,c,e);},bydoor:(x,y)=>{doorChecks++;return pred(x,y);}}};
 const coordinate={x:-1,y:-1};const result=[Number(find_okay_roompos(room,coordinate,env)),coordinate.x,coordinate.y,calls];
 const expected=execFileSync(exe,[side,secret,success,setup].map(String),{encoding:'utf8'}).trim().split(' ').map(Number);assert.deepEqual(result,expected);
 if(setup===0){assert.equal(attempts,Math.min(success,200));assert.equal(doorChecks,attempts);assert.equal(result[0],Number(success<=200));assert.equal(calls,attempts*2);}else if(setup===1){assert.equal(attempts,1);assert.equal(doorChecks,1);assert.equal(result[0],1);assert.equal(calls,2);}else{assert.equal(attempts,1);assert.equal(doorChecks,0);assert.equal(result[0],0);assert.equal(calls,202);}
 console.log(JSON.stringify({side,secret,success,setup,result,attempts,doorChecks,equal:true}));count++;
}console.log(JSON.stringify({mode,count,equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
