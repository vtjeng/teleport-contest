import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mon_regen} from '../../../../js/mon.js';
import {MONSTER_TEMPLATES,PM_NEWT} from '../../../../js/monsters.js';
const root=new URL('../../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
test('all C source identifier uses are definition and FALSE caller; no address-taking',()=>{
 const refs=[];
 for(const file of readdirSync(new URL('nethack-c/upstream/src/',root)).filter(f=>f.endsWith('.c'))){
  const source=strip(read('nethack-c/upstream/src/'+file));
  for(const match of source.matchAll(/\bmon_regen\b/g))refs.push([file,source.slice(match.index).match(/^mon_regen\s*\([^)]*\)/)?.[0]]);
 }
 assert.deepEqual(refs,[['mon.c','mon_regen(mtmp, FALSE)'],['monmove.c','mon_regen(struct monst *mon, boolean digest_meal)']]);
 const c=read('nethack-c/upstream/src/monmove.c');
 assert.match(c,/if \(digest_meal\) \{\s*if \(mon->meating\)/);
 assert.match(c,/if \(mtmp->meating\) \{\s*mtmp->meating--;\s*if \(mtmp->meating <= 0\)\s*finish_meating\(mtmp\)/);
 const js=read('js/mon.js');assert.match(js,/mon_regen\(monster, false, state\)/);
 assert.match(read('js/monmove.js'),/if \(monster.meating\) \{\s*--monster.meating;\s*if \(monster.meating <= 0\) finishEating\(monster, env\)/);
 assert.match(read('js/unported_monster_actions.js'),/finishEating: finish_meating/);
 console.log(JSON.stringify({cReferences:refs,normalCompletionOwner:'m_move, not mon_regen'}));
});
test('compiled unchanged C function distinguishes inactive caller from true-argument control',()=>{
 const src=read('nethack-c/upstream/src/monmove.c');const start=src.indexOf('\nmon_regen(')+1;const fn=src.slice(start,src.indexOf('\n}',start)+2);
 const code=`#include <stdio.h>
typedef int boolean; struct monst {int data,mhp,mhpmax,mspec_used,meating;};
struct {int moves;} svm; int finished;
int regenerates(int d){return d;}
void healmon(struct monst *m,int a,int b){m->mhp+=a;if(m->mhp>m->mhpmax)m->mhp=m->mhpmax;}
void finish_meating(struct monst *m){m->meating=0;finished++;}
void ${fn}
int main(void){for(int active=0;active<2;active++){struct monst m={0,4,8,2,1};svm.moves=20;finished=0;mon_regen(&m,active);printf("%d %d %d %d %d\\n",active,m.mhp,m.mspec_used,m.meating,finished);}return 0;}`;
 const dir=mkdtempSync(join(tmpdir(),'regen-oracle-'));try{writeFileSync(join(dir,'o.c'),code);execFileSync('cc',['-std=c99',join(dir,'o.c'),'-o',join(dir,'o')]);const observed=execFileSync(join(dir,'o'),{encoding:'utf8'});console.log(observed);assert.equal(observed,'0 5 1 1 0\n1 5 1 0 1\n');}finally{rmSync(dir,{recursive:true,force:true});}
 const m={data:MONSTER_TEMPLATES[PM_NEWT],mhp:4,mhpmax:8,mspec_used:2,meating:1};
 mon_regen(m,false,{moves:20});assert.deepEqual([m.mhp,m.mspec_used,m.meating],[5,1,1]);
 const direct={...m,meating:0};assert.throws(()=>mon_regen(direct,true,{moves:21}),/meal-digestion branch is not implemented/);
 console.log('JS false caller preserves meal; direct true API remains unsupported (not equivalent).');
});
