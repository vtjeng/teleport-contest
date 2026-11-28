/* Narrow oracle adapter: resource/XP fields only, no natural-play claim.
 * Field types follow include/you.h; bounded fixtures avoid overflow. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <stdarg.h>
#include <assert.h>
#define staticfn static
#define TRUE 1
#define FALSE 0
#define MAXULEV 30
#define max(a,b) ((a)>(b)?(a):(b))
#define Upolyd 0
#define A_CON 4
#define A_WIS 2
#define ACURR(a) ((a)==A_CON?con_attr:wis_attr)
#define Role_switch role_kind
#define PM_WIZARD 343
#define PM_CLERIC 337
#define PM_HEALER 334
#define PM_KNIGHT 335
#define PM_BARBARIAN 331
#define PM_VALKYRIE 342
#define LL_MINORAC 0
#define sa2_xpleveldown 0
#define sa2_xplevelup 0
#define KILLED_BY 0
#define DIED 0
#define Strcpy strcpy
typedef int boolean;
typedef int16_t xint16;
struct { int ulevel,ulevelmax,ulevelpeak,uhp,uhpmax,uhppeak,uen,uenmax,uenpeak,mh,mhmax; long uexp; xint16 uhpinc[30],ueninc[30]; struct {int type,record;} ualign; } u;
struct advance {int infix,inrnd,lofix,lornd,hifix,hirnd;};
struct role {struct advance hpadv,enadv;int xlev,initrecord;};
/* Independently pinned to the Wizard and human entries in src/role.c. */
struct {struct role urole,urace;} gu={{{10,0,0,8,1,0},{4,3,0,2,0,3},12,0},{{2,0,0,2,1,0},{1,0,2,0,2,0},0,0}};
struct {int botl;} disp;
struct {int youmonst;} gy;
struct {long moves;} svm={1};
struct {int initalign;} flags;
struct {int value;} aligns[3];
struct {struct {int format;char name[256];} killer;} svk;
static int upper,draws,role_kind,con_attr,wis_attr;
static char rng[1024];
static int rnd(int n){int result=upper?n:1;assert(n>0);char b[64];snprintf(b,sizeof b,"rnd(%d)=%d;",n,result);strcat(rng,b);draws++;return result;}
static int rn1(int n,int b){int result=b+(upper?n-1:0);assert(n>0);char text[64];snprintf(text,sizeof text,"rn1(%d,%d)=%d;",n,b,result);strcat(rng,text);draws++;return result;}

#ifndef PM_ARCHEOLOGIST
#define PM_ARCHEOLOGIST 1000
#endif
#ifndef PM_BARBARIAN
#define PM_BARBARIAN 1001
#endif
#ifndef PM_CAVE_DWELLER
#define PM_CAVE_DWELLER 1002
#endif
#ifndef PM_HEALER
#define PM_HEALER 1003
#endif
#ifndef PM_KNIGHT
#define PM_KNIGHT 1004
#endif
#ifndef PM_MONK
#define PM_MONK 1005
#endif
#ifndef PM_CLERIC
#define PM_CLERIC 1006
#endif
#ifndef PM_ROGUE
#define PM_ROGUE 1007
#endif
#ifndef PM_RANGER
#define PM_RANGER 1008
#endif
#ifndef PM_SAMURAI
#define PM_SAMURAI 1009
#endif
#ifndef PM_TOURIST
#define PM_TOURIST 1010
#endif
#ifndef PM_VALKYRIE
#define PM_VALKYRIE 1011
#endif
#ifndef PM_WIZARD
#define PM_WIZARD 1012
#endif
static struct role role_data[]={{{11,0,0,8,1,0},{1,0,0,1,0,1},14,10},{{14,0,0,10,2,0},{1,0,0,1,0,1},10,10},{{14,0,0,8,2,0},{1,0,0,1,0,1},10,0},{{11,0,0,8,1,0},{1,4,0,1,0,2},20,10},{{14,0,0,8,2,0},{1,4,0,1,0,2},10,10},{{12,0,0,8,1,0},{2,2,0,2,0,2},10,10},{{12,0,0,8,1,0},{4,3,0,2,0,2},10,0},{{10,0,0,8,1,0},{1,0,0,1,0,1},11,10},{{13,0,0,6,1,0},{1,0,0,1,0,1},12,10},{{13,0,0,8,1,0},{1,0,0,1,0,1},11,10},{{8,0,0,8,0,0},{1,0,0,1,0,1},14,0},{{14,0,0,8,2,0},{1,0,0,1,0,1},10,0},{{10,0,0,8,1,0},{4,3,0,2,0,3},12,0}};
static struct role race_data[]={{{2,0,0,2,1,0},{1,0,2,0,2,0},0,0},{{1,0,0,1,1,0},{2,0,3,0,3,0},0,0},{{4,0,0,3,2,0},{0,0,0,0,0,0},0,0},{{1,0,0,1,0,0},{2,0,2,0,2,0},0,0},{{1,0,0,1,0,0},{1,0,1,0,1,0},0,0}};
static int role_codes[]={PM_ARCHEOLOGIST,PM_BARBARIAN,PM_CAVE_DWELLER,PM_HEALER,PM_KNIGHT,PM_MONK,PM_CLERIC,PM_ROGUE,PM_RANGER,PM_SAMURAI,PM_TOURIST,PM_VALKYRIE,PM_WIZARD};
staticfn int
enermod(int en)
{
    switch (Role_switch) {
    case PM_CLERIC:
    case PM_WIZARD:
        return (2 * en);
    case PM_HEALER:
    case PM_KNIGHT:
        return ((3 * en) / 2);
    case PM_BARBARIAN:
    case PM_VALKYRIE:
        return ((3 * en) / 4);
    default:
        return en;
    }
}

int
newpw(void)
{
    int en = 0, enrnd, enfix;

    if (u.ulevel == 0) {
        en = gu.urole.enadv.infix + gu.urace.enadv.infix;
        if (gu.urole.enadv.inrnd > 0)
            en += rnd(gu.urole.enadv.inrnd);
        if (gu.urace.enadv.inrnd > 0)
            en += rnd(gu.urace.enadv.inrnd);
    } else {
        enrnd = (int) ACURR(A_WIS) / 2;
        if (u.ulevel < gu.urole.xlev) {
            enrnd += gu.urole.enadv.lornd + gu.urace.enadv.lornd;
            enfix = gu.urole.enadv.lofix + gu.urace.enadv.lofix;
        } else {
            enrnd += gu.urole.enadv.hirnd + gu.urace.enadv.hirnd;
            enfix = gu.urole.enadv.hifix + gu.urace.enadv.hifix;
        }
        en = enermod(rn1(enrnd, enfix));
    }
    if (en <= 0)
        en = 1;
    if (u.ulevel < MAXULEV) {
        /* remember increment; future level drain could take it away again */
        u.ueninc[u.ulevel] = (xint16) en;
    } else {
        /* after level 30, throttle energy gains from extra experience;
           once max reaches 600, further increments will be just 1 more */
        char lim = 4 - u.uenmax / 200;

        lim = max(lim, 1);
        if (en > lim)
            en = lim;
    }
    return en;
}

int
newhp(void)
{
    int hp, conplus;

    if (u.ulevel == 0) {
        /* Initialize hit points */
        hp = gu.urole.hpadv.infix + gu.urace.hpadv.infix;
        if (gu.urole.hpadv.inrnd > 0)
            hp += rnd(gu.urole.hpadv.inrnd);
        if (gu.urace.hpadv.inrnd > 0)
            hp += rnd(gu.urace.hpadv.inrnd);
        if (svm.moves == 0) { /* initial hero; skip for polyself to new man */
            /* Initialize alignment stuff */
            u.ualign.type = aligns[flags.initalign].value;
            u.ualign.record = gu.urole.initrecord;
        }
        /* no Con adjustment for initial hit points */
    } else {
        if (u.ulevel < gu.urole.xlev) {
            hp = gu.urole.hpadv.lofix + gu.urace.hpadv.lofix;
            if (gu.urole.hpadv.lornd > 0)
                hp += rnd(gu.urole.hpadv.lornd);
            if (gu.urace.hpadv.lornd > 0)
                hp += rnd(gu.urace.hpadv.lornd);
        } else {
            hp = gu.urole.hpadv.hifix + gu.urace.hpadv.hifix;
            if (gu.urole.hpadv.hirnd > 0)
                hp += rnd(gu.urole.hpadv.hirnd);
            if (gu.urace.hpadv.hirnd > 0)
                hp += rnd(gu.urace.hpadv.hirnd);
        }
        if (ACURR(A_CON) <= 3)
            conplus = -2;
        else if (ACURR(A_CON) <= 6)
            conplus = -1;
        else if (ACURR(A_CON) <= 14)
            conplus = 0;
        else if (ACURR(A_CON) <= 16)
            conplus = 1;
        else if (ACURR(A_CON) == 17)
            conplus = 2;
        else if (ACURR(A_CON) == 18)
            conplus = 3;
        else
            conplus = 4;
        hp += conplus;
    }
    if (hp <= 0)
        hp = 1;
    if (u.ulevel < MAXULEV) {
        /* remember increment; future level drain could take it away again */
        u.uhpinc[u.ulevel] = (xint16) hp;
    } else {
        /* after level 30, throttle hit point gains from extra experience;
           once max reaches 1200, further increments will be just 1 more */
        char lim = 5 - u.uhpmax / 300;

        lim = max(lim, 1);
        if (hp > lim)
            hp = lim;
    }
    return hp;
}

int main(int argc,char **argv){
 if(argc!=2)return 2;
 FILE *f=fopen(argv[1],"r");if(!f)return 2;
 int index,ri,ra,lev,con,wis,extreme,al;
 while(fscanf(f,"%d %d %d %d %d %d %d %d",&index,&ri,&ra,&lev,&con,&wis,&extreme,&al)==8){
  assert(ri>=0&&ri<13&&ra>=0&&ra<5&&lev>=0&&lev<30&&con>=3&&con<=25&&wis>=3&&wis<=25);
  memset(&u,0,sizeof u);rng[0]=0;draws=0;upper=extreme;con_attr=con;wis_attr=wis;
  gu.urole=role_data[ri];gu.urace=race_data[ra];role_kind=role_codes[ri];
  u.ulevel=lev;aligns[0].value=1;aligns[1].value=0;aligns[2].value=-1;
  assert(al>=0&&al<=2);flags.initalign=al;u.ualign.type=aligns[al].value;u.ualign.record=0;svm.moves=0;
  int hp=newhp();int en=newpw();
  printf("{\"index\":%d,\"hp\":%d,\"en\":%d,\"storedHp\":%d,\"storedEn\":%d,\"alignType\":%d,\"alignRecord\":%d,\"rng\":\"%s\"}\n",index,hp,en,u.uhpinc[lev],u.ueninc[lev],u.ualign.type,u.ualign.record,rng);
 }
 if(!feof(f))return 2;
 fclose(f);
 return 0;
}
