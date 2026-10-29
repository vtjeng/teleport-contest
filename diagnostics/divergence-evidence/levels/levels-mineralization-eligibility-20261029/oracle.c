#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>
typedef int boolean;typedef int coordxy;typedef signed char schar;typedef struct{int dnum,dlevel;}d_level;
typedef struct s_level{d_level dlevel;struct{int town;}flags;struct s_level*next;}s_level;
struct obj{int ox,oy,owt,otyp;long quan;};
#define TRUE 1
#define FALSE 0
#define COLNO 80
#define ROWNO 21
#define STONE 0
#define POOL 16
#define MOAT 17
#define WATER 18
#define ROOM 25
#define W_NONDIGGABLE 8
#define KELP_FROND 0
#define GOLD_PIECE 0
#define GEM_CLASS 0
#define ROCK 0
#define Lassigned(y) ((y)->dlevel || (y)->dnum)
#define Lcheck(x,z) (Lassigned(z) && on_level(x, z))
#define Is_waterlevel(x)    (Lcheck(x, &water_level))
#define Is_rogue_level(x)   (Lcheck(x, &rogue_level))
#define Is_oracle_level(x)  (Lcheck(x, &oracle_level))
#define In_endgame(x) ((x)->dnum == astral_level.dnum)
static struct{d_level uz;}u;
static struct{struct{int num_dunlevs,depth_start;struct{int hellish;}flags;}dungeons[32];}svd;
static struct{s_level*sp_levchn;}svs;
static struct{struct{struct{int arboreal;}flags;}level;}svl;
static struct{int typ,wall_info;}levl[COLNO][ROWNO];
static s_level specials[128];static int mines_dnum,quest_dnum,tower_dnum;
static d_level water_level,astral_level,rogue_level,oracle_level;
static int draws[10000],ndraw,policy;
static int rn2(int n){assert(n>0&&ndraw<10000);draws[ndraw++]=n;return policy?n-1:0;}
static int rnd(int n){(void)n;abort();}
/* All resource-producing branches are outside this eligibility proof. */
static struct obj*mksobj_at(int t,int x,int y,int a,int b){(void)t;(void)x;(void)y;(void)a;(void)b;abort();}
static struct obj*mksobj(int t,int a,int b){(void)t;(void)a;(void)b;abort();}
static struct obj*mkobj(int t,int a){(void)t;(void)a;abort();}
static int weight(struct obj*p){(void)p;abort();}
static void add_to_buried(struct obj*p){(void)p;abort();}
static void place_object(struct obj*p,int x,int y){(void)p;(void)x;(void)y;abort();}
static void dealloc_obj(struct obj*p){(void)p;abort();}
boolean
on_level(d_level *lev1, d_level *lev2)
{
    return (boolean) (lev1->dnum == lev2->dnum
                      && lev1->dlevel == lev2->dlevel);
}

s_level *
Is_special(d_level *lev)
{
    s_level *levtmp;

    for (levtmp = svs.sp_levchn; levtmp; levtmp = levtmp->next)
        if (on_level(lev, &levtmp->dlevel))
            return levtmp;

    return (s_level *) 0;
}

boolean
In_hell(d_level *lev)
{
    return (boolean) (svd.dungeons[lev->dnum].flags.hellish);
}

boolean
In_quest(d_level *lev)
{
    return (boolean) (lev->dnum == quest_dnum);
}

boolean
In_mines(d_level *lev)
{
    return (boolean) (lev->dnum == mines_dnum);
}

boolean
In_V_tower(d_level *lev)
{
    return (boolean) (lev->dnum == tower_dnum);
}

schar
depth(d_level *lev)
{
    return (schar) (svd.dungeons[lev->dnum].depth_start + lev->dlevel - 1);
}

schar
dunlev(d_level *lev)
{
    return lev->dlevel;
}

boolean
water_has_kelp(coordxy x, coordxy y, int kelp_pool, int kelp_moat)
{
    if ((kelp_pool && (levl[x][y].typ == POOL
                       || (levl[x][y].typ == WATER && !Is_waterlevel(&u.uz)))
         && !rn2(kelp_pool))
        || (kelp_moat && levl[x][y].typ == MOAT && !rn2(kelp_moat)))
        return TRUE;
    return FALSE;
}

void
mineralize(int kelp_pool, int kelp_moat, int goldprob, int gemprob,
           boolean skip_lvl_checks)
{
    s_level *sp;
    struct obj *otmp;
    coordxy x, y;
    int cnt;

    if (kelp_pool < 0)
        kelp_pool = 10;
    if (kelp_moat < 0)
        kelp_moat = 30;

    /* Place kelp, except on the plane of water */
    if (!skip_lvl_checks && In_endgame(&u.uz))
        return;
    for (x = 2; x < (COLNO - 2); x++)
        for (y = 1; y < (ROWNO - 1); y++)
            if (water_has_kelp(x, y, kelp_pool, kelp_moat))
                (void) mksobj_at(KELP_FROND, x, y, TRUE, FALSE);

    /* determine if it is even allowed;
       almost all special levels are excluded */
    if (!skip_lvl_checks
        && (In_hell(&u.uz) || In_V_tower(&u.uz) || Is_rogue_level(&u.uz)
            || svl.level.flags.arboreal
            || ((sp = Is_special(&u.uz)) != 0 && !Is_oracle_level(&u.uz)
                && (!In_mines(&u.uz) || sp->flags.town))))
        return;

    /* basic level-related probabilities */
    if (goldprob < 0)
        goldprob = 20 + depth(&u.uz) / 3;
    if (gemprob < 0)
        gemprob = goldprob / 4;

    /* mines have ***MORE*** goodies - otherwise why mine? */
    if (!skip_lvl_checks) {
        if (In_mines(&u.uz)) {
            goldprob *= 2;
            gemprob *= 3;
        } else if (In_quest(&u.uz)) {
            goldprob /= 4;
            gemprob /= 6;
        }
    }

    /*
     * Seed rock areas with gold and/or gems.
     * We use fairly low level object handling to avoid unnecessary
     * overhead from placing things in the floor chain prior to burial.
     */
    for (x = 2; x < (COLNO - 2); x++)
        for (y = 1; y < (ROWNO - 1); y++)
            if (levl[x][y + 1].typ != STONE) { /* <x,y> spot not eligible */
                y += 2; /* next two spots aren't eligible either */
            } else if (levl[x][y].typ != STONE) { /* this spot not eligible */
                y += 1; /* next spot isn't eligible either */
            } else if (!(levl[x][y].wall_info & W_NONDIGGABLE)
                       && levl[x][y - 1].typ == STONE
                       && levl[x + 1][y - 1].typ == STONE
                       && levl[x - 1][y - 1].typ == STONE
                       && levl[x + 1][y].typ == STONE
                       && levl[x - 1][y].typ == STONE
                       && levl[x + 1][y + 1].typ == STONE
                       && levl[x - 1][y + 1].typ == STONE) {
                if (rn2(1000) < goldprob) {
                    if ((otmp = mksobj(GOLD_PIECE, FALSE, FALSE)) != 0) {
                        otmp->ox = x, otmp->oy = y;
                        otmp->quan = 1L + rnd(goldprob * 3);
                        otmp->owt = weight(otmp);
                        if (!rn2(3))
                            add_to_buried(otmp);
                        else
                            place_object(otmp, x, y);
                    }
                }
                if (rn2(1000) < gemprob) {
                    for (cnt = rnd(2 + dunlev(&u.uz) / 3); cnt > 0; cnt--)
                        if ((otmp = mkobj(GEM_CLASS, FALSE)) != 0) {
                            if (otmp->otyp == ROCK) {
                                dealloc_obj(otmp); /* discard it */
                            } else {
                                otmp->ox = x, otmp->oy = y;
                                if (!rn2(3))
                                    add_to_buried(otmp);
                                else
                                    place_object(otmp, x, y);
                            }
                        }
                }
            }
}
int main(void){int nd,ns;assert(scanf("%d",&nd)==1&&nd<32);for(int i=0;i<nd;i++)assert(scanf("%d%d%d",&svd.dungeons[i].num_dunlevs,&svd.dungeons[i].depth_start,&svd.dungeons[i].flags.hellish)==3);assert(scanf("%d",&ns)==1&&ns<128);for(int i=0;i<ns;i++){assert(scanf("%d%d%d",&specials[i].dlevel.dnum,&specials[i].dlevel.dlevel,&specials[i].flags.town)==3);specials[i].next=i+1<ns?&specials[i+1]:NULL;}svs.sp_levchn=ns?specials:NULL;assert(scanf("%d%d%d",&mines_dnum,&quest_dnum,&tower_dnum)==3);d_level*levels[]={&astral_level,&water_level,&rogue_level,&oracle_level};for(int i=0;i<4;i++)assert(scanf("%d%d",&levels[i]->dnum,&levels[i]->dlevel)==2);
int op,dnum,floor,a,b,c,d,e;while(scanf("%d%d%d%d%d%d%d%d",&op,&dnum,&floor,&a,&b,&c,&d,&e)==8){u.uz=(d_level){dnum,floor};assert(dnum>=0&&dnum<nd&&floor>=1&&floor<=svd.dungeons[dnum].num_dunlevs);ndraw=0;int result=0;
if(op==0){levl[10][6].typ=a;policy=d;result=water_has_kelp(10,6,b,c);}
else{for(int x=0;x<COLNO;x++)for(int y=0;y<ROWNO;y++){levl[x][y].typ=ROOM;levl[x][y].wall_info=0;}if(c)for(int x=9;x<=11;x++)for(int y=9;y<=11;y++)levl[x][y].typ=STONE;levl[20][5].typ=POOL;levl[22][5].typ=MOAT;levl[24][5].typ=WATER;svl.level.flags.arboreal=b;policy=1;mineralize(d,e,0,0,a);}
printf("%d",result);for(int i=0;i<ndraw;i++)printf(" %d",draws[i]);puts("");}return 0;}
