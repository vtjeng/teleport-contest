import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resetGame } from '../../../../js/gstate.js';
import { GameMap } from '../../../../js/game.js';
import { lspo_level_init } from '../../../../js/mklev.js';
import { initRng, enableRngLog, getRngLog } from '../../../../js/rng.js';
const src=readFileSync(new URL('../../../../nethack-c/upstream/src/sp_lev.c',import.meta.url),'utf8');
function body(name){const start=src.indexOf('\n'+name+'(');let end=src.indexOf('{',start)+1,d=1;while(d){const ch=src[end++];if(ch==='{')d++;if(ch==='}')d--;}return src.slice(start+1,end);}
const dir=mkdtempSync(join(tmpdir(),'levels-swamp-oracle-'));
try {
 writeFileSync(join(dir,'oracle.c'),`#include <stdio.h>
#include <stdlib.h>
typedef signed char schar;
#define COLNO 80
#define ROWNO 21
#define min(a,b) ((a)<(b)?(a):(b))
struct {int x_maze_max;} gx={78};struct {int y_maze_max;} gy={20};
struct {int typ,lit,flags,horizontal,roomno,edge;} levl[80][21];
int calls=0;
int rn2(int n){int v;if(n!=3||scanf("%d",&v)!=1||v<0||v>=n)exit(3);calls++;return v;}
int set_levltyp_lit(int x,int y,int typ,int lit){levl[x][y].typ=typ;levl[x][y].lit=lit;return 1;}
void ${body('lvlfill_solid')}
void ${body('lvlfill_swamp')}
int main(int argc,char **argv){if(argc!=2)return 2;lvlfill_swamp(25,17,atoi(argv[1]));if(calls!=380)return 4;
for(int x=0;x<80;x++)for(int y=0;y<21;y++){putchar('A'+levl[x][y].typ);putchar('0'+levl[x][y].lit);}return 0;}
`);
 const cc=spawnSync('clang',['-std=c99','-O0',join(dir,'oracle.c'),'-o',join(dir,'oracle')],{encoding:'utf8'});assert.equal(cc.status,0,cc.stderr);
 const results=[];
 for(const seed of [28103301,28103302])for(const lit of [0,1]){
  const state=resetGame();state.level=new GameMap();state.u={uz:{dnum:0,dlevel:1}};initRng(seed);enableRngLog();
  lspo_level_init([{style:'swamp',lit}],{state,coder:{},frame:{xMazeMax:78,yMazeMax:20}});
  const draws=getRngLog().map(s=>{const m=s.match(/^rn2\(3\)=(\d)$/);assert.ok(m,s);return Number(m[1]);});assert.equal(draws.length,380);
  const oracle=spawnSync(join(dir,'oracle'),[String(lit)],{input:draws.join(' '),encoding:'utf8'});assert.equal(oracle.status,0,oracle.stderr);
  let observed='';for(let x=0;x<80;x++)for(let y=0;y<21;y++){const loc=state.level.at(x,y);observed+=String.fromCharCode(65+loc.typ)+Number(Boolean(loc.lit));}
  assert.equal(observed,oracle.stdout);
  for(let y=0;y<=18;y+=2){assert.equal(state.level.at(78,y).typ,25);assert.equal(state.level.at(79,y).typ,0);}
  results.push({seed,lit,rngCalls:draws.length,terrainAndLightSha256:createHash('sha256').update(observed).digest('hex')});
 }
 console.log(JSON.stringify({exactMatches:4,results},null,2));
}finally{rmSync(dir,{recursive:true,force:true});}
