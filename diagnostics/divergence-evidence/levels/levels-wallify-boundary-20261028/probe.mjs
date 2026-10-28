import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
const root = new URL('../../../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const c = read('nethack-c/upstream/src/sp_lev.c'), js = read('js/mklev.js'), rm = read('nethack-c/upstream/include/rm.h');
function body(text, marker) {
 const start=text.indexOf(marker);assert.ok(start>=0);let end=text.indexOf('{',start)+1,depth=1;
 while(depth){const ch=text[end++];if(ch==='{')depth++;if(ch==='}')depth--;}
 return text.slice(start,end);
}
const dir=mkdtempSync(join(tmpdir(),'levels-wallify-proof-'));
try {
 writeFileSync(join(dir,'oracle.c'),`#include <stdio.h>
typedef int coordxy;
#define COLNO 80
#define ROWNO 21
#define max(a,b) ((a)>(b)?(a):(b))
#define min(a,b) ((a)<(b)?(a):(b))
${rm.match(/enum levl_typ_types \{[\s\S]*?\n\};/)[0]}
${rm.match(/^#define IS_ROOM.*$/m)[0]}
struct { int typ; } levl[80][21];
void ${body(c,'wallify_map(coordxy')}
int main(void) {
 for(int x=0;x<80;x++) for(int y=0;y<21;y++) levl[x][y].typ=getchar()=='1'?ROOM:STONE;
 wallify_map(10,5,12,7);
 for(int x=0;x<80;x++) for(int y=0;y<21;y++) putchar('A'+levl[x][y].typ);
 return 0;
}`);
 const cc=spawnSync('clang',['-std=c99','-O0',join(dir,'oracle.c'),'-o',join(dir,'oracle')],{encoding:'utf8'});assert.equal(cc.status,0,cc.stderr);
 const ctx=vm.createContext({COLNO:80,ROWNO:21,STONE:0,HWALL:2,VWALL:1,CROSSWALL:7,IS_ROOM:t=>t>=25});
 vm.runInContext(body(js,'function wallify_map('),ctx);
 const results=[];
 for(const [side,x,y] of [['left',9,6],['right',13,6],['top',11,4],['bottom',11,8]]) {
  const input=new Array(1680).fill('0');input[x*21+y]='1';
  const oracle=spawnSync(join(dir,'oracle'),[],{input:input.join(''),encoding:'utf8'});assert.equal(oracle.status,0,oracle.stderr);
  const cells=input.map(bit=>({typ:bit==='1'?25:0}));
  ctx.wallify_map(10,5,12,7,{level:{at:(xx,yy)=>cells[xx*21+yy]}});
  assert.equal(cells.map(loc=>String.fromCharCode(65+loc.typ)).join(''),oracle.stdout);
  const walls=[];cells.forEach((loc,i)=>{if(loc.typ===1||loc.typ===2) walls.push([Math.trunc(i/21),i%21,loc.typ]);});
  assert.equal(walls.length,side==='left'||side==='top'?3:0);
  results.push({side,sourceFloor:[x,y],walls});
 }
 console.log(JSON.stringify({outcome:'explained negative within four boundary arrangements',exactMatches:4,results},null,2));
} finally {rmSync(dir,{recursive:true,force:true});}
