#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <stdarg.h>
enum levl_typ_types {
    STONE     =  0,
    VWALL     =  1,
    HWALL     =  2,
    TLCORNER  =  3,
    TRCORNER  =  4,
    BLCORNER  =  5,
    BRCORNER  =  6,
    CROSSWALL =  7, /* For pretty mazes and special levels */
    TUWALL    =  8,
    TDWALL    =  9,
    TLWALL    = 10,
    TRWALL    = 11,
    DBWALL    = 12,
    TREE      = 13, /* KMH */
    SDOOR     = 14,
    SCORR     = 15,
    POOL      = 16,
    MOAT      = 17, /* pool that doesn't boil, adjust messages */
    WATER     = 18,
    DRAWBRIDGE_UP = 19,
    LAVAPOOL  = 20,
    LAVAWALL  = 21,
    IRONBARS  = 22, /* KMH */
    DOOR      = 23,
    CORR      = 24,
    ROOM      = 25,
    STAIRS    = 26,
    LADDER    = 27,
    FOUNTAIN  = 28,
    THRONE    = 29,
    SINK      = 30,
    GRAVE     = 31,
    ALTAR     = 32,
    ICE       = 33,
    DRAWBRIDGE_DOWN = 34,
    AIR       = 35,
    CLOUD     = 36,

    MAX_TYPE  = 37,
    /* for special levels */
    MATCH_WALL = 38,

    /* these aren't levl[][].typ values, they're additional indices
       into terrain_descr[] for status feedback */
    xFLOOR     = 39,
    xGROUND    = 40,
    xOPENDOOR  = 41,
    xSHUTDOOR  = 42,
    xSWAMP     = 43,
    xSUBMERGED = 44,
    xSEA       = 45,
    xWATERWALL = 46,

    INVALID_TYPE = 127
};

typedef int boolean;typedef int coordxy;typedef signed char schar;typedef unsigned getloc_flags_t;typedef struct{int dnum,dlevel;}d_level;
#define TRUE 1
#define FALSE 0
#define COLNO 80
#define ROWNO 21
#define DB_UNDER 28
#define DB_MOAT 0
#define DB_LAVA 4
#define DRY 1
#define WET 2
#define HOT 4
#define SOLID 8
#define ANY_LOC 16
#define SPACELOC 64
#define BOULDER 0
#define IS_OBSTRUCTED(typ) ((typ)<POOL)
#define SPACE_POS(typ) ((typ)>DOOR)
#define IS_LAVA(typ) ((typ)==LAVAPOOL || (typ)==LAVAWALL)
#define IS_FOUNTAIN(typ) ((typ)==FOUNTAIN)
#define IS_SINK(typ) ((typ)==SINK)
#define SET_LIT_RANDOM -1
#define SET_LIT_NOCHANGE -2
#define CAN_OVERWRITE_TERRAIN(ttyp) \
    (iflags.debug_overwrite_stairs || !((ttyp) == LADDER || (ttyp) == STAIRS))
#define EXTRA_SANITY_CHECKS
#define MELT_ICE_AWAY 0
#define Lassigned(y) ((y)->dlevel || (y)->dnum)
#define Lcheck(x,z) (Lassigned(z) && on_level(x, z))
#define Is_waterlevel(x)    (Lcheck(x, &water_level))
#define Is_juiblex_level(p) 0
static d_level water_level={2,1};static struct{d_level uz;}u;
static struct{int debug_overwrite_stairs;}iflags;
static struct{int typ;unsigned lit:1;unsigned arboreal_sdoor:1;unsigned drawbridgemask;}levl[COLNO][ROWNO];
static int cb,cb_calls,draw,draws,diagnostics,fountains,sinks;
static int callback(int x,int y){assert(x==10&&y==6);cb_calls++;return cb;}
static int (*is_ok_location_func)(int,int);
static int isok(int x,int y){return x>0&&x<COLNO&&y>=0&&y<ROWNO;}
static void*sobj_at(int o,int x,int y){(void)o;assert(x==10&&y==6);return NULL;} /* empty construction square */
static void impossible(const char*fmt,...){(void)fmt;diagnostics++;}
static int rn2(int n){assert(n==2);draws++;return draw;}
static int is_ice(int x,int y){assert(levl[x][y].typ!=ICE&&levl[x][y].typ!=DRAWBRIDGE_UP);return 0;} /* old terrain excludes ice/bridge */
static void obj_ice_effects(int x,int y,int b){(void)x;(void)y;(void)b;abort();}
static void spot_stop_timers(int x,int y,int a){(void)x;(void)y;(void)a;abort();}
static void count_level_features(void){fountains=levl[10][6].typ==FOUNTAIN;sinks=levl[10][6].typ==SINK;} /* one non-STONE square */
boolean
on_level(d_level *lev1, d_level *lev2)
{
    return (boolean) (lev1->dnum == lev2->dnum
                      && lev1->dlevel == lev2->dlevel);
}

boolean
is_moat(coordxy x, coordxy y)
{
    schar ltyp;

    if (!isok(x, y))
        return FALSE;
    ltyp = levl[x][y].typ;
    if (!Is_juiblex_level(&u.uz)
        && (ltyp == MOAT
            || (ltyp == DRAWBRIDGE_UP
                && (levl[x][y].drawbridgemask & DB_UNDER) == DB_MOAT)))
        return TRUE;
    return FALSE;
}

boolean
is_pool(coordxy x, coordxy y)
{
    schar ltyp;

    if (!isok(x, y))
        return FALSE;
    ltyp = levl[x][y].typ;
    /* The ltyp == MOAT is not redundant with is_moat, because the
     * Juiblex level does not have moats, although it has MOATs. There
     * is probably a better way to express this. */
    if (ltyp == POOL || ltyp == MOAT || ltyp == WATER || is_moat(x, y))
        return TRUE;
    return FALSE;
}

boolean
is_lava(coordxy x, coordxy y)
{
    schar ltyp;

    if (!isok(x, y))
        return FALSE;
    ltyp = levl[x][y].typ;
    if (ltyp == LAVAPOOL || ltyp == LAVAWALL
        || (ltyp == DRAWBRIDGE_UP
            && (levl[x][y].drawbridgemask & DB_UNDER) == DB_LAVA))
        return TRUE;
    return FALSE;
}

boolean
is_ok_location(coordxy x, coordxy y, getloc_flags_t humidity)
{
    int typ = levl[x][y].typ;

    if (Is_waterlevel(&u.uz))
        return TRUE; /* accept any spot */

    if (is_ok_location_func)
        return is_ok_location_func(x, y);

    /* TODO: Should perhaps check if wall is diggable/passwall? */
    if (humidity & ANY_LOC)
        return TRUE;

    if ((humidity & SOLID) && IS_OBSTRUCTED(typ))
        return TRUE;

    if ((humidity & (DRY|SPACELOC)) && SPACE_POS(typ)) {
        boolean bould = (sobj_at(BOULDER, x, y) != NULL);

        if (!bould || (bould && (humidity & SOLID)))
            return TRUE;
    }
    if ((humidity & WET) && is_pool(x, y))
        return TRUE;
    if ((humidity & HOT) && is_lava(x, y))
        return TRUE;
    return FALSE;
}

boolean
set_levltyp(coordxy x, coordxy y, schar newtyp)
{
    if (isok(x, y) && newtyp >= STONE && newtyp < MAX_TYPE) {
        schar oldtyp = levl[x][y].typ;

        /* hack for secret doors in garden theme rooms */
        if (oldtyp == SDOOR && newtyp == AIR) {
            /* levl[][].typ stays SDOOR rather than change to AIR */
            levl[x][y].arboreal_sdoor = 1;
            return TRUE;
        }

        if (CAN_OVERWRITE_TERRAIN(oldtyp)) {
            /* typ==ICE || (typ==DRAWBRIDGE_UP && drawbridgemask==DB_ICE) */
            boolean was_ice = is_ice(x, y);

            levl[x][y].typ = newtyp;
            /* TODO?
             *  if oldtyp used flags or horizontal differently from
             *  the way newtyp will use them, clear them.
             */

            if (IS_LAVA(newtyp)) /* [what about IS_LAVA(oldtyp)=>.lit = 0?] */
                levl[x][y].lit = 1;
            if (was_ice && newtyp != ICE) {
                /* frozen corpses resume rotting, no more ice to melt away */
                obj_ice_effects(x, y, TRUE);
                spot_stop_timers(x, y, MELT_ICE_AWAY);
            }
            if ((IS_FOUNTAIN(oldtyp) != IS_FOUNTAIN(newtyp))
                || (IS_SINK(oldtyp) != IS_SINK(newtyp)))
                count_level_features(); /* level.flags.nfountains,nsinks */

            return TRUE;
        }
#ifdef EXTRA_SANITY_CHECKS
    } else {
        impossible("set_levltyp(%d,%d,%d)%s%s",
                   (int) x, (int) y, (int) newtyp,
                   !isok(x, y) ? " not isok()" : "",
                   (newtyp < STONE || newtyp >= MAX_TYPE) ? " bad type" : "");
#endif /*EXTRA_SANITY_CHECKS*/
    }
    return FALSE;
}

boolean
set_levltyp_lit(coordxy x, coordxy y, schar typ, schar lit)
{
    boolean ret = set_levltyp(x, y, typ);

    if (ret && isok(x, y)) {
        if (lit != SET_LIT_NOCHANGE) {
#ifdef EXTRA_SANITY_CHECKS
            if (lit < SET_LIT_NOCHANGE || lit > 1)
                impossible("set_levltyp_lit(%d,%d,%d,%d)",
                           (int) x, (int) y, (int) typ, (int) lit);
#endif /*EXTRA_SANITY_CHECKS*/
            if (IS_LAVA(typ))
                lit = 1;
            else if (lit == SET_LIT_RANDOM)
                lit = rn2(2);

            levl[x][y].lit = lit;
        }
    }
    return ret;
}
int main(void){int op,a,b,c,d,e,f;while(scanf("%d %d %d %d %d %d %d",&op,&a,&b,&c,&d,&e,&f)==7){
if(op==0){levl[10][6].typ=a;levl[10][6].drawbridgemask=0;u.uz=b==2?(d_level){2,1}:b==1?(d_level){2,2}:(d_level){0,1};cb=c;cb_calls=0;is_ok_location_func=cb<0?NULL:callback;int r=is_ok_location(10,6,d);printf("%d %d\n",r,cb_calls);}
else {levl[10][6].typ=a;levl[10][6].lit=d;levl[10][6].arboreal_sdoor=0;fountains=a==FOUNTAIN;sinks=a==SINK;draw=e;draws=diagnostics=0;int r=set_levltyp_lit(10,6,b,c);printf("%d %d %d %d %d %d %d %d\n",r,levl[10][6].typ,levl[10][6].lit,levl[10][6].arboreal_sdoor,draws,diagnostics,fountains,sinks);}}
return 0;}
