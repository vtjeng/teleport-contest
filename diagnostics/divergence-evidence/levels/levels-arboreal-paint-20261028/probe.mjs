import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resetGame} from '../../../../js/gstate.js';
import {GameMap} from '../../../../js/game.js';
import {lspo_terrain,lspo_replace_terrain} from '../../../../js/mklev.js';
import {initRng} from '../../../../js/rng.js';
import {SDOOR,HWALL,D_LOCKED} from '../../../../js/const.js';
const tmp=mkdtempSync(join(tmpdir(),'levels-paint-'));
try {
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const c=execFileSync(join(tmp,'oracle'),[],{encoding:'utf8'}).trim().split('\n').map(s=>s.split(' ').map(Number));
 const names=['terrain-air-target','replace-air-control','terrain-secret-control'];const results=[];
 for(let mode=0;mode<3;mode++){
  const state=resetGame();state.level=new GameMap();initRng(28104300);
  Object.assign(state.level.at(10,10),{typ:SDOOR,flags:D_LOCKED,doormask:D_LOCKED,horizontal:false,candig:false});
  state.level.at(9,10).typ=HWALL;
  const env={state,coder:{croom:null},frame:{xstart:0,ystart:0,xsize:80,ysize:21}};
  if(mode===1)lspo_replace_terrain([{region:[10,10,10,10],fromterrain:'S',toterrain:'A',chance:100}],env);
  else lspo_terrain([{x:10,y:10,typ:mode===2?'S':'A'}],env);
  const l=state.level.at(10,10),js=[l.typ,l.doormask,Number(l.horizontal),Number(l.candig)];
  results.push({name:names[mode],c:c[mode],js,matched:JSON.stringify(c[mode])===JSON.stringify(js)});
 }
 assert.deepEqual(results.map(r=>r.matched),[false,true,true]);
 console.log(JSON.stringify({fields:['typ','doormask','horizontal','arboreal_sdoor'],results,scope:'Constructed API fixtures; shipped target reachability unresolved'},null,2));
 if(process.argv.includes('--assert-target'))assert.deepEqual(results[0].js,results[0].c);
}finally{rmSync(tmp,{recursive:true,force:true});}
