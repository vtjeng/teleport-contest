import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resetGame} from '../../../../js/gstate.js';
import {GameMap} from '../../../../js/game.js';
import {lspo_terrain,lspo_level_flags,lspo_non_diggable,lspo_non_passwall,lspo_wall_property} from '../../../../js/mklev.js';
import {selection_area} from '../../../../js/themerooms.js';
const fixtures=[['stone',' ',0],['wall','-',2],['tree','T',13],['bars','F',22],['secret-door','S',14],['secret-corridor','H',15],['door','+',23],['floor','.',25],['pool','P',16]];
const tmp=mkdtempSync(join(tmpdir(),'levels-wall-properties-'));
try {
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const results=[];
 for(const arboreal of [false,true])for(const form of ['selection','rectangle','whole-map'])for(const [name,typ,expectedType] of fixtures){
  const state=resetGame();state.level=new GameMap();
  const env={state,coder:{croom:null},frame:{xstart:1,ystart:0,xsize:79,ysize:21}};
  lspo_terrain([{x:10,y:10,typ}],env);lspo_terrain([{x:20,y:10,typ:'-'}],env);
  if(arboreal)lspo_level_flags(['arboreal'],env);
  const cell=state.level.at(11,10);assert.equal(cell.typ,expectedType);assert.equal(cell.wall_info,0);
  const priorDoor=cell.doormask;
  const expected=execFileSync(join(tmp,'oracle'),[String(expectedType),String(Number(arboreal))],{encoding:'utf8'}).trim().split(' ').map(Number);
  const actual=[];
  for(const [index,property,api]of [[0,'nondiggable',lspo_non_diggable],[1,'nonpasswall',lspo_non_passwall]]){
   if(form==='rectangle')lspo_wall_property([{region:[10,10,10,10],property}],env);
   else api(form==='selection'?[selection_area(10,10,10,10)]:[],env);
   actual.push(cell.wall_info);
   assert.equal(cell.typ,expectedType);assert.equal(cell.doormask,priorDoor);
   assert.equal(state.level.at(21,10).wall_info,form==='whole-map'?(index===0?8:24):0);
  }
  assert.deepEqual(actual,expected);
  assert.deepEqual(actual,[0,2,13,22].includes(expectedType)?[8,24]:[0,0]);
  results.push({arboreal,form,terrain:name,propertyBits:actual,matched:true});
 }
 console.log(JSON.stringify({scope:'54 fixtures, two cumulative property stages each; nine terrain types only',results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
