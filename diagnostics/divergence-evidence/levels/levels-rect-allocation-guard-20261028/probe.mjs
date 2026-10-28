import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {init_rect,free_rect} from '../../../../js/rect.js';
import {game,resetGame} from '../../../../js/gstate.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const tmp=mkdtempSync(join(tmpdir(),'levels-rect-alloc-'));const results=[];
try{
 for(const monitor of [false,true]){
  const exe=join(tmp,monitor?'monitor':'plain');execFileSync(process.env.CC??'clang',['-std=c11','-O2',...(monitor?['-DMONITOR_HEAP']:[]),join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',exe]);const raw=execFileSync(exe,[mode],{encoding:'utf8'}).trim();
  if(mode==='target'){assert.equal(raw,`${monitor?'nhalloc':'alloc'} stopped before init_rect null guard`);results.push({monitor,observed:raw});continue;}
  const rows=raw.split('\n').map(s=>s.split(' ').map(Number));assert.deepEqual(rows.map(r=>r.slice(0,2)),[[1,0],[1,0],[2,1]]);
  resetGame();const actual=[];const take=()=>actual.push([game.n_rects,game.rect_cnt,game.nhrect[0].lx,game.nhrect[0].ly,game.nhrect[0].hx,game.nhrect[0].hy]);
  init_rect();const first=game.nhrect;take();init_rect();assert.equal(game.nhrect,first);take();free_rect();assert.equal(game.nhrect,null);assert.equal(game.n_rects,0);assert.equal(game.rect_cnt,0);init_rect();assert.notEqual(game.nhrect,first);take();free_rect();assert.deepEqual(actual,rows.map(r=>r.slice(2)));results.push({monitor,c:rows,js:actual});
 }
 console.log(JSON.stringify({scope:'Nonreturning allocator contract in two compile configurations; deterministic malloc adapter, no actual OOM. Success controls compare init/reinit/free/reinit.',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
