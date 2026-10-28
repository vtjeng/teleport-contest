import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {game,resetGame} from '../../../../js/gstate.js';
import {init_rect,free_rect,get_rect,split_rects,get_rect_ind} from '../../../../js/rect.js';
const tmp=mkdtempSync(join(tmpdir(),'levels-rect-order-'));
const tuple=r=>[r.lx,r.ly,r.hx,r.hy];
const object=([lx,ly,hx,hy])=>({lx,ly,hx,hy});
const snapshot=()=>game.nhrect.slice(0,game.rect_cnt).map(tuple);
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const cases=JSON.parse(readFileSync(new URL('./allocations.json',import.meta.url),'utf8')).cases;
 const results=[];
 for(const cuts of cases){
  resetGame();init_rect();const actual=[snapshot()];
  for(const values of cuts){
   const cut=object(values),parent=get_rect(cut);assert.ok(parent);
   assert.equal(get_rect_ind({...parent}),get_rect_ind(parent),'coordinate lookup must accept a value copy');
   split_rects(parent,cut);actual.push(snapshot());
   assert.equal(get_rect(cut),null,'allocated rectangle is no longer free');
  }
  const raw=execFileSync(join(tmp,'oracle'),cuts.flat().map(String),{encoding:'utf8'}).trim().split('\n');
  const expected=raw.map(line=>line.split(' ').slice(1).map(s=>s.split(',').map(Number)));
  assert.deepEqual(actual,expected);
  results.push({cuts,snapshots:actual,matched:true});
  free_rect();assert.equal(game.rect_cnt,0);
 }
 console.log(JSON.stringify({scope:'Eight deterministic valid allocation sequences; exact rectangle-array order after each split',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
