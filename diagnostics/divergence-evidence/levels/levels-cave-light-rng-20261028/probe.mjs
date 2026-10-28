import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
const root = new URL('../../../../', import.meta.url);
const c = readFileSync(new URL('nethack-c/upstream/src/mkmap.c', root), 'utf8');
const js = readFileSync(new URL('js/mklev.js', root), 'utf8');
const cBody = c.match(/litstate_rnd\(int litstate\)\n\{[\s\S]*?\n\}/)[0];
const jsBody = js.match(/function litstate_rnd\([\s\S]*?\n\}/)[0];
const dir = mkdtempSync(join(tmpdir(), 'levels-light-proof-'));
try {
    writeFileSync(join(dir, 'oracle.c'), `#include <stdio.h>
#include <stdlib.h>
typedef int boolean;
#define TRUE 1
#define FALSE 0
struct { int uz; } u;
int a,b,n1,n2,bound1,bound2;
int depth(int *z) { return *z; }
int rnd(int n) { n1++; bound1=n; return a; }
int rn2(int n) { n2++; bound2=n; return b; }
boolean ${cBody}
int main(int argc,char **argv) {
 if(argc!=5) return 2;
 int lit=atoi(argv[1]);u.uz=atoi(argv[2]);a=atoi(argv[3]);b=atoi(argv[4]);
 int result=litstate_rnd(lit);
 printf("[%d,%d,%d,%d,%d]",result,n1,n2,bound1,bound2);return 0;
}`);
    const cc=spawnSync('clang',['-std=c99','-O0',join(dir,'oracle.c'),'-o',join(dir,'oracle')],{encoding:'utf8'});
    assert.equal(cc.status,0,cc.stderr);
    const scenarios=[[0,1,1,1],[1,1,1,1],[-1,1,1,0],[-1,1,2,76],[-1,20,10,1],[-1,20,11,1],[-1,-20,21,1]];
    const results=[];
    for(const [lit,d,a,b] of scenarios) {
        const trace=[0,0,0,0];
        const ctx=vm.createContext({game:{u:{uz:d}},depth:z=>z,
            rnd:n=>{trace[0]++;trace[2]=n;return a;},
            rn2:n=>{trace[1]++;trace[3]=n;return b;}});
        vm.runInContext(jsBody,ctx);
        const actual=[Number(ctx.litstate_rnd(lit)),...trace];
        const oracle=spawnSync(join(dir,'oracle'),[lit,d,a,b].map(String),{encoding:'utf8'});
        assert.equal(oracle.status,0,oracle.stderr);
        assert.deepEqual(actual,JSON.parse(oracle.stdout));
        results.push({lit,depth:d,rndResult:a,rn2Result:b,observed:actual});
    }
    console.log(JSON.stringify({exactMatches:results.length,
        traceLayout:['result','rndCalls','rn2Calls','rndBound','rn2Bound'],results},null,2));
} finally { rmSync(dir,{recursive:true,force:true}); }
