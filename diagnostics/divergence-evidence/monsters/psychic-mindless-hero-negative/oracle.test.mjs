import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
test('complete upstream psychic blast treats mindless hero differently from mindless monster',()=>{
 const c=readFileSync('nethack-c/upstream/src/monmove.c','utf8');
 const start=c.indexOf('mind_blast(struct monst *mtmp)'),end=c.indexOf('/* called every turn',start);
 assert.ok(start>0&&end>start);
 const dir=mkdtempSync(join(tmpdir(),'psychic-mindless-'));
 try{
 writeFileSync(join(dir,'oracle.c'),`#include <stdio.h>
#include <string.h>
#include <stdlib.h>
typedef int boolean;
#include "monattk.h"
#include "monflag.h"
#define MAIL_STRUCTURES
#define MON(nam,sym,lvl,gen,atk,siz,mr1,mr2,flg1,flg2,flg3,d,col,bn) {#bn,flg1}
struct permonst{char *name;unsigned long flags;};
struct permonst mons[]={
#include "monsters.h"
};
struct monst{struct permonst*data;struct monst*nmon;int mhp,mpeaceful,mblinded,mx,my,m_ap_type,mappearance;};
struct monst *fmon;
struct {struct monst youmonst;} gy;
struct {int ux,uy,uinvulnerable,uundetected;}u;
#define FALSE 0
#define BOLT_LIM 8
#define Conflict 0
#define Blind_telepat 0
#define Half_spell_damage 0
#define KILLED_BY_AN 1
#define M_AP_NOTHING 0
#define M_AP_MONSTER 3
#define U_AP_TYPE (gy.youmonst.m_ap_type)
#define DEADMONSTER(m) ((m)->mhp<=0)
int heroHP,draw2,drawn;
int rn2(int n){draw2++;return 0;}
int rnd(int n){drawn++;return 1;}
int canseemon(struct monst*m){return 0;}
int cansee(int x,int y){return 0;}
int mdistu(struct monst*m){return 16;}
int sensemon(struct monst*m){return 0;}
int resist_conflict(struct monst*m){return 0;}
int mindless(struct permonst*p){return !!(p->flags&M1_MINDLESS);}
/* Native iron golem and minotaur controls are not telepathic. */
int telepathic(struct permonst*p){return 0;}
char*Monnam(struct monst*m){return m->data->name;}
char*mon_nam(struct monst*m){return m->data->name;}
void pline_mon(struct monst*m,const char*s,...){ }
void pline(const char*s,...){ }
void You(const char*s){ }
void newsym(int x,int y){ }
void losehp(int n,const char*s,int fmt){heroHP-=n;}
void wakeup(struct monst*m,int force){ }
void monkilled(struct monst*m,const char*s,int typ){exit(4);}
void
${c.slice(start,end)}
struct permonst *find(const char*s){for(unsigned i=0;i<sizeof(mons)/sizeof(mons[0]);i++)if(!strcmp(mons[i].name,s))return &mons[i];exit(3);}
int main(void){for(int v=0;v<3;v++){struct monst actor={.data=find("MIND_FLAYER"),.mhp=36},bull={.data=find("MINOTAUR"),.nmon=&actor,.mhp=80,.mpeaceful=1},golem={.data=find("IRON_GOLEM"),.nmon=&bull,.mhp=80,.mpeaceful=1};fmon=&golem;gy.youmonst.data=find(v?"IRON_GOLEM":"HUMAN");u.uinvulnerable=v==2;heroHP=80;draw2=drawn=0;mind_blast(&actor);printf("variant=%d hero_mindless=%d hero_damage=%d golem_damage=%d minotaur_damage=%d rn2=%d rnd=%d\\n",v,mindless(gy.youmonst.data),80-heroHP,80-golem.mhp,80-bull.mhp,draw2,drawn);}}
`);
 execFileSync('cc',['-std=c99','-I',resolve('nethack-c/upstream/include'),join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 const output=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'});
 assert.equal(output,'variant=0 hero_mindless=0 hero_damage=1 golem_damage=0 minotaur_damage=1 rn2=2 rnd=2\nvariant=1 hero_mindless=1 hero_damage=1 golem_damage=0 minotaur_damage=1 rn2=2 rnd=2\nvariant=2 hero_mindless=1 hero_damage=0 golem_damage=0 minotaur_damage=1 rn2=1 rnd=1\n');
 console.log(output.trim());
 }finally{rmSync(dir,{recursive:true,force:true});}
});
