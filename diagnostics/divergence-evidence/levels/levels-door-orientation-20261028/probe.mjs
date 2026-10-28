import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lspo_door} from '../../../../js/mklev.js';
import {GameMap} from '../../../../js/game.js';
import {STONE,HWALL,DOOR,SDOOR,TREE,IRONBARS,ROOM,POOL} from '../../../../js/const.js';
const dir=dirname(fileURLToPath(import.meta.url)),tmp=mkdtempSync(join(tmpdir(),'levels-orientation-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dir,'oracle.c'),'-o',join(tmp,'oracle')]);
 const types=[STONE,HWALL,DOOR,SDOOR,TREE,IRONBARS,ROOM,POOL],cases=[];
 for(const x of [1,10])for(const l of types)for(const r of types)for(const u of types)for(const d of types)cases.push({x,y:10,l,r,u,d});
 const output=execFileSync(join(tmp,'oracle'),[],{input:cases.map(c=>Object.values(c).join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:1e6}).trim().split('\n').map(Number);
 assert.equal(output.length,cases.length);
 const state={level:new GameMap()},frame={xstart:0,ystart:0,xsize:80,ysize:21,splevMap:Array.from({length:80},()=>Array(21).fill(0))};
 const env={state,frame,coder:{croom:null},random:{rn2(){assert.fail('explicit doors must not draw RNG');}}};
 let comparisons=0;
 for(let i=0;i<cases.length;i++)for(const doorState of ['closed','secret']){
  const {x,y,l,r,u,d}=cases[i];
  for(const [cx,cy,typ] of [[x-1,y,l],[x+1,y,r],[x,y-1,u],[x,y+1,d],[x,y,ROOM]])state.level.at(cx,cy).typ=typ;
  lspo_door([{x,y,state:doorState}],env);
  assert.equal(Number(state.level.at(x,y).horizontal),output[i],JSON.stringify({i,doorState,...cases[i]}));comparisons++;
 }
 const value=(l,r,u,d)=>output[cases.findIndex(c=>c.x===10&&c.l===l&&c.r===r&&c.u===u&&c.d===d)];
 assert.equal(value(STONE,ROOM,ROOM,ROOM),1); // implicit-wall fallback
 assert.equal(value(STONE,ROOM,HWALL,ROOM),0); // one real wall disables fallback
 console.log(JSON.stringify({comparisons,matched:comparisons,neighborhoods:cases.length,types,positions:[[1,10],[10,10]],control:{implicitStoneOnly:1,explicitUpperWall:0},scope:'Eight representative terrain types in four cardinal neighbors; closed/secret coordinate doors only; no universal map-generation claim'},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
