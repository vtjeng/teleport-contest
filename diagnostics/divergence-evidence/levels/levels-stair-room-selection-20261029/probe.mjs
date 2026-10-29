import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {GameMap} from '../../../../js/game.js';
import {generate_stairs_room_good} from '../../../../js/mklev.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json'))),fixtures=JSON.parse(readFileSync(join(p,'fixtures.json')));
for(const[f,h]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const src=readFileSync('js/mklev.js','utf8'),a=src.indexOf('function generate_stairs_find_room(');assert(a>0);const body=src.slice(a,src.indexOf('\n}',a)+2);
// Exact private selector extraction with real exported eligibility and its real dependencies.
const selector=new Function('game','rn2','generate_stairs_room_good',body+'; return generate_stairs_find_room;');
const tmp=mkdtempSync(join(tmpdir(),'levels-stair-room-'));let count=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(const fixture of fixtures[mode])for(let choice=0;choice<fixture.choices.length;choice++){
 const state={level:new GameMap(),stairs:null};state.level.rooms=fixture.rooms.map(([needjoining,rtype,st],i)=>{const lx=10+i*15;const room={lx,hx:lx+6,ly:5,hy:11,needjoining:Boolean(needjoining),rtype,irregular:false,roomnoidx:i};for(let x=lx;x<=lx+6;x++)for(let y=5;y<=11;y++)state.level.at(x,y).typ=25;if(st){state.stairs={sx:lx+3,sy:8,up:st===2,isladder:false,next:state.stairs,tolev:{dnum:0,dlevel:st===2?1:3}};state.level.at(lx+3,8).typ=26;}return room;});state.level.nroom=state.level.rooms.length;
 let calls=0,bound=0;const random=n=>{calls++;bound=n;assert(choice<n);return choice;};const actualRoom=selector(state,random,(r,phase)=>generate_stairs_room_good(r,phase,state))();const actual=[actualRoom?state.level.rooms.indexOf(actualRoom):-1,calls,bound];
 const input=[`${fixture.rooms.length} ${choice}`,...fixture.rooms.map(r=>r.join(' '))].join('\n')+'\n';const expected=execFileSync(exe,[],{input,encoding:'utf8'}).trim().split(' ').map(Number);assert.deepEqual(actual,expected.slice(0,3));assert.equal(actual[0],fixture.choices[choice]);assert.equal(calls,Number(fixture.rooms.length>0));assert.equal(expected[3],calls);if(calls)assert.equal(bound,fixture.choices.length);
 console.log(JSON.stringify({fixture:fixture.id,choice,actual,cAllocations:expected[3],equal:true}));count++;
}console.log(JSON.stringify({mode,count,equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
