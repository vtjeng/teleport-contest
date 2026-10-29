import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {get_free_room_loc,set_ok_location_func} from '../../../../js/room_coordinates.js';
import {GameMap} from '../../../../js/game.js';
import {ROOM,FOUNTAIN,SP_COORD_IS_RANDOM} from '../../../../js/const.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));set_ok_location_func(null);
const dir=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(dir,'source-contract.json')));
for(const [path,hash]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,path);
const oracle=readFileSync(join(dir,'oracle.c'),'utf8');
for(const {path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0);assert(oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-room-coordinate-retries-'));
try{
 const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(dir,'oracle.c'),'-o',exe]);const rows=[];
 for(const random of [0,1])for(const success of mode==='target'?Array.from({length:102},(_,i)=>i+1):[1,102]){
  const direct=Number(mode==='control'),state={level:new GameMap(),u:{uz:{dnum:0,dlevel:1}},water_level:{dnum:1,dlevel:1}};
  const room={lx:10,hx:14,ly:6,hy:8,irregular:false,nsubrooms:0};
  for(let x=10;x<=14;x++)for(let y=6;y<=8;y++)state.level.at(x,y).typ=ROOM;
  state.level.at(10,6).typ=direct?ROOM:FOUNTAIN;
  const tape=Array(220).fill(0);tape[(random?2:0)+2*(success-1)]=1;let calls=0;
  const randomCore=n=>{assert(calls<tape.length);const v=tape[calls++];assert(v>=0&&v<n);return v;};
  const coordinate={x:-1,y:-1};let failed=0;
  try{get_free_room_loc(coordinate,room,random?SP_COORD_IS_RANDOM:0,{state,randomCore,randomOneBased:(n,b)=>b+randomCore(n)});}catch(e){assert.match(e.message,/get_free_room_loc: can't find a place!/);failed=1;}
  const result=[failed,coordinate.x,coordinate.y,calls];
  const c=execFileSync(exe,[String(random),String(success),String(direct)],{encoding:'utf8'}).trim().split(' ').map(Number);
  assert.deepEqual(result,c);
  const expected=direct?[0,10,6,random*2]:success<=101?[0,11,6,random*2+success*2]:[1,-1,-1,random*2+202];
  assert.deepEqual(result,expected);
  rows.push({random,success,direct,result});
 }
 console.log(JSON.stringify({mode,count:rows.length,scope:'Rectangular room, no subrooms/irregularity, DRY, no objects, controlled legal draw tape; helper output and draw consumption only.'})+'\n'+rows.map(row=>JSON.stringify(row)).join('\n'));
}finally{rmSync(tmp,{recursive:true,force:true});}
