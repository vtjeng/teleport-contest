import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GameMap} from '../../../../js/game.js';
import {m_avoid_soko_push_loc} from '../../../../js/monmove.js';
import {CONFLICT,W_RINGL} from '../../../../js/const.js';
import {BOULDER} from '../../../../js/objects.js';
const root=new URL('../../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
function cFunction(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a);return source.slice(a,b);
}
test('C sgn call and JS Math.sign preserve cardinal Sokoban avoidance and gates',()=>{
 const c=read('nethack-c/upstream/src/monmove.c');
 const body=cFunction(c,'boolean\nm_avoid_soko_push_loc(','/* max distmin()');
 const lib=read('nethack-c/upstream/src/hacklib.c');
 const sign=cFunction(lib,'int\nsgn(int n)','/* distance between two points');
 // The wrapper models one floor boulder and the exact scalar fields read by
 // the unmodified C predicate. It is not a C gameplay recording.
 const code=`#include <stdio.h>\n#include <stdlib.h>\ntypedef int boolean; typedef int coordxy;
#define TRUE 1
#define FALSE 0
#define BOULDER 1
#define Sokoban sokoban
#define Conflict conflict
struct monst {int mpeaceful,mtame,mconf,mstun;};
struct {int ux,uy;}u;
int sokoban,conflict,bx,by;
int dist2(int x,int y,int a,int b){return (x-a)*(x-a)+(y-b)*(y-b);}
int sobj_at(int t,int x,int y){return t==BOULDER&&x==bx&&y==by;}
${sign}\n${body}
int main(int argc,char **v){if(argc!=13)return 2; struct monst m={atoi(v[7]),atoi(v[8]),atoi(v[9]),atoi(v[10])};u.ux=atoi(v[3]);u.uy=atoi(v[4]);bx=atoi(v[5]);by=atoi(v[6]);sokoban=atoi(v[11]);conflict=atoi(v[12]);printf("%d\\n",m_avoid_soko_push_loc(&m,atoi(v[1]),atoi(v[2])));return 0;}`;
 const dir=mkdtempSync(join(tmpdir(),'soko-sign-oracle-'));
 try{
  writeFileSync(join(dir,'oracle.c'),code);
  execFileSync(process.env.CC??'cc',['-std=c99','-Wall','-Wextra',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
  const scenarios=[
   ...[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({label:`cardinal ${dx},${dy}`,x:10+2*dx,y:10+2*dy,bx:10+dx,by:10+dy,want:true})),
   {label:'diagonal',x:12,y:12,bx:11,by:11,want:false},
   {label:'wrong boulder square',bx:9,want:false},
   {label:'not Sokoban',sokoban:false,want:false},
   {label:'hostile',peaceful:0,want:false},
   {label:'tame',peaceful:0,tame:10,want:true},
   {label:'confused',conf:1,want:false},
   {label:'stunned',stun:1,want:false},
   {label:'conflict',conflict:1,want:false},
  ];
  for(const row of scenarios){
   const v={x:12,y:10,bx:11,by:10,peaceful:1,tame:0,conf:0,stun:0,sokoban:true,conflict:0,...row};
   const level=new GameMap();level.flags.sokoban_rules=v.sokoban;
   level.objects[v.bx][v.by]={otyp:BOULDER,nexthere:null};
   const state={level,u:{ux:10,uy:10,uprops:[]}};
   state.u.uprops[CONFLICT]={intrinsic:0,extrinsic:v.conflict?W_RINGL:0,blocked:0};
   const mon={mpeaceful:v.peaceful,mtame:v.tame,mconf:v.conf,mstun:v.stun};
   const args=[v.x,v.y,10,10,v.bx,v.by,v.peaceful,v.tame,v.conf,v.stun,+v.sokoban,v.conflict].map(String);
   const expected=execFileSync(join(dir,'oracle'),args,{encoding:'utf8'}).trim()==='1';
   const actual=m_avoid_soko_push_loc(mon,v.x,v.y,state);
   assert.equal(expected,v.want,row.label+' C');assert.equal(actual,expected,row.label+' JS');
   console.log(JSON.stringify({case:row.label,c:expected,js:actual}));
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
