import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {GameMap} from '../../../../js/game.js';
import {game,resetGame} from '../../../../js/gstate.js';
import {add_doors_to_room} from '../../../../js/mklev.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
for(const[f,h]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const bounds=[[2,28,3,17],[34,46,3,15],[52,68,4,16],[8,14,7,11]],sequences=[[0,1,2,3,0,2,1,3],[2,1,3,0,2,0,3,1],[3,2,0,1,0,1,2,3]];
const tmp=mkdtempSync(join(tmpdir(),'levels-door-list-'));let count=0,stages=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(const dense of mode==='target'?[0,1]:[0])for(const secret of mode==='target'?[0,1]:[0])for(const sequence of sequences){
 resetGame();game.level=new GameMap();game.level.doors=[];game.level.doorindex=0;
 const rooms=bounds.map(([lx,hx,ly,hy],i)=>({lx,hx,ly,hy,doorct:0,fdoor:0,irregular:false,nsubrooms:0,sbrooms:[],roomnoidx:i}));
 rooms[0].nsubrooms=1;rooms[0].sbrooms=[rooms[3]];game.level.rooms=rooms.slice(0,3);game.level.nroom=3;game.subrooms=[rooms[3]];game.nsubroom=1;
 const cells=new Map();if(mode==='target')for(const[lx,hx,ly,hy]of bounds){for(let x=lx;x<=hx;x+=dense?1:3){cells.set(`${x},${ly-1}`,[x,ly-1,secret?14:23]);cells.set(`${x},${hy+1}`,[x,hy+1,secret?14:23]);}for(const x of[lx-1,hx+1])for(const y of[ly,hy])cells.set(`${x},${y}`,[x,y,secret?14:23]);}
 for(const r of rooms)for(let x=r.lx;x<=r.hx;x++)for(let y=r.ly;y<=r.hy;y++)game.level.at(x,y).typ=25;
 for(const[x,y,t]of cells.values())game.level.at(x,y).typ=t;
 const input=[cells.size,...Array.from(cells.values(),v=>v.join(' ')),sequence.length,...sequence].join('\n')+'\n';const expected=execFileSync(exe,[],{input,encoding:'utf8'}).trim().split('\n').map(JSON.parse);let prior=null;
 sequence.forEach((idx,step)=>{add_doors_to_room(rooms[idx]);const actual={index:game.level.doorindex,rooms:rooms.map(r=>[r.fdoor,r.doorct]),doors:game.level.doors.map(d=>[d.x,d.y])};const {allocations,capacity,...want}=expected[step];assert.deepEqual(actual,want);assert.equal(capacity,allocations*20);assert(capacity>=actual.index);for(const r of rooms){assert(r.doorct>=0&&r.doorct<=127);assert(r.fdoor+r.doorct<=actual.index);const slice=actual.doors.slice(r.fdoor,r.fdoor+r.doorct);assert.equal(new Set(slice.map(x=>x.join(','))).size,slice.length);}if(step>=4)assert.deepEqual(actual,prior);prior=actual;stages++;});
 const last=expected.at(-1);if(mode==='target')assert(last.allocations>=3);else assert.equal(last.index,0);
 console.log(JSON.stringify({dense,secret,sequence,index:last.index,allocations:last.allocations,stages:sequence.length,stateSha256:createHash('sha256').update(JSON.stringify(expected)).digest('hex'),equal:true}));count++;
}console.log(JSON.stringify({mode,count,stages,equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
