// Run from repository root. Compile the verbatim pinned C function in a tiny
// point-storage harness; never replace gameplay or recorder sources.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { selection_line } from '../../../../js/bigrm.js';
const source = readFileSync('nethack-c/upstream/src/selvar.c', 'utf8');
const start = source.indexOf('void\nselection_do_line(');
assert.ok(start >= 0);
const end = source.indexOf('\n}\n', start) + 3;
const body = source.slice(start, end);
const dir = mkdtempSync(join(tmpdir(), 'levels-line-c-'));
const c = `#include <stdio.h>\n#include <stdlib.h>\ntypedef int coordxy;\nstruct selectionvar { int points[80][21]; };\nvoid selection_setpoint(int x, int y, struct selectionvar *s, int v) { if (x>=0 && x<80 && y>=0 && y<21) s->points[x][y]=v; }\n${body}\nint main(int argc, char **argv) { struct selectionvar s={0}; if(argc!=5)return 2; selection_do_line(atoi(argv[1]),atoi(argv[2]),atoi(argv[3]),atoi(argv[4]),&s); for(int x=0;x<80;x++)for(int y=0;y<21;y++)if(s.points[x][y])printf("%d,%d\\n",x,y); return 0; }\n`;
writeFileSync(join(dir, 'line.c'), c);
execFileSync('clang', ['-std=c99','-Wall','-Wextra',join(dir,'line.c'),'-o',join(dir,'line')]);
const rows=[];
for(const [name, args] of [
 ['shallow-tie',[10,10,12,11]],['steep-tie',[10,10,11,12]],
 ['reverse-tie',[12,11,10,10]],['horizontal-control',[10,10,12,10]],
 ['vertical-control',[10,10,10,12]],['diagonal-control',[10,10,12,12]],
]) {
 const cPoints=execFileSync(join(dir,'line'),args.map(String),{encoding:'utf8'}).trim().split('\n').map(p=>p.split(',').map(Number));
 const s=selection_line(...args), jsPoints=[];
 for(let x=0;x<80;x++)for(let y=0;y<21;y++)if(s.get(x,y))jsPoints.push([x,y]);
 const matches=JSON.stringify(cPoints)===JSON.stringify(jsPoints);
 rows.push({name,args,cPoints,jsPoints,matches});
 assert.equal(matches,name.endsWith('control'));
}
console.log(JSON.stringify({scope:'direct selection-line helper; shipped Lua diagonal reachability not established',rows},null,2));
if (process.argv.includes('--expect-parity')) assert.ok(rows.every(row=>row.matches),'selection_line differs from the pinned C helper');
