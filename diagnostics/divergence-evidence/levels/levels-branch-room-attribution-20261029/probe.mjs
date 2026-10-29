import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {GameMap} from '../../../../js/game.js';
import {place_branch} from '../../../../js/mklev.js';
import {game,resetGame} from '../../../../js/gstate.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
const hash=s=>createHash('sha256').update(s).digest('hex');
for(const[f,h]of Object.entries(contract.sourceHashes))assert.equal(hash(readFileSync(f)),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-branch-attribution-'));const fixtures=[],actual=[],lookups=[];
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(const layout of [0,1,2,3])for(const typ of [24,25,35])for(const end of [0,1])for(const type of [0,1,2])for(const up of [0,1])for(const stop of mode==='target'?[0]:[1,2]){
 resetGame();game.level=new GameMap();game.iflags={debug_overwrite_stairs:false,debug_fuzzer:false};game.stairs=null;game.made_branch=stop===1;const b={end1:{dnum:0,dlevel:2},end2:{dnum:1,dlevel:1},type,end1_up:Boolean(up)};game.u={uz:end?b.end2:b.end1,ucamefrom:{dnum:0,dlevel:0}};
 game.level.nroom=layout?1:0;game.level.rooms=layout?[{lx:10,ly:6,hx:14,hy:10,irregular:layout>=2}]:[];const loc=game.level.at(12,8);loc.typ=typ;loc.roomno=layout>=2?3:0;loc.edge=layout===3;loc.ladder=0;place_branch(stop===2?null:b,12,8);
 const row=[Number(game.made_branch),loc.typ,loc.ladder];if(game.stairs){const s=game.stairs;assert.equal(s.next,null);row.push(s.sx,s.sy,Number(s.up),Number(s.isladder),s.tolev.dnum,s.tolev.dlevel,Number(Boolean(s.u_traversed)));}actual.push(row);fixtures.push([layout,typ,end,type,up,stop]);
}
const input=fixtures.map(a=>a.join(' ')).join('\n')+'\n';const rows=execFileSync(exe,[],{input,encoding:'utf8'}).trim().split('\n').map(l=>l.split(' ').map(Number));assert.equal(rows.length,actual.length);for(let i=0;i<rows.length;i++){const lookup=rows[i].shift();assert.equal(lookup,[1,2].includes(fixtures[i][0])?0:-1);lookups.push(lookup);assert.deepEqual(actual[i],rows[i],JSON.stringify(fixtures[i]));}
console.log(JSON.stringify({mode,cases:actual.length,roomFound:lookups.filter(x=>x===0).length,noRoom:lookups.filter(x=>x===-1).length,stairs:actual.filter(a=>a.length>3).length,inputSha256:hash(input),observationsSha256:hash(JSON.stringify(actual)),equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
