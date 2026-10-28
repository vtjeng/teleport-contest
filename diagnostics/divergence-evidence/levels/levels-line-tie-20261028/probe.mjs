import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resetGame} from '../../../../js/gstate.js';
import {GameMap} from '../../../../js/game.js';
import {lspo_terrain} from '../../../../js/mklev.js';
import {HWALL} from '../../../../js/const.js';
import {selection_line,selection_match} from '../../../../js/bigrm.js';
const dir=dirname(fileURLToPath(import.meta.url)),tmp=mkdtempSync(join(tmpdir(),'levels-selection-api-'));
function envFor(state){return {state,coder:{croom:null},frame:{xstart:1,ystart:0,xsize:79,ysize:21}};}
function points(state){const a=[];for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(state.level.at(x,y).typ===HWALL)a.push([x,y]);return a;}
function oracle(args){return execFileSync(join(tmp,'oracle'),args.map(String),{encoding:'utf8'}).trim().split('\n').filter(Boolean).map(s=>s.split(',').map(Number));}
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dir,'oracle.c'),'-o',join(tmp,'oracle')]);
 const results=[];

 for(const [name,args,control] of [
 ['shallow-tie',[10,10,12,11],false],['steep-tie',[10,10,11,12],false],['reverse-tie',[12,11,10,10],false],
 ['horizontal',[10,10,12,10],true],['vertical',[10,10,10,12],true],['diagonal',[10,10,12,12],true]]){
  const state=resetGame();state.level=new GameMap();const env=envFor(state);
  const selected=selection_line(...args);lspo_terrain([selected,'-'],env);
  const expected=oracle(args),observed=points(state);
  results.push({name,args,control,cPainted:expected,jsPainted:observed,matched:JSON.stringify(expected)===JSON.stringify(observed)});
 }

 assert.ok(results.filter(r=>r.control).every(r=>r.matched),'controls must match');
 console.log(JSON.stringify({scope:'Supported selection API consumed by production terrain API; shipped exposure unknown',results},null,2));
 if(process.argv.includes('--assert-target'))assert.ok(results.every(r=>r.matched),'target differs from executed C');
 else if(!process.argv.includes('--control'))assert.ok(results.filter(r=>!r.control).every(r=>!r.matched),'recorded target differences');
}finally{rmSync(tmp,{recursive:true,force:true});}
