import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {some_armor} from '../../../../js/do_wear.js';
const root=new URL('../../../../',import.meta.url);
test('hero armor selector agrees with extracted C for all slot masks and four draw values',()=>{
 const c=readFileSync(new URL('nethack-c/upstream/src/do_wear.c',root),'utf8');
 const body=c.match(/some_armor\(struct monst \*victim\)\n\{[\s\S]*?\n\}/)[0];
 const fields=['uarmc','uarm','uarmu','uarmh','uarmg','uarmf','uarms'];
 const masks=['W_ARMC','W_ARM','W_ARMU','W_ARMH','W_ARMG','W_ARMF','W_ARMS'];
 const dir=mkdtempSync(join(tmpdir(),'objects-armor-oracle-'));
 try {
 const harness=`#include <stdio.h>\n#include <stdlib.h>\nstruct obj { int id; }; struct monst { int unused; }; struct { struct monst youmonst; } gy;\n${fields.map(f=>`struct obj *${f};`).join('\n')}\n${masks.map((m,i)=>`#define ${m} ${i}`).join('\n')}\nint draws,code; int rn2(int bound) { if(bound!=4) abort(); int value=(code>>(2*draws))&3; ++draws; return value; }\nstruct obj *which_armor(struct monst *m,int mask) { abort(); }\nstruct obj *${body}\nint main(void) {struct obj objs[7];for(int i=0;i<7;i++)objs[i].id=i+1;for(int mask=0;mask<128;mask++)for(code=0;code<256;code++){${fields.map((f,i)=>`${f}=(mask&(1<<${i}))?&objs[${i}]:NULL;`).join('')}draws=0;struct obj *v=some_armor(&gy.youmonst);printf("%d,%d\\n",v?v->id:0,draws);}return 0;}`;
 writeFileSync(join(dir,'oracle.c'),harness);
 execFileSync(process.env.CC||'clang',['-std=c99','-O0',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 const rows=execFileSync(join(dir,'oracle'),{encoding:'utf8',maxBuffer:2**22}).trim().split('\n');
 assert.equal(rows.length,32768);let row=0;
 for(let mask=0;mask<128;mask++)for(let code=0;code<256;code++){
  const state={youmonst:{}};for(let i=0;i<7;i++)state[fields[i]]=mask&(1<<i)?{id:i+1}:null;
  let draws=0;const selected=some_armor(state.youmonst,state,{rn2:bound=>{assert.equal(bound,4);return(code>>(2*draws++))&3;}});
  assert.equal(`${selected?.id??0},${draws}`,rows[row++],`mask=${mask},code=${code}`);
 }
 // Controls expose short-circuiting and the zero-versus-nonzero branch.
 const s={youmonst:{},uarm:{id:2},uarmh:{id:4}};
 assert.equal(some_armor(s.youmonst,s,{rn2:()=>0}).id,4);
 assert.equal(some_armor(s.youmonst,s,{rn2:()=>1}).id,2);
 const lone={youmonst:{},uarmh:{id:4}};
 assert.equal(some_armor(lone.youmonst,lone,{rn2:()=>{throw Error('unexpected draw');}}).id,4);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
