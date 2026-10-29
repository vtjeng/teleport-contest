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
#define ACURR(a) (10)
#define Role_switch PM_WIZARD
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
static int upper,draws,adjcalls;
static char rng[1024],messages[2048];
static void forbidden(void){fputs("outside qualified oracle scope\n",stderr);exit(3);}
static int rnd(int n){int result=upper?n:1;assert(n>0);char b[64];snprintf(b,sizeof b,"rnd(%d)=%d;",n,result);strcat(rng,b);draws++;return result;}
static int rn1(int n,int b){int result=b+(upper?n-1:0);assert(n>0);char text[64];snprintf(text,sizeof text,"rn1(%d,%d)=%d;",n,b,result);strcat(rng,text);draws++;return result;}
static void pline(const char *fmt,...){char b[256],snap[512];va_list ap;va_start(ap,fmt);vsnprintf(b,sizeof b,fmt,ap);va_end(ap);snprintf(snap,sizeof snap,"%s|%d,%d,%d;",b,u.ulevel,u.uhp,u.uen);strcat(messages,snap);}
static void You_feel(const char *s){char b[256];snprintf(b,sizeof b,"You feel %s",s);pline("%s",b);}
static const char *Goodbye(void){return "Goodbye";}
static void adjabil(int old,int next){assert(abs(next-old)==1);assert(!((old<15&&next>=15)||(old>=15&&next<15)||(old<17&&next>=17)||(old>=17&&next<17)));adjcalls++;}
/* Notifications/achievements are outside the resource projection. No stub
 * reads or writes the projected fields. Polymorph/death/resistance abort. */
static void livelog_printf(int type,const char *fmt,...){(void)type;(void)fmt;}
static void SoundAchievement(int a,int b,int c){(void)a;(void)b;(void)c;}
static int xlev_to_rank(int level){(void)level;return 0;}
static int count_achievements(void){return 0;}
static void record_achievement(int a){(void)a;}
static int achieve_rank(int a){return a;}
static int resists_drli(void *m){(void)m;forbidden();return 0;}
static int monhp_per_lvl(void *m){(void)m;forbidden();return 0;}
static void rehumanize(void){forbidden();}
static void done(int a){(void)a;forbidden();}
long newuexp(int);
void newexplevel(void),pluslvl(boolean),losexp(const char *),setuhpmax(int,boolean);
int newhp(void),newpw(void),minuhpmax(int);

long
newuexp(int lev)
{
    if (lev < 1) /* for newuexp(u.ulevel - 1) when u.ulevel is 1 */
        return 0L;
    if (lev < 10)
        return (10L * (1L << lev));
    if (lev < 20)
        return (10000L * (1L << (lev - 10)));
    return (10000000L * ((long) (lev - 19)));
}

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

void
losexp(
    const char *drainer) /* cause of death, if drain should be fatal */
{
    int num, uhpmin, olduhpmax;

    /* override life-drain resistance when handling an explicit
       wizard mode request to reduce level; never fatal though */
    if (drainer && !strcmp(drainer, "#levelchange"))
        drainer = 0;
    else if (resists_drli(&gy.youmonst))
        return;

    /* level-loss message; "Goodbye level 1." is fatal; divine anger
       (drainer==NULL) resets a level 1 character to 0 experience points
       without reducing level and that isn't fatal so suppress the message
       in that situation */
    if (u.ulevel > 1 || drainer)
        pline("%s level %d.", Goodbye(), u.ulevel);

    if (u.ulevel > 1) {
        u.ulevel -= 1;
        /* remove intrinsic abilities */
        adjabil(u.ulevel + 1, u.ulevel);
        livelog_printf(LL_MINORAC, "lost experience level %d", u.ulevel + 1);
        SoundAchievement(0, sa2_xpleveldown, 0);
    } else { /* u.ulevel==1 */
        if (drainer) {
            svk.killer.format = KILLED_BY;
            if (svk.killer.name != drainer)
                Strcpy(svk.killer.name, drainer);
            done(DIED);
        }
        /* no drainer or lifesaved */
        if (u.ulevel > 1)
            /* can happen during debug fuzzing if fuzzer_savelife() uses
               a blessed potion of restore ability to restore lost levels */
            return;
        u.uexp = 0;
        livelog_printf(LL_MINORAC, "lost all experience");
    }
    assert(u.ulevel >= 0 && u.ulevel < MAXULEV); /* valid array index */

    olduhpmax = u.uhpmax;
    uhpmin = minuhpmax(10); /* same minimum as is used by life-saving */
    num = (int) u.uhpinc[u.ulevel];
    u.uhpmax -= num;
    if (u.uhpmax < uhpmin)
        setuhpmax(uhpmin, TRUE);
    /* uhpmax might try to go up if it has previously been reduced by
       strength loss or by a fire trap or by an attack by Death which
       all use a different minimum than life-saving or experience loss;
       we don't allow it to go up because that contradicts assumptions
       elsewhere (such as healing wielder who drains with Stormbringer) */
    if (u.uhpmax > olduhpmax)
        setuhpmax(olduhpmax, TRUE);

    u.uhp -= num;
    if (u.uhp < 1)
        u.uhp = 1;
    else if (u.uhp > u.uhpmax)
        u.uhp = u.uhpmax;

    num = (int) u.ueninc[u.ulevel];
    u.uenmax -= num;
    if (u.uenmax < 0)
        u.uenmax = 0;
    u.uen -= num;
    if (u.uen < 0)
        u.uen = 0;
    else if (u.uen > u.uenmax)
        u.uen = u.uenmax;

    if (u.uexp > 0)
        u.uexp = newuexp(u.ulevel) - 1;

    if (Upolyd) {
        num = monhp_per_lvl(&gy.youmonst);
        u.mhmax -= num;
        u.mh -= num;
        if (u.mh <= 0)
            rehumanize();
    }

    disp.botl = TRUE;
}

void
newexplevel(void)
{
    if (u.ulevel < MAXULEV && u.uexp >= newuexp(u.ulevel))
        pluslvl(TRUE);
}

void
pluslvl(
    boolean incr) /* True: incremental experience growth;
                   * False: potion of gain level or wraith corpse
                   *        or wizard mode #levelchange */
{
    int hpinc, eninc;

    if (!incr)
        You_feel("more experienced.");

    /* increase hit points (when polymorphed, do monster form first
       in order to retain normal human/whatever increase for later) */
    if (Upolyd) {
        hpinc = monhp_per_lvl(&gy.youmonst);
        u.mh += hpinc;
        setuhpmax(u.mhmax, FALSE); /* acts as setmhmax() when Upolyd */
    }
    hpinc = newhp();
    u.uhp += hpinc;
    setuhpmax(u.uhpmax + hpinc, TRUE); /* will lower u.uhp if it exceeds
                                        * u.uhpmax */

    /* increase spell power/energy points */
    eninc = newpw();
    u.uenmax += eninc;
    if (u.uenmax > u.uenpeak)
        u.uenpeak = u.uenmax;
    u.uen += eninc;

    /* increase level (unless already maxxed) */
    if (u.ulevel < MAXULEV) {
        int old_ach_cnt, newrank, oldrank = xlev_to_rank(u.ulevel);

        /* increase experience points to reflect new level */
        if (incr) {
            long tmp = newuexp(u.ulevel + 1);

            if (u.uexp >= tmp)
                u.uexp = tmp - 1;
        } else {
            u.uexp = newuexp(u.ulevel);
        }
        ++u.ulevel;
        pline("Welcome %sto experience level %d.",
              (u.ulevelmax < u.ulevel) ? "" : "back ",
              u.ulevel);
        if (u.ulevelmax < u.ulevel)
            u.ulevelmax = u.ulevel;
        adjabil(u.ulevel - 1, u.ulevel); /* give new intrinsics */
        SoundAchievement(0, sa2_xplevelup, 0);
        old_ach_cnt = count_achievements();
        newrank = xlev_to_rank(u.ulevel);
        if (newrank > oldrank)
            record_achievement(achieve_rank(newrank));
        /* a new rank achievement will log its own message; log a simpler
           message here if we didn't just get an achievement (so when rank
           hasn't changed or hero just regained a lost level and the rank
           achievement doesn't get repeated) */
        if (count_achievements() == old_ach_cnt)
            livelog_printf(LL_MINORAC, "%sgained experience level %d",
                           (u.ulevel <= u.ulevelpeak) ? "re" : "", u.ulevel);
        if (u.ulevel > u.ulevelpeak)
            u.ulevelpeak = u.ulevel;
    }
    disp.botl = TRUE;
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

int
minuhpmax(int altmin)
{
    if (altmin < 1)
        altmin = 1;
    return max(u.ulevel, altmin);
}

void
setuhpmax(int newmax, boolean even_when_polyd)
{
    if (!Upolyd || even_when_polyd) {
        if (newmax != u.uhpmax) {
            u.uhpmax = newmax;
            if (u.uhpmax > u.uhppeak)
                u.uhppeak = u.uhpmax;
            disp.botl = TRUE;
        }
        if (u.uhp > u.uhpmax)
            u.uhp = u.uhpmax, disp.botl = TRUE;
    } else { /* Upolyd */
        if (newmax != u.mhmax) {
            u.mhmax = newmax;
            disp.botl = TRUE;
        }
        if (u.mh > u.mhmax)
            u.mh = u.mhmax, disp.botl = TRUE;
    }
}


int main(int argc,char **argv){
 if(argc!=12)return 2;
 const char *mode=argv[1];
 u.ulevel=atoi(argv[2]);u.uexp=atol(argv[3]);u.uhp=atoi(argv[4]);u.uhpmax=atoi(argv[5]);u.uen=atoi(argv[6]);u.uenmax=atoi(argv[7]);
 int hi=atoi(argv[8]),ei=atoi(argv[9]);upper=atoi(argv[10]);u.ulevelmax=atoi(argv[11]);
 assert(u.ulevel>=1&&u.ulevel<=30&&u.uhp>=1&&u.uhp<=u.uhpmax&&u.uen>=0&&u.uen<=u.uenmax);
 u.ulevelpeak=u.ulevelmax;u.uhppeak=u.uhpmax;u.uenpeak=u.uenmax;
 for(int i=1;i<u.ulevel;i++){u.uhpinc[i]=2;u.ueninc[i]=4;}
 int slot=!strcmp(mode,"loss")?u.ulevel-1:u.ulevel;
 if(slot<30){u.uhpinc[slot]=hi;u.ueninc[slot]=ei;}
 if(!strcmp(mode,"gain"))newexplevel();
 else if(!strcmp(mode,"loss"))losexp("#levelchange");
 else return 2;
 printf("{\"ulevel\":%d,\"ulevelmax\":%d,\"ulevelpeak\":%d,\"uexp\":%ld,\"uhp\":%d,\"uhpmax\":%d,\"uhppeak\":%d,\"uen\":%d,\"uenmax\":%d,\"uenpeak\":%d,\"hpinc\":%d,\"eninc\":%d,\"botl\":%s,\"rng\":\"%s\",\"messages\":\"%s\"}\n",u.ulevel,u.ulevelmax,u.ulevelpeak,u.uexp,u.uhp,u.uhpmax,u.uhppeak,u.uen,u.uenmax,u.uenpeak,slot<30?u.uhpinc[slot]:0,slot<30?u.ueninc[slot]:0,disp.botl?"true":"false",rng,messages);
 return 0;
}
