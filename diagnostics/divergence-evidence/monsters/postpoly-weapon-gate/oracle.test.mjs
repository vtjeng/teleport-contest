import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
test('compiled native C catalog and exact post-move gate use the pre-movement species',()=>{
 const c=readFileSync('nethack-c/upstream/src/monmove.c','utf8');
 const body=c.slice(c.indexOf('dochug(struct monst *mtmp)'),c.indexOf('static NEARDATA const char practical'));
 assert.equal((body.match(/mdat\s*=(?!=)/g)||[]).length,1);
 assert.ok(body.includes('mdat = mtmp->data;'));
 assert.ok(body.indexOf('mdat = mtmp->data;')<body.indexOf('status = m_move(mtmp, 0);'));
 const start=body.indexOf('            if (!nearby\n'),end=body.indexOf('        case MMOVE_DIED:',start);
 assert.ok(start>0&&end>start);
 const dir=mkdtempSync(join(tmpdir(),'postpoly-gate-'));
 try{
 writeFileSync(join(dir,'oracle.c'),`#include <stdio.h>
#include <string.h>
typedef int boolean;
#include "monattk.h"
#define MAIL_STRUCTURES
#define MON(nam,sym,lvl,gen,atk,siz,mr1,mr2,flg1,flg2,flg3,d,col,bn) {#bn,atk}
#define A(...) {__VA_ARGS__}
#define ATTK(a,d,n,s) {a,d,n,s}
#define NO_ATTK ATTK(0,0,0,0)
struct attack {int a,d,n,s;};
struct permonst {char *name;struct attack attacks[6];};
struct permonst mons[]={
#include "monsters.h"
};
struct monst {struct permonst *data;};
int attacktype(struct permonst*p,int a){for(int i=0;i<6;i++)if(p->attacks[i].a==a)return 1;return 0;}
int ranged_attk_available(struct monst*m){for(int i=0;i<6;i++)if(DISTANCE_ATTK_TYPE(m->data->attacks[i].a))return 1;return 0;}
/* Fixture holds only a plain dagger, not a muse.c offensive wand/potion. */
int find_offensive(struct monst*m){return 0;}
int engulfing_u(struct monst*m){return 0;}
int mattacku(struct monst*m){return 2;}
int gate(struct monst*mtmp,struct permonst*mdat){int nearby=0;switch(1){case 1:
${body.slice(start,end)}
}return 1;}
int main(void){struct permonst *xorn=0,*ogre=0;for(unsigned i=0;i<sizeof(mons)/sizeof(mons[0]);i++){if(!strcmp(mons[i].name,"XORN"))xorn=&mons[i];if(!strcmp(mons[i].name,"OGRE"))ogre=&mons[i];}if(!xorn||!ogre)return 3;struct monst m={ogre};printf("xorn_to_ogre old_weapon=%d new_weapon=%d ranged=%d continue=%d\\n",attacktype(xorn,AT_WEAP),attacktype(ogre,AT_WEAP),ranged_attk_available(&m),gate(&m,xorn));printf("ogre_to_ogre continue=%d\\n",gate(&m,ogre));}
`);
 execFileSync('cc',['-std=c99','-I',resolve('nethack-c/upstream/include'),join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 const output=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'});
 assert.equal(output,'xorn_to_ogre old_weapon=0 new_weapon=1 ranged=0 continue=0\nogre_to_ogre continue=1\n');
 console.log(output.trim());
 }finally{rmSync(dir,{recursive:true,force:true});}
});
