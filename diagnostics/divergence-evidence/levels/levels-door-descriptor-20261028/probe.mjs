import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lspo_door} from '../../../../js/mklev.js';
import {GameMap} from '../../../../js/game.js';
import {ROOM,DOOR,SDOOR,STONE,HWALL,D_NODOOR,D_BROKEN,D_ISOPEN,D_CLOSED,D_LOCKED,D_SECRET} from '../../../../js/const.js';
const dir=dirname(fileURLToPath(import.meta.url)),tmp=mkdtempSync(join(tmpdir(),'levels-door-descriptor-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dir,'oracle.c'),'-o',join(tmp,'oracle')]);
 const states=[['nodoor',D_NODOOR],['broken',D_BROKEN],['open',D_ISOPEN],['closed',D_CLOSED],['locked',D_LOCKED],['secret',D_SECRET]];
 const neighborhoods=[[ROOM,ROOM,ROOM,ROOM],[STONE,ROOM,ROOM,ROOM],[HWALL,ROOM,HWALL,ROOM],[HWALL,HWALL,HWALL,HWALL]],cases=[];
 for(const old of [ROOM,DOOR,SDOOR])for(const [name,mask]of states)for(const neighbors of neighborhoods)cases.push({old,name,mask,neighbors});
 const out=execFileSync(join(tmp,'oracle'),[],{input:cases.map(c=>[c.old,c.mask,...c.neighbors].join(' ')).join('\n')+'\n',encoding:'utf8'}).trim().split('\n').map(s=>s.split(' ').map(Number));
 const state={level:new GameMap()},frame={xstart:0,ystart:0,xsize:80,ysize:21,splevMap:Array.from({length:80},()=>Array(21).fill(0))};
 for(let i=0;i<cases.length;i++){
  const c=cases[i];for(const [j,[x,y]]of [[9,10],[11,10],[10,9],[10,11]].entries())state.level.at(x,y).typ=c.neighbors[j];
  state.level.at(10,10).typ=c.old;
  lspo_door([{x:10,y:10,state:c.name}],{state,frame,coder:{croom:null},random:{rn2(){assert.fail('no RNG expected')}}});
  const cell=state.level.at(10,10);assert.deepEqual([cell.typ,cell.doormask,Number(cell.horizontal),frame.splevMap[10][10]],out[i],JSON.stringify(c));
 }
 const result=old=>out[cases.findIndex(c=>c.old===old&&c.name==='secret')][0];
 assert.equal(result(DOOR),DOOR);assert.equal(result(ROOM),SDOOR);
 console.log(JSON.stringify({comparisons:cases.length,matched:cases.length,control:{existingDoor:result(DOOR),newDoor:result(ROOM)},scope:'Three old terrain types, six explicit states, four local neighborhoods; coordinate door descriptors only'},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
