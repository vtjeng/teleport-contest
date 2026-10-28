import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resetGame} from '../../../../js/gstate.js';
import {GameMap} from '../../../../js/game.js';
import {lspo_region,lspo_terrain,lspo_door,search_door} from '../../../../js/mklev.js';
import {W_NORTH,W_SOUTH,W_EAST,W_WEST} from '../../../../js/const.js';
const tmp=mkdtempSync(join(tmpdir(),'levels-door-order-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const results=[];
 for(const mixed of [false,true]){
  const state=resetGame();state.level=new GameMap();state.smeq=[];
  const env={state,coder:{croom:null,n_subroom:1,tmproomlist:[],failed_room:[]},frame:{xstart:1,ystart:0,xsize:79,ysize:21,splevMap:Array.from({length:80},()=>new Uint8Array(21))}};
  for(let x=10;x<=18;x++)for(let y=4;y<=12;y++)lspo_terrain([{x:x-1,y,typ:y===4||y===12?'-':x===10||x===18?'|':'.'}],env);
  await lspo_region([{region:[10,5,16,11],arrival_room:true,lit:1}],env);
  const room=state.level.rooms[0];assert.deepEqual([room.lx,room.ly,room.hx,room.hy],[11,5,17,11]);
  for(let i=0;i<3;i++)for(const [x,y]of [[11+i*3,4],[11+i*3,12],[10,5+i*3],[18,5+i*3]]){
   lspo_door([{x:x-1,y,state:mixed&&i===1?'secret':'closed'}],env);
   assert.equal(state.level.at(x,y).typ,mixed&&i===1?14:23);
  }
  for(const [wall,name]of [[W_NORTH,'north'],[W_SOUTH,'south'],[W_EAST,'east'],[W_WEST,'west']])for(let index=0;index<4;index++){
   const raw=execFileSync(join(tmp,'oracle'),[String(wall),String(index),String(Number(mixed))],{encoding:'utf8'}).trim();
   const expected=raw==='none'?null:raw.split(',').map(Number),got=search_door(room,wall,index,state),actual=got?[got.x,got.y]:null;
   assert.deepEqual(actual,expected);
   assert.equal(actual===null,index===3);
   results.push({mixed,wall:name,index,point:actual,matched:true});
  }
 }
 console.log(JSON.stringify({scope:'Two layouts, four walls, indices0..3:32 searches; no corridor-carving claim',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
