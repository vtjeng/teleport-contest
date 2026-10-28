import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as M from '../../../../js/monsters.js';
import {getmattk} from '../../../../js/mhitu.js';
test('compiled C native magic catalog excludes AD_FIRE; real missile and cold controls survive',()=>{
 const dir=mkdtempSync(join(tmpdir(),'native-magic-catalog-'));
 try{
 writeFileSync(join(dir,'oracle.c'),`#include <stdio.h>
typedef int boolean;
#include "monattk.h"
#define MAIL_STRUCTURES
#define MON(nam,sym,lvl,gen,atk,siz,mr1,mr2,flg1,flg2,flg3,d,col,bn) {#bn,atk}
#define A(...) {__VA_ARGS__}
#define ATTK(a,d,n,s) {a,d,n,s}
#define NO_ATTK ATTK(0,0,0,0)
struct attack {int a,d,n,s;};
struct row {char *name;struct attack attacks[6];};
struct row rows[]={
#include "monsters.h"
};
int main(void){for(unsigned i=0;i<sizeof(rows)/sizeof(rows[0]);i++)for(int j=0;j<6;j++)if(rows[i].attacks[j].a==AT_MAGC)printf("%s %d %d %d %d\\n",rows[i].name,j,rows[i].attacks[j].d,rows[i].attacks[j].n,rows[i].attacks[j].s);}
`);
 execFileSync('cc',['-std=c99','-I',resolve('nethack-c/upstream/include'),join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 const rows=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'}).trim().split('\n').map(l=>{const [name,...nums]=l.split(' ');return {name,values:nums.map(Number)};});
 const state={};M.monst_globals_init(state);state.sysopt={seduce:true};state.youmonst={data:state.mons[M.PM_HUMAN]};state.u={uz:{dnum:0,dlevel:1}};
 const jsRows=[];
 for(const mon of state.mons)for(let i=0;i<(mon?.mattk?.length??0);i++)if(mon.mattk[i].aatyp===M.AT_MAGC)jsRows.push([mon.pmidx,i,mon.mattk[i].adtyp,mon.mattk[i].damn,mon.mattk[i].damd]);
 assert.deepEqual(jsRows,rows.map(r=>[M['PM_'+r.name],...r.values]));
 assert.equal(rows.filter(r=>r.values[1]===M.AD_FIRE).length,0);
 assert.ok(rows.some(r=>r.name==='ASMODEUS'&&r.values[1]===M.AD_COLD));
 assert.ok(rows.some(r=>r.values[1]===M.AD_MAGM));
 // getmattk's native-caster substitutions cannot turn a slot into fire magic.
 // Use each native row, all slots, and ordinary/cancelled/cooldown variants.
 for(const mon of state.mons){if(!mon?.mattk)continue;for(const mcan of [false,true])for(const mspec_used of [0,2])for(let i=0;i<6;i++){
  const attacker={data:mon,mcan,mspec_used,mw:null};
  const a=getmattk(attacker,{data:state.mons[M.PM_HUMAN],mresists:0},i,[1,1,1,1,1,1],{state});
  assert.ok(!(a.aatyp===M.AT_MAGC&&a.adtyp===M.AD_FIRE));
 }}
 console.log(JSON.stringify({magicSlots:rows.length,damageTypes:[...new Set(rows.map(r=>r.values[1]))],elementalControls:rows.filter(r=>[M.AD_COLD,M.AD_MAGM].includes(r.values[1]))}));
 const c=readFileSync('nethack-c/upstream/src/mhitu.c','utf8');
 const start=c.indexOf('getmattk('),end=c.indexOf('calc_mattacku_vars(',start);
 const body=c.slice(start,end);
 assert.ok(!/attk->adtyp\s*=\s*AD_FIRE/.test(body));
 assert.ok(!/attk->aatyp\s*=\s*AT_MAGC/.test(body));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
