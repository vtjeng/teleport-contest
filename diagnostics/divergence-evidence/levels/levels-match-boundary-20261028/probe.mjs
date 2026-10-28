import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { selection_match } from '../../../../js/bigrm.js';
import { splev_chr2typ } from '../../../../js/mklev.js';
const root = new URL('../../../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const src = read('nethack-c/upstream/src/sp_lev.c');
const lua = read('nethack-c/upstream/src/nhlua.c');
const rm = read('nethack-c/upstream/include/rm.h');
function body(text, name) {
    const start = text.indexOf('\n' + name + '('); assert.ok(start >= 0);
    let end = text.indexOf('{', start) + 1, depth = 1;
    while (depth) { const ch = text[end++]; if (ch === '{') depth++; if (ch === '}') depth--; }
    return text.slice(start + 1, end);
}
const dir = mkdtempSync(join(tmpdir(), 'levels-match-boundary-'));
try {
    const table = lua.match(/static const struct \{\n    char ch;\n    schar typ;\n\} char2typ\[\] = \{[\s\S]*?\n\};/)[0];
    writeFileSync(join(dir, 'oracle.c'), `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef signed char schar; typedef int boolean; typedef short xint16;
#define TRUE 1
#define FALSE 0
#define panic(...) abort()
${rm.match(/enum levl_typ_types \{[\s\S]*?\n\};/)[0]}
${rm.match(/^#define IS_STWALL.*$/m)[0]}
struct { schar typ; } levl[80][21];
struct mapfragment { char *data; int wid,hei; };
int isok(int x,int y) { return x>=1 && x<=79 && y>=0 && y<=20; }
${table}
schar ${body(lua,'splev_chr2typ')}
schar ${body(src,'mapfrag_get')}
boolean ${body(src,'match_maptyps')}
boolean ${body(src,'mapfrag_match')}
int main(int argc,char **argv) {
 if(argc!=2) return 2;
 for(int x=0;x<80;x++) for(int y=0;y<21;y++) levl[x][y].typ=splev_chr2typ(getchar());
 struct mapfragment mf={argv[1],(int)strlen(argv[1]),1};
 for(int x=0;x<80;x++) for(int y=0;y<21;y++) putchar('0'+(x>0 && mapfrag_match(&mf,x,y)));
 return 0;
}`);
    const cc=spawnSync('clang',['-std=c99','-O0',join(dir,'oracle.c'),'-o',join(dir,'oracle')],{encoding:'utf8'});
    assert.equal(cc.status,0,cc.stderr);
    function compare(cells) {
        const oracle=spawnSync(join(dir,'oracle'),['[.w.]'],{input:cells.join(''),encoding:'utf8'});
        assert.equal(oracle.status,0,oracle.stderr);
        const state={level:{at:(x,y)=>({typ:splev_chr2typ(cells[x*21+y])})}};
        const sel=selection_match('[.w.]',state);
        const observed=cells.map((_,i)=>sel.get(Math.trunc(i/21),i%21)?'1':'0').join('');
        return { expected:oracle.stdout, observed };
    }
    const targets=[];
    for(const x of [40,78]) {
        const cells=new Array(1680).fill(' ');
        cells[(x-1)*21+10]='.';cells[x*21+10]='|';cells[(x+1)*21+10]='.';
        const {expected,observed}=compare(cells);
        assert.equal(expected[x*21+10],'1');
        assert.equal(observed[x*21+10],x===78?'0':'1');
        const diffs=[];for(let i=0;i<1680;i++) if(expected[i]!==observed[i]) diffs.push([Math.trunc(i/21),i%21]);
        assert.deepEqual(diffs,x===78?[[78,10]]:[]);
        targets.push({center:[x,10],C:Number(expected[x*21+10]),JS:Number(observed[x*21+10]),diffs});
    }
    // The shipped wildcard-pattern caller uses this unchanged template before
    // terrain painting. Check every placement fitting the playable rectangle.
    const map=read('nethack-c/upstream/dat/bigrm-3.lua').match(/des\.map\(\[\[\n([\s\S]*?)\n\]\]\);/)[1].split('\n');
    assert.ok(map.every(row=>row.length===map[0].length));
    let placements=0, selectedPoints=0;
    for(let ox=1;ox+map[0].length<=80;ox++) for(let oy=0;oy+map.length<=21;oy++) {
        const cells=new Array(1680).fill(' ');
        for(let y=0;y<map.length;y++) for(let x=0;x<map[0].length;x++) cells[(ox+x)*21+oy+y]=map[y][x];
        const {expected,observed}=compare(cells);assert.equal(observed,expected,`bigrm3 at ${ox},${oy}`);
        placements++;selectedPoints += [...expected].filter(x=>x==='1').length;
    }
    assert.ok(selectedPoints>0,'route controls must exercise successful matches');
    console.log(JSON.stringify({outcome:'unresolved gameplay reachability; helper difference demonstrated',targets,
        shippedBigrm3:{width:map[0].length,height:map.length,placements,selectedPoints,allMatch:true}},null,2));
} finally { rmSync(dir,{recursive:true,force:true}); }
