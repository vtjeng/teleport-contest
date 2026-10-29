#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
typedef signed char schar;typedef int boolean;typedef short coordxy;
#define COLNO 80
#define ROWNO 21
#define TRUE 1
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
#define IS_WALL(typ) ((typ) && (typ) <= DBWALL)
#define IS_OBSTRUCTED(typ) ((typ) < POOL)      /* absolutely nonaccessible */
#define ICED_POOL 8
#define ICED_MOAT 16
static struct {int typ,lit,icedpool;} levl[COLNO][ROWNO];
static struct {int nroom;} svn;
struct room {int rlit;};
static struct {struct room rooms[80];} svr;
static void wallify_map(int a,int b,int c,int d){(void)a;(void)b;(void)c;(void)d;assert(!"walled outside this proof");}
static void
finish_map(
    schar fg_typ,
    schar bg_typ,
    boolean lit,
    boolean walled,
    boolean icedpools)
{
    coordxy x, y;

    if (walled)
        wallify_map(1, 0, COLNO-1, ROWNO-1);

    if (lit) {
        for (x = 1; x < COLNO; x++)
            for (y = 0; y < ROWNO; y++)
                if ((!IS_OBSTRUCTED(fg_typ) && levl[x][y].typ == fg_typ)
                    || (!IS_OBSTRUCTED(bg_typ) && levl[x][y].typ == bg_typ)
                    || (bg_typ == TREE && levl[x][y].typ == bg_typ)
                    || (walled && IS_WALL(levl[x][y].typ)))
                    levl[x][y].lit = TRUE;
        for (x = 0; x < svn.nroom; x++)
            svr.rooms[x].rlit = 1;
    }
    /* light lava even if everything's otherwise unlit;
       ice might be frozen pool rather than frozen moat */
    for (x = 1; x < COLNO; x++)
        for (y = 0; y < ROWNO; y++) {
            if (levl[x][y].typ == LAVAPOOL)
                levl[x][y].lit = TRUE;
            else if (levl[x][y].typ == ICE)
                levl[x][y].icedpool = icedpools ? ICED_POOL : ICED_MOAT;
        }
}
int main(int argc,char**argv){assert(argc==5);int fg=atoi(argv[1]),bg=atoi(argv[2]),lit=atoi(argv[3]),ice=atoi(argv[4]);assert((lit==0||lit==1)&&(ice==0||ice==1));
/* Fresh map, init_map clears lit; no rooms. Input is terrain ONLY. */
for(int x=1;x<COLNO;x++)for(int y=0;y<ROWNO;y++){int typ;assert(scanf("%d",&typ)==1);assert(typ==fg||typ==bg);levl[x][y].typ=typ;}
finish_map(fg,bg,lit,0,ice);
for(int x=1;x<COLNO;x++)for(int y=0;y<ROWNO;y++)printf("%d %d\n",levl[x][y].lit,levl[x][y].icedpool);
return 0;}
