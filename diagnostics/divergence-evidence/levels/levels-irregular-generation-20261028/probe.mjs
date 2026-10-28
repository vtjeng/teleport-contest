import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resetGame} from '../../../../js/gstate.js';
import {GameMap} from '../../../../js/game.js';
import {lspo_region} from '../../../../js/mklev.js';
import {ROOM,HWALL,FOUNTAIN} from '../../../../js/const.js';
const definitions=[
 {name:'diagonal',floor:[[10,10],[11,11]],end:[11,11]},
 {name:'cardinal',floor:[[10,10],[11,10]],end:[11,11]},
 {name:'gap',floor:[[10,10],[12,12]],end:[12,12]},
 {name:'beyond-far-corner',floor:[[10,10],[11,10],[12,10],[13,10]],end:[10,10]},
 {name:'full-far-corner',floor:[[10,10],[11,10],[12,10],[13,10]],end:[13,10]},
 {name:'mixed-row',floor:[[10,10],[12,10]],extras:[[11,10,FOUNTAIN]],start:[12,10],end:[12,10]},
 {name:'adjacent-wall',floor:[[10,10],[11,11]],extras:[[10,9,HWALL]],end:[11,11]},
];
const cases=definitions.flatMap(c=>[0,1].map(lit=>({...c,lit,start:c.start??[10,10]})));
const dir=dirname(fileURLToPath(import.meta.url)),tmp=mkdtempSync(join(tmpdir(),'levels-irregular-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dir,'oracle.c'),'-o',join(tmp,'oracle')]);
 const maps=cases.map(c=>{const a=Array.from({length:21},()=>Array(80).fill(0));for(const[x,y]of c.floor)a[y][x]=ROOM;for(const[x,y,t]of c.extras??[])a[y][x]=t;return a;});
 const input=cases.map((c,i)=>[...c.start,c.lit,...maps[i].flat()].join(' ')).join('\n')+'\n';
 const expected=execFileSync(join(tmp,'oracle'),[],{input,encoding:'utf8'}).trim().split('\n').map(s=>s.split(' ').map(Number));const results=[];
 for(let i=0;i<cases.length;i++){
  const c=cases[i],state=resetGame();state.level=new GameMap();state.smeq=[];state._mkmap_n_loc_filled=0;
  for(let y=0;y<21;y++)for(let x=0;x<80;x++)state.level.at(x,y).typ=maps[i][y][x];
  const frame={xstart:0,ystart:0,xsize:80,ysize:21},coder={croom:null,n_subroom:1,tmproomlist:[],failed_room:[]};
  await lspo_region([{region:[...c.start,...c.end],irregular:1,lit:c.lit}],{state,frame,coder});
  const actual=[state._mkmap_min_rx,state._mkmap_min_ry,state._mkmap_max_rx,state._mkmap_max_ry,state._mkmap_n_loc_filled];
  for(let y=0;y<21;y++)for(let x=0;x<80;x++){const l=state.level.at(x,y);actual.push(l.roomno*4+Number(l.lit)*2+Number(l.edge));}
  assert.deepEqual(actual,expected[i],JSON.stringify(c));results.push({name:c.name,lit:c.lit,bounds:actual.slice(0,4),filled:actual[4]});
 }
 const find=n=>results.find(r=>r.name===n&&r.lit===0);
 assert.equal(find('diagonal').filled,2);assert.equal(find('gap').filled,1);
 assert.deepEqual(find('beyond-far-corner').bounds,find('full-far-corner').bounds);assert.equal(find('beyond-far-corner').filled,4);
 console.log(JSON.stringify({comparisons:cases.length,matched:cases.length,results,scope:'Seven small layouts at lit=0/1; all 1680 cell room numbers/lighting/edge flags and flood bounds/counts compared'},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
