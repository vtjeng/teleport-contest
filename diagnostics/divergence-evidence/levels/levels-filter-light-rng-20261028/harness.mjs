import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resetGame} from '../../../../js/gstate.js';
import {GameMap} from '../../../../js/game.js';
import {lspo_terrain} from '../../../../js/mklev.js';
import {selection_new} from '../../../../js/themerooms.js';
import {l_selection_setpoint} from '../../../../js/nhlsel.js';
import {ROOM} from '../../../../js/const.js';
export function run(family){
 const tmp=mkdtempSync(join(tmpdir(),'levels-filter-rng-'));
 try{
  execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
  const results=[];
  const cases=family==='light'?[[-1,false],[-2,false],[0,false],[1,false],[-1,true]]:[[0,false],[50,false],[100,false],[100,true]];
  for(const [value,empty]of cases){
   const state=resetGame();state.level=new GameMap();const env={state,coder:{croom:null},frame:{xstart:1,ystart:0,xsize:79,ysize:21}};
   const sel=selection_new();
   for(let x=10;x<=11;x++)for(let y=10;y<=11;y++){
    lspo_terrain([{x:x-1,y,typ:x===11&&y===10?'-':'.',lit:Number(x===11&&y===11)}],env);
    if(!empty)l_selection_setpoint([sel,x-1,y],env);
   }
   const calls=[],values=family==='light'?[1,0,1]:[49,50,0,99];
   const random=n=>{calls.push(n);const v=values.shift();assert.ok(v>=0&&v<n);return v;};
   const out=family==='light'?sel.filter_mapchar(ROOM,(x,y)=>state.level.at(x,y),{lit:value,random}):sel.percentage(value,random);
   const points=[];for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(out.get(x,y))points.push([x,y]);
   const raw=execFileSync(join(tmp,'oracle'),[family==='light'?'0':'1',String(value),String(Number(empty))],{encoding:'utf8'}).trim().split('\n');
   const cCalls=raw.shift().split(' ').slice(1).map(Number),cPoints=raw.filter(Boolean).map(s=>s.split(',').map(Number));
   assert.deepEqual({points,calls},{points:cPoints,calls:cCalls});
   assert.equal(sel.numpoints(),empty?0:4,'filter must not mutate input');
   results.push({value,empty,points,calls,matched:true});
  }
  if(family==='light'){
   assert.deepEqual(results[0].points,[[10,10],[11,11]]);assert.deepEqual(results[0].calls,[2,2,2]);
   assert.deepEqual(results[2].points,[[10,10],[10,11]]);assert.deepEqual(results[3].points,[[11,11]]);
  }else{
   assert.deepEqual(results[0].points,[]);assert.equal(results[2].points.length,4);
   assert.deepEqual(results[0].calls,[100,100,100,100]);assert.deepEqual(results[2].calls,[100,100,100,100]);
  }
  console.log(JSON.stringify({family,scope:'Finite supported filter inputs with deterministic bounded RNG stream',results},null,2));
 }finally{rmSync(tmp,{recursive:true,force:true});}
}
