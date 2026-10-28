import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
test('compile exact upstream gaze rejection predicate for blinded native attackers',()=>{
 const c=readFileSync(new URL('../../../../nethack-c/upstream/src/mhitm.c',import.meta.url),'utf8');
 const gaze=c.slice(c.indexOf('\ngazemm('),c.indexOf('\n/* return True if magr'));
 const start=gaze.indexOf('if (magr->mcan || !mdef->mcansee');
 const end=gaze.indexOf(' {',start);
 assert.ok(start>0&&end>start);
 const condition=gaze.slice(start,end);
 assert.ok(gaze.includes('magr->data == &mons[PM_ARCHON]'));
 assert.ok(gaze.includes('&& mattk->adtyp == AD_BLND'));
 assert.ok(gaze.includes('altmesg = (archon && !magr->mcansee)'));
 assert.ok(gaze.includes('mhitm_ad_blnd(magr, mattk, mdef, (struct mhitm_data *) 0)'));
 const potion=readFileSync(new URL('../../../../nethack-c/upstream/src/potion.c',import.meta.url),'utf8');
 const hit=potion.slice(potion.indexOf('potionhit(struct monst'),potion.indexOf('/* vapors are inhaled'));
 const blindness=hit.slice(hit.indexOf('case POT_BLINDNESS:'),hit.indexOf('case POT_WATER:',hit.indexOf('case POT_BLINDNESS:')));
 assert.ok(blindness.includes('haseyes(mon->data) && !mon_perma_blind(mon)'));
 assert.ok(blindness.includes('mon->mcansee = 0;'));
 assert.ok(!blindness.includes('resists_blnd'));
 const dir=mkdtempSync(join(tmpdir(),'archon-gaze-oracle-'));
 try {
 writeFileSync(join(dir,'oracle.c'),`#include <stdio.h>
 struct monster {int mcan,mcansee,minvis,msleeping,data;};
 int resists_blnd(struct monster *m){return 0;} int perceives(int d){return 0;}
 int rejected(int archon){struct monster a={0,0,0,0,0},b={0,1,0,0,0};struct monster *magr=&a,*mdef=&b;
 ${condition} return 1;return 0;}
 int main(void){printf("%d %d\\n",rejected(1),rejected(0));}
 `);
 execFileSync('cc',['-std=c99',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 const result=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'});
 assert.equal(result.toString(),'0 1\n');console.log('C exact gaze guard: blinded Archon allowed; blinded ordinary gaze rejected');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
