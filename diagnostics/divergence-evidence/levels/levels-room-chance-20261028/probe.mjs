import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resetGame} from '../../../../js/gstate.js';
import {GameMap} from '../../../../js/game.js';
import {lspo_region,lspo_room} from '../../../../js/mklev.js';
import {OROOM,VAULT} from '../../../../js/const.js';
const tmp=mkdtempSync(join(tmpdir(),'levels-room-chance-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const results=[];
 for(const [chance,draw]of [[0,99],[1,0],[1,1],[50,49],[50,50],[100,99]]){
  const state=resetGame();state.level=new GameMap();state.smeq=[];
  const calls=[],random={rn2:n=>{calls.push(n);assert.equal(n,100);return draw;},rnd:n=>{throw Error('unexpected rnd');}};
  const coder={croom:null,n_subroom:1,tmproomlist:[],failed_room:[]};
  const env={state,coder,random,frame:{xstart:1,ystart:0,xsize:79,ysize:21}};
  await lspo_region([{region:[10,5,22,15],arrival_room:true,lit:1,contents:()=>lspo_room([{x:3,y:3,w:3,h:3,type:'vault',chance,lit:1,filled:0}],env)}],env);
  const room=state.subrooms[0];assert.equal(state.nsubroom,1);assert.ok(room);
  const raw=execFileSync(join(tmp,'oracle'),[String(chance),String(draw)],{encoding:'utf8'}).trim().split(' ').map(Number);
  assert.deepEqual([room.rtype,calls.length,...calls],raw);
  assert.equal(room.rtype,chance===0||draw<chance?VAULT:OROOM);
  results.push({chance,draw,created:true,rtype:room.rtype,calls,matched:true});
 }
 assert.deepEqual(results[0].calls,[]);assert.equal(results[0].rtype,VAULT);
 console.log(JSON.stringify({scope:'Six room-type/chance decisions with explicit valid subroom geometry; not full generation equivalence',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
