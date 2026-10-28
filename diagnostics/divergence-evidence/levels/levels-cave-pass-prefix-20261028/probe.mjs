import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const root = new URL('../../../../', import.meta.url);
const c = readFileSync(new URL('nethack-c/upstream/src/mkmap.c', root), 'utf8');
const js = readFileSync(new URL('js/mklev.js', root), 'utf8');
function extract(source, name, language) {
    const marker = language === 'C' ? `\n${name}(` : `function ${name}(`;
    const start = source.indexOf(marker); assert.ok(start >= 0, name);
    const open = source.indexOf('{', start); let depth = 1, end = open + 1;
    while (depth) { const ch = source[end++]; if (ch === '{') depth++; if (ch === '}') depth--; assert.ok(end <= source.length); }
    return source.slice(start + (language === 'C' ? 1 : 0), end);
}
const names = ['get_map', 'pass_one', 'pass_two', 'pass_three'];
const cBodies = names.map(n => `${n === 'get_map' ? 'schar' : 'void'} ${extract(c, n, 'C')}`).join('\n');
const dir = mkdtempSync(join(tmpdir(), 'levels-cave-proof-'));
const harness = `#include <stdio.h>
#include <stdlib.h>
typedef int coordxy; typedef signed char schar;
#define WIDTH 78
#define HEIGHT 20
struct { schar typ; } levl[80][21];
char buffer[79*20]; struct { char *new_locations; } gn = { buffer };
#define new_loc(i,j) *(gn.new_locations + ((j)*(WIDTH+1))+(i))
${c.match(/staticfn const int dirs\[16\] = \{[\s\S]*?\};/)[0].replace('staticfn', 'static')}
${cBodies}
int main(int argc,char **argv) {
 if(argc!=2) return 2;
 for(int x=0;x<80;x++) for(int y=0;y<21;y++) { int t=getchar(); if(t!='0'&&t!='1') return 3; levl[x][y].typ=(t-'0')*25; }
 switch(atoi(argv[1])) { case 1: pass_one(0,25); break; case 2: pass_two(0,25); break; case 3: pass_three(0,25); break; default:return 4; }
 for(int x=0;x<80;x++) for(int y=0;y<21;y++) putchar('0'+(levl[x][y].typ==25));
 return 0;
}`;
const results = [];
try {
    writeFileSync(join(dir, 'oracle.c'), harness);
    const cc = spawnSync('clang', ['-std=c99', '-O0', '-Wall', '-Wextra', join(dir, 'oracle.c'), '-o', join(dir, 'oracle')], { encoding: 'utf8' });
    assert.equal(cc.status, 0, cc.stderr);
    const ctx = vm.createContext({ WIDTH: 78, HEIGHT: 20, mkmap_dirs: [-1,-1,-1,0,-1,1,0,-1,0,1,1,-1,1,0,1,1] });
    vm.runInContext(names.map(n => extract(js, 'mkmap_' + n, 'JS')).join('\n'), ctx);
    for (let pattern = 0; pattern < 12; pattern++) {
        let seed = 28103200 + pattern;
        const cells = Array.from({ length: 1680 }, (_, i) => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return pattern === 0 ? 0 : pattern === 1 ? 1 : pattern === 2 ? i % 2 : (seed >>> 24) < (pattern * 19) ? 1 : 0;
        });
        for (let pass = 1; pass <= 3; pass++) {
            const input = cells.join('');
            const oracle = spawnSync(join(dir, 'oracle'), [String(pass)], { input, encoding: 'utf8' });
            assert.equal(oracle.status, 0, oracle.stderr);
            const map = cells.map(bit => ({ typ: bit * 25 }));
            const state = { level: { at: (x, y) => map[x * 21 + y] } };
            ctx['mkmap_pass_' + ['one', 'two', 'three'][pass - 1]](0, 25, state);
            const observed = map.map(loc => Number(loc.typ === 25)).join('');
            assert.equal(observed, oracle.stdout, `pattern ${pattern} pass ${pass}`);
            results.push({ pattern, pass, changed: observed !== input,
                sha256: createHash('sha256').update(observed).digest('hex') });
        }
    }
    // Actual JS top-level body with call observers; no replacement generator.
    const calls = [];
    const top = vm.createContext({ N_P1_ITER: 1, N_P2_ITER: 1, N_P3_ITER: 2,
        litstate_rnd: x => x,
        ...Object.fromEntries(['init_map','init_fill','pass_one','pass_two','pass_three','join_map','finish_map']
            .map(n => ['mkmap_' + n, () => calls.push(n)])) });
    vm.runInContext(extract(js, 'mkmap', 'JS'), top);
    for (const smoothed of [false, true]) {
        calls.length = 0;
        top.mkmap({ bg: 0, fg: 25, lit: 0, smoothed, joined: false, walled: false }, {});
        assert.deepEqual(calls, ['init_map', 'init_fill', 'pass_one', 'pass_two',
            ...(smoothed ? ['pass_three', 'pass_three'] : []), 'finish_map']);
    }
    for (const pass of [1,2,3]) {
        assert.ok(results.some(r => r.pass === pass && r.changed), 'omitting this pass must fail a target');
        assert.ok(results.some(r => r.pass === pass && !r.changed), 'stable-map control');
    }
    console.log(JSON.stringify({ oracle: 'extracted pinned C mkmap.c functions compiled by clang',
        mapComparisons: results.length, exactMatches: results.length, dispatchControls: 2,
        sourceHashes: { C: createHash('sha256').update(c).digest('hex'), JS: createHash('sha256').update(js).digest('hex') },
        results }, null, 2));
} finally { rmSync(dir, { recursive: true, force: true }); }
