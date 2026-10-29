import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {init_rect,free_rect,get_rect,split_rects,remove_rect,rnd_rect,get_rect_cnt} from '../../../../js/rect.js';
import {initRng,enableRngLog,getRngLog} from '../../../../js/rng.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
function setup(layout){free_rect();init_rect();if(layout===1||layout===2){const a={lx:10,ly:5,hx:20,hy:12};split_rects(get_rect(a),a);}if(layout===2){const b={lx:35,ly:5,hx:45,hy:12};split_rects(get_rect(b),b);}if(layout===3)remove_rect(get_rect({lx:0,ly:0,hx:79,hy:20}));}
const tmp=mkdtempSync(join(tmpdir(),'levels-rndrect-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 for(const layout of mode==='target'?[1,2]:[0,3]){
  setup(layout);const count=get_rect_cnt();
  for(let selected=0;selected<Math.max(1,count);selected++){
   let calls=0;const chosen=rnd_rect(n=>{assert.equal(n,count);calls++;return selected;});
   const actual=[count,calls,...(chosen?[chosen.lx,chosen.ly,chosen.hx,chosen.hy]:[])];
   const expected=execFileSync(join(tmp,'oracle'),[String(layout),String(selected)],{encoding:'utf8'}).trim().split(/\s+/).map(Number);
   assert.deepEqual(actual,expected);assert.equal(calls,count?1:0);assert.equal(get_rect_cnt(),count);
   results.push({layout,selected,actual,matched:true});
  }
  for(const seed of [28105301,28105302]){
   setup(layout);initRng(seed);enableRngLog();const chosen=rnd_rect();const tape=getRngLog();assert.equal(tape.length,count?1:0);
   let selected=0;if(count){const m=/^rn2\((\d+)\)=(\d+)$/.exec(tape[0]);assert(m);assert.equal(+m[1],count);selected=+m[2];}
   const actual=[count,tape.length,...(chosen?[chosen.lx,chosen.ly,chosen.hx,chosen.hy]:[])];
   const expected=execFileSync(join(tmp,'oracle'),[String(layout),String(selected)],{encoding:'utf8'}).trim().split(/\s+/).map(Number);assert.deepEqual(actual,expected);
   results.push({layout,seed,tape,actual,matched:true});
  }
 }
 console.log(JSON.stringify({scope:'Four reachable allocator states; exhaustive valid indices plus two JS RNG seeds per state. C shares checked RNG results; not independent RNG equivalence.',results},null,2));
}finally{free_rect();rmSync(tmp,{recursive:true,force:true});}
