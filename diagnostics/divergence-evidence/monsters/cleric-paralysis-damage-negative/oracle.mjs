import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('unchanged C paralysis and dispatcher forward damage',()=>{
 const source=readFileSync(new URL('../../../../nethack-c/upstream/src/mcastu.c',import.meta.url),'utf8');
 const extract=name=>{const start=source.indexOf(`\n${name}(`)+1;assert.ok(start>0);return source.slice(start,source.indexOf('\n}',start)+2);};
 const dispatch=extract('mcast_spell');const paralyze=extract('mcast_paralyze');
 const symbols=[...new Set([...dispatch.matchAll(/case (MCAST_\w+):/g)].map(m=>m[1]))];
 const excluded=['mcast_spell','mcast_paralyze','is_undirected_spell','mdamageu','if','switch'];
 const calls=[...new Set([...dispatch.matchAll(/\b(\w+)\(/g)].map(m=>m[1]))].filter(n=>!excluded.includes(n));
 const code=`#include <stdio.h>
#include <stdlib.h>
struct monst {int m_lev;}; struct obj {int x;};
struct {int ux,uy;} u; struct {int multi;const char*multi_reason;} gm;struct {const char*nomovemsg;} gn;
int Antimagic,Free_action,Half_spell_damage,damage,spoken,shield;
#define M_SEEN_MAGR 1
${symbols.map((s,i)=>`#define ${s} ${i}`).join('\n')}
void shieldeff(int x,int y){shield++;} void monstseesu(int x){}void monstunseesu(int x){}
void You(const char*s){spoken++;}void nomul(int n){gm.multi=n;}
int is_undirected_spell(int n){return 0;}
void mdamageu(struct monst*m,int n){damage+=n;}
${calls.map(n=>`int ${n}(){abort();}`).join('\n')}
int ${paralyze}
void ${dispatch}
int main(void){struct monst m={10};for(int mode=0;mode<2;mode++){Free_action=mode==1;Half_spell_damage=mode==2;damage=spoken=shield=gm.multi=0;mcast_spell(&m,6,MCAST_PARALYZE);printf("mode=%d damage=%d multi=%d spoken=%d shield=%d\\n",mode,damage,gm.multi,spoken,shield);}return 0;}`;
 const dir=mkdtempSync(join(tmpdir(),'cleric-paralyze-'));try{writeFileSync(join(dir,'oracle.c'),code);execFileSync('cc',['-std=c99',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);const out=execFileSync(join(dir,'oracle'),{encoding:'utf8'});console.log(out);assert.equal(out,'mode=0 damage=14 multi=-14 spoken=1 shield=0\nmode=1 damage=1 multi=-1 spoken=1 shield=1\n');}finally{rmSync(dir,{recursive:true,force:true});}
});
