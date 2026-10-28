#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
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
typedef int boolean;typedef int coordxy;typedef signed char schar;typedef unsigned getloc_flags_t;
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
#define IS_OBSTRUCTED(typ) ((typ) < POOL)
#define SPACE_POS(typ) ((typ) > DOOR)
#define IS_FURNITURE(typ) ((typ) >= STAIRS && (typ) <= ALTAR)
static struct {int typ; unsigned drawbridgemask;} levl[COLNO][ROWNO];
static struct {int uz;} u;
static int juiblex;
#define Is_juiblex_level(p) juiblex
#define Is_waterlevel(p) 0
static int (*is_ok_location_func)(int,int)=NULL;
static int isok(int x,int y){return x>0&&x<COLNO&&y>=0&&y<ROWNO;}
static void*sobj_at(int o,int x,int y){(void)o;(void)x;(void)y;abort();}
static int t_at(int x,int y){(void)x;(void)y;return 0;}
static int invocation_pos(int x,int y){(void)x;(void)y;return 0;}
static boolean
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
static boolean
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
static boolean
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
static boolean
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
static boolean
occupied(coordxy x, coordxy y)
{
    return (boolean) (t_at(x, y) || IS_FURNITURE(levl[x][y].typ)
                      || is_lava(x, y) || is_pool(x, y)
                      || invocation_pos(x, y));
}
int main(void){int typ,mask,humidity;while(scanf("%d%d%d%d",&typ,&mask,&juiblex,&humidity)==4){assert(typ>=0&&typ<MAX_TYPE);assert(humidity==0||humidity==2||humidity==4||humidity==6);levl[11][5].typ=typ;levl[11][5].drawbridgemask=mask;printf("%d %d\n",!!is_ok_location(11,5,humidity),!!occupied(11,5));}return 0;}
