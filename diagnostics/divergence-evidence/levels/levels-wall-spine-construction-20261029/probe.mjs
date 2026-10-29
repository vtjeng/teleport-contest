import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {GameMap} from '../../../../js/game.js';
import {fix_wall_spines,wallification} from '../../../../js/mklev.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
const hash=s=>createHash('sha256').update(s).digest('hex');
for(const[f,h]of Object.entries(contract.sourceHashes))assert.equal(hash(readFileSync(f)),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-wall-spine-'));const fixtures=[],actual=[];const map=new GameMap(),state={level:map};let protectedCases=0,edgeCases=0;
const centers=mode==='target'?[1,2,3,4,5,6,7,8,9,10,11]:[0,1,2,7,11,12,14,20,21,22,23,24,25,33];
const places=[[12,9],[1,0],[1,20],[79,0],[79,20],[1,10],[79,10],[30,0],[30,20]];
// Complete ternary neighborhood at one interior point; binary type variants at eight boundaries.
const neighborhoods=[];for(let mask=0;mask<6561;mask++){let n=mask;const a=[];for(let i=0;i<8;i++){a.push([0,2,25][n%3]);n=Math.floor(n/3);}neighborhoods.push([mask,a]);}
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(const [place,[x,y]]of places.entries())for(const protect of [0,1])for(const center of centers){
 const variants=place===0?neighborhoods:Array.from({length:256},(_,mask)=>[mask,Array.from({length:8},(_,i)=>(mask>>i)&1?2:25)]);
 for(const[mask,types]of variants){for(let dx=-1,i=0;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(dx||dy){if(x+dx>=0&&x+dx<80&&y+dy>=0&&y+dy<21)map.at(x+dx,y+dy).typ=types[i];i++;}
 map.at(x,y).typ=center;state.bughack={inarea:protect?{x1:x,y1:y,x2:x,y2:y}:{x1:0,y1:0,x2:0,y2:0}};
 const kind=mode==='target'?0:1;(kind?wallification:fix_wall_spines)(x,y,x,y,state);actual.push(map.at(x,y).typ);fixtures.push([kind,x,y,center,protect,mask,...types]);protectedCases+=protect;edgeCases+=Number(place>0);
 }
}
const input=fixtures.map(a=>a.join(' ')).join('\n')+'\n';const expected=execFileSync(exe,[],{input,encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n').map(Number);assert.equal(expected.length,actual.length);for(let i=0;i<actual.length;i++)assert.equal(actual[i],expected[i],JSON.stringify(fixtures[i]));
console.log(JSON.stringify({mode,cases:actual.length,protectedCases,edgeCases,inputSha256:hash(input),observationSha256:hash(JSON.stringify(actual)),changed:actual.filter((v,i)=>v!==fixtures[i][3]).length,equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
