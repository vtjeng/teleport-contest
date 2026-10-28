#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
typedef signed char schar;typedef int boolean;typedef short xint16;
#define TRUE 1
#define FALSE 0
#define panic(...) abort()
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
#define IS_STWALL(typ) ((typ) <= DBWALL) /* STONE <= (typ) <= DBWALL */
#define TYP_CANNOT_MATCH(t) ((t)==MAX_TYPE || (t)==-1)
struct { schar typ; } levl[80][21];
struct mapfragment { char *data; int wid,hei; };
int isok(int x,int y){return x>=1&&x<=79&&y>=0&&y<=20;}
static const struct {
    char ch;
    schar typ;
} char2typ[] = {
                { ' ', STONE },
                { '#', CORR },
                { '.', ROOM },
                { '-', HWALL },
                { '-', TLCORNER },
                { '-', TRCORNER },
                { '-', BLCORNER },
                { '-', BRCORNER },
                { '-', CROSSWALL },
                { '-', TUWALL },
                { '-', TDWALL },
                { '-', TLWALL },
                { '-', TRWALL },
                { '-', DBWALL },
                { '|', VWALL },
                { '+', DOOR },
                { 'A', AIR },
                { 'C', CLOUD },
                { 'S', SDOOR },
                { 'H', SCORR },
                { '{', FOUNTAIN },
                { '\\', THRONE },
                { 'K', SINK },
                { '}', MOAT },
                { 'P', POOL },
                { 'L', LAVAPOOL },
                { 'Z', LAVAWALL },
                { 'I', ICE },
                { 'W', WATER },
                { 'T', TREE },
                { 'F', IRONBARS }, /* Fe = iron */
                { 'x', MAX_TYPE }, /* "see-through" */
                { 'B', CROSSWALL }, /* hack: boundary location */
                { 'w', MATCH_WALL }, /* IS_STWALL() */
                { '\0', STONE },
};
schar splev_chr2typ(char c)
{
    int i;

    for (i = 0; char2typ[i].ch; i++)
        if (c == char2typ[i].ch)
            return char2typ[i].typ;
    return (INVALID_TYPE);
}
schar mapfrag_get(struct mapfragment *mf, int x, int y)
{
    if (y < 0 || x < 0 || y > mf->hei - 1 || x > mf->wid - 1)
        panic("outside mapfrag (%i,%i), wanted (%i,%i)",
              mf->wid, mf->hei, x, y);
    return splev_chr2typ(mf->data[y * (mf->wid + 1) + x]);
}
boolean match_maptyps(xint16 typ, xint16 levltyp)
{
    if ((typ == MATCH_WALL) && !IS_STWALL(levltyp))
        return FALSE;
    if ((typ < MAX_TYPE) && (typ != levltyp))
        return FALSE;
    return TRUE;
}
boolean mapfrag_canmatch(struct mapfragment *mf)
{
    return ((mf->wid % 2) && (mf->hei % 2));
}
boolean mapfrag_match(struct mapfragment *mf,  int x, int y)
{
    int rx, ry;

    for (rx = -(mf->wid / 2); rx <= (mf->wid / 2); rx++)
        for (ry = -(mf->hei / 2); ry <= (mf->hei / 2); ry++) {
            schar mapc = mapfrag_get(mf, rx + (mf->wid / 2),
                                     ry + (mf->hei / 2));
            schar levc = isok(x+rx, y+ry) ? levl[x+rx][y+ry].typ : STONE;

            if (!match_maptyps(mapc, levc))
                return FALSE;
        }
    return TRUE;
}
int main(int argc,char **argv){
 if(argc!=2)return 2;int center=atoi(argv[1]);
 /* Public terrain setup: floor, wall, floor at three valid absolute cells. */
 levl[center-1][10].typ=ROOM;levl[center][10].typ=VWALL;levl[center+1][10].typ=ROOM;
 /* Literal single-line no-digit pattern: mapfrag_fromstr gives width=5,height=1. */
 struct mapfragment mf={"[.w.]",5,1};
 assert(mapfrag_canmatch(&mf));assert(!TYP_CANNOT_MATCH(mapfrag_get(&mf,2,0)));
 /* l_selection_match iteration, clipped storage has the normal map dimensions. */
 for(int x=1;x<80;x++)for(int y=0;y<21;y++)if(mapfrag_match(&mf,x,y))printf("%d,%d\n",x,y);
}
