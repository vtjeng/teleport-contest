import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resetGame} from '../../../../js/gstate.js';
import {GameMap} from '../../../../js/game.js';
import {lspo_terrain} from '../../../../js/mklev.js';
import {selection_area} from '../../../../js/themerooms.js';
import {selection_match} from '../../../../js/bigrm.js';
import {l_selection_or,l_selection_sub} from '../../../../js/nhlsel.js';
import {HWALL} from '../../../../js/const.js';
const dir=dirname(fileURLToPath(import.meta.url)),tmp=mkdtempSync(join(tmpdir(),'levels-frames-'));
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dir,'oracle.c'),'-o',join(tmp,'oracle')]);
 const results=[];
 for(const [op,fn]of [['or',l_selection_or],['sub',l_selection_sub]])for(const kinds of ['ra','ar','rr','aa']){
  const state=resetGame();state.level=new GameMap();const env={state,coder:{croom:null},frame:{xstart:1,ystart:0,xsize:79,ysize:21}};
  lspo_terrain([{x:10,y:10,typ:'.'}],env);
  const build=k=>k==='r'?selection_area(10,10,10,10):selection_match('.',state);
  const a=build(kinds[0]),b=build(kinds[1]);
  assert.equal(a.numpoints(),1);assert.equal(b.numpoints(),1);
  // Each operand independently denotes exactly the same absolute map cell.
  for(const operand of [a,b]){
   const isolated={level:new GameMap()};
   lspo_terrain([operand,'-'],{...env,state:isolated});
   const painted=[];for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(isolated.level.at(x,y).typ===HWALL)painted.push([x,y]);
   assert.deepEqual(painted,[[11,10]],'constructor contract before composition');
  }
  lspo_terrain([fn(a,b),'-'],env);
  const js=[];for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(state.level.at(x,y).typ===HWALL)js.push([x,y]);
  const c=execFileSync(join(tmp,'oracle'),[op],{encoding:'utf8'}).trim().split('\n').filter(Boolean).map(s=>s.split(',').map(Number));
  results.push({op,constructors:kinds,control:kinds[0]===kinds[1],cPainted:c,jsPainted:js,matched:JSON.stringify(c)===JSON.stringify(js)});
 }
 assert.ok(results.filter(r=>r.control).every(r=>r.matched));
 console.log(JSON.stringify({scope:'Composition of supported selection constructors and operators, consumed by terrain API',results},null,2));
 if(process.argv.includes('--assert-target'))assert.ok(results.every(r=>r.matched),'mixed-frame selection composition differs from C');
 else if(!process.argv.includes('--control'))assert.ok(results.filter(r=>!r.control).every(r=>!r.matched));
}finally{rmSync(tmp,{recursive:true,force:true});}
