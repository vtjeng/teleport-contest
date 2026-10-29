// Run from repository root. Executes verbatim extracted C functions, never a
// hand-translated expected formula. Adapter limitations are in adapter.h.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { weight_cap, inv_weight, calc_capacity, near_capacity, rounddiv } from '../../../../js/hack.js';
import { resetGame } from '../../../../js/gstate.js';
import { LAST_PROP } from '../../../../js/const.js';
import { COIN_CLASS, ROCK } from '../../../../js/objects.js';
const dir = 'diagnostics/divergence-evidence/carrying-capacity/arithmetic';
const mode = process.argv[2] ?? 'target';
assert.ok(['target', 'control'].includes(mode));
const cbase = 'nethack-c/upstream';
const extract = (file, name, type) => {
    const text = readFileSync(`${cbase}/src/${file}`, 'utf8');
    const start = text.indexOf(`\n${name}(`);
    assert.ok(start > 0);
    const end = text.indexOf('\n}', start) + 2;
    assert.ok(end > start);
    return `${type}${text.slice(start, end)}\n`;
};
const source = readFileSync(`${dir}/adapter.h`, 'utf8') + '\n'
    + extract('attrib.c', 'acurrstr', 'schar')
    + ['weight_cap','inv_weight','calc_capacity','near_capacity','rounddiv'].map(n => extract('hack.c', n, 'int')).join('\n')
    + `\nint main(void) {
        char kind; long a,b,c,d,e;
        while (scanf(" %c %ld %ld %ld %ld %ld", &kind,&a,&b,&c,&d,&e)==6) {
            if(kind=='R') { printf("%d\\n",rounddiv(a,(int)b)); continue; }
            attrs[0]=(int)a; attrs[1]=(int)b;
            struct obj coin={COIN_CLASS,0,d,0,NULL};
            struct obj ordinary={'*',2,1,(unsigned)c,d?&coin:NULL};
            gi.invent=&ordinary;
            int cap=weight_cap(), excess=inv_weight(), near=near_capacity(), calc=calc_capacity((int)e);
            printf("%d %d %d %d %d\\n",cap,excess,near,calc,gw.wc);
        }
    }\n`;
const rows=[];
if(mode==='target') {
    for(const str of [3,17,18,19,49,50,99,100,118,119,121,122,125])
    for(const con of [3,10,18,25]) {
        // Generate broad candidate thresholds; expected outputs come only from C.
        for(const cap of [Math.min(1000, 25 * ((str <= 18 ? str : str <= 121 ? 19 + Math.trunc(str / 50) : str - 100) + con) + 50)])
        for(let k=2;k<=6;k++)
        for(const delta of [-1,0,1])
        for(const gold of [0,49,50,149,150])
        for(const extra of [-1,0,1]) rows.push(['W',str,con,cap*k/2+delta,gold,extra]);
    }
    for(let x=-1000;x<=1000;x++) for(const y of [-100,-7,-2,-1,1,2,7,100]) rows.push(['R',x,y,0,0,0]);
} else rows.push(['W',18,10,750,0,0],['W',18,10,751,0,0],['W',18,10,1125,0,0],['R',1,2,0,0,0],['R',-1,2,0,0,0],['R',1,-2,0,0,0]);
// All generated input values must be valid integers (including odd capacities).
for(const row of rows) if(row[0]==='W') row[3]=Math.ceil(row[3]);
const temp=mkdtempSync(join(tmpdir(),'capacity-oracle-'));
try {
    writeFileSync(join(temp,'probe.c'),source);
    execFileSync('cc',['-std=c99','-O0','-Wall','-Wextra','-Werror',`-I${process.cwd()}/${cbase}/include`,join(temp,'probe.c'),'-o',join(temp,'probe')]);
    const result=spawnSync(join(temp,'probe'),[],{input:rows.map(r=>r.join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:32*1024*1024});
    assert.equal(result.status,0,result.stderr);
    const c=result.stdout.trim().split('\n').map(line=>line.split(' ').map(Number));
    assert.equal(c.length,rows.length);
    const failures=[];
    const state=resetGame();
    state.u={acurr:{a:[18,10,10,10,10,10]},abon:[0,0,0,0,0,0],atemp:[0,0,0,0,0,0],uprops:Array.from({length:LAST_PROP+1},()=>({intrinsic:0,extrinsic:0,blocked:0})),umonnum:0,umonster:0,usteed:null,uz:{dnum:0,dlevel:1}};
    state.youmonst={data:{}}; state.afternmv=null;
    for(let i=0;i<rows.length;i++) {
        const [kind,a,b,w,gold,extra]=rows[i]; let js;
        if(kind==='R') js=[rounddiv(a,b)]; else {
            state.u.acurr.a[0]=a; state.u.acurr.a[4]=b;
            state.invent={oclass:0,otyp:ROCK,quan:1,owt:w,nobj:gold?{oclass:COIN_CLASS,quan:gold,nobj:null}:null};
            js=[weight_cap(state),inv_weight(state),near_capacity(state),calc_capacity(extra,state),state.gw.wc];
        }
        if(JSON.stringify(js)!==JSON.stringify(c[i])) failures.push({input:rows[i],c:c[i],js});
    }
    if(mode==='control') assert.deepEqual(c,[[750,0,0,0,750],[750,1,1,1,750],[750,375,2,2,750],[1],[-1],[-1]]);
    console.log(JSON.stringify({mode,rows:rows.length,weightRows:rows.filter(r=>r[0]==='W').length,roundRows:rows.filter(r=>r[0]==='R').length,mismatches:failures.length,firstFailures:failures.slice(0,10)},null,2));
    process.exitCode=failures.length?1:0;
} finally { rmSync(temp,{recursive:true,force:true}); }
