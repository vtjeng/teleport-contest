// Actual C function text, compiled in a point-storage/RNG adapter. This checks
// the helper at equal coordinates and equal RNG draws; it does not claim that
// all Lua-to-map coordinate conversions or whole levels are equivalent.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {selection_randline} from '../../../../js/quest_levels.js';
import {initRng,enableRngLog,getRngLog} from '../../../../js/rng.js';
const source=readFileSync('nethack-c/upstream/src/selvar.c','utf8');
const start=source.indexOf('void\nselection_do_randline(');
assert.ok(start>=0);
const body=source.slice(start,source.indexOf('\n}\n',start)+3);
const temp=mkdtempSync(join(tmpdir(),'levels-randline-'));
const harness=`#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
typedef int coordxy;
typedef signed char schar;
#define COLNO 80
#define ROWNO 21
#define max(a,b) ((a)>(b)?(a):(b))
struct selectionvar { int p[80][21]; };
int selection_getpoint(int x,int y,struct selectionvar*s){return x<0||x>=80||y<0||y>=21?0:s->p[x][y];}
void selection_setpoint(int x,int y,struct selectionvar*s,int v){if(x>=0&&x<80&&y>=0&&y<21)s->p[x][y]=v;}
int rn2(int n){int bound,value;assert(scanf("%d %d",&bound,&value)==2);assert(bound==n&&value>=0&&value<n);return value;}
${body}
int main(int argc,char**argv){assert(argc==6);struct selectionvar s={0};selection_do_randline(atoi(argv[1]),atoi(argv[2]),atoi(argv[3]),atoi(argv[4]),atoi(argv[5]),12,&s);int extra;assert(scanf("%d",&extra)==EOF);for(int x=0;x<80;x++)for(int y=0;y<21;y++)if(s.p[x][y])printf("%d,%d\\n",x,y);}
`;
writeFileSync(join(temp,'oracle.c'),harness);
execFileSync('clang',['-std=c99','-Wall','-Wextra',join(temp,'oracle.c'),'-o',join(temp,'oracle')]);
const results=[];
for(const [label,args,seed] of [
 ['odd-midpoint',[10,10,13,11,0],7],
 ['even-midpoint-control',[10,10,14,12,0],7],
 ['degenerate-control',[10,10,10,10,7],7],
 ['bar-start-coordinates',[37,7,62,2,7],28103001],
 ['bar-start-variation',[37,7,62,2,7],28103002],
]){
 initRng(seed);enableRngLog();const sel=selection_randline(...args);const draws=getRngLog();
 const input=draws.map(entry=>{const m=/^rn2\((\d+)\)=(\d+)$/.exec(entry);assert.ok(m,entry);return `${m[1]} ${m[2]}\n`;}).join('');
 const cText=execFileSync(join(temp,'oracle'),args.map(String),{encoding:'utf8',input}).trim();
 const c=cText?cText.split('\n').map(line=>line.split(',').map(Number)):[];
 const js=[];for(let x=0;x<80;x++)for(let y=0;y<21;y++)if(sel.get(x,y))js.push([x,y]);
 assert.deepEqual(js,c,label);results.push({label,args,seed,cPoints:c,jsPoints:js,rng:draws,passed:true});
}
console.log(JSON.stringify({scope:'C integer midpoint and roughness arithmetic; direct helper with equal coordinates and checked RNG bounds/count',results},null,2));
