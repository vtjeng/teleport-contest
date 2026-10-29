#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef int coordxy;typedef signed char boolean;typedef unsigned char uchar;typedef short xint16;
#define COLNO 80
#define ROWNO 21
#define IS_WALL(t) ((t)>0&&(t)<=DBWALL)
#define IS_DOOR(t) ((t)==DOOR)
#define IS_STWALL(t) ((t)<=DBWALL)
struct rm {int typ;};static struct rm levl[80][21];
static struct {struct {struct{int x1,y1,x2,y2;}inarea;}bughack;}gb;
static int isok(int x,int y){return x>=1&&x<80&&y>=0&&y<21;}
static void panic(const char*s,...){abort();}
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
#define within_bounded_area(X, Y, LX, LY, HX, HY) \
    ((X) >= (LX) && (X) <= (HX) && (Y) >= (LY) && (Y) <= (HY))
int
iswall(coordxy x, coordxy y)
{
    int type;

    if (!isok(x, y))
        return 0;
    type = levl[x][y].typ;
    return (IS_WALL(type) || IS_DOOR(type)
            || type == LAVAWALL || type == WATER
            || type == SDOOR || type == IRONBARS);
}

int
iswall_or_stone(coordxy x, coordxy y)
{
    /* out of bounds = stone */
    if (!isok(x, y))
        return 1;

    return (levl[x][y].typ == STONE || iswall(x, y));
}

boolean
is_solid(coordxy x, coordxy y)
{
    return (boolean) (!isok(x, y) || IS_STWALL(levl[x][y].typ));
}

int
extend_spine(int locale[3][3], int wall_there, int dx, int dy)
{
    int spine, nx, ny;

    nx = 1 + dx;
    ny = 1 + dy;

    if (wall_there) { /* wall in that direction */
        if (dx) {
            if (locale[1][0] && locale[1][2]         /* EW are wall/stone */
                && locale[nx][0] && locale[nx][2]) { /* diag are wall/stone */
                spine = 0;
            } else {
                spine = 1;
            }
        } else { /* dy */
            if (locale[0][1] && locale[2][1]         /* NS are wall/stone */
                && locale[0][ny] && locale[2][ny]) { /* diag are wall/stone */
                spine = 0;
            } else {
                spine = 1;
            }
        }
    } else {
        spine = 0;
    }

    return spine;
}

void
wall_cleanup(coordxy x1, coordxy y1, coordxy x2, coordxy y2)
{
    uchar type;
    coordxy x, y;
    struct rm *lev;

    /* sanity check on incoming variables */
    if (x1 < 0 || x2 >= COLNO || x1 > x2 || y1 < 0 || y2 >= ROWNO || y1 > y2)
        panic("wall_cleanup: bad bounds (%d,%d) to (%d,%d)", x1, y1, x2, y2);

    /* change walls surrounded by rock to rock. */
    for (x = x1; x <= x2; x++)
        for (y = y1; y <= y2; y++) {
            if (within_bounded_area(x, y,
                                  gb.bughack.inarea.x1, gb.bughack.inarea.y1,
                                  gb.bughack.inarea.x2, gb.bughack.inarea.y2))
                continue;
            lev = &levl[x][y];
            type = lev->typ;
            if (IS_WALL(type) && type != DBWALL) {
                if (is_solid(x - 1, y - 1) && is_solid(x - 1, y)
                    && is_solid(x - 1, y + 1) && is_solid(x, y - 1)
                    && is_solid(x, y + 1) && is_solid(x + 1, y - 1)
                    && is_solid(x + 1, y) && is_solid(x + 1, y + 1))
                    lev->typ = STONE;
            }
        }
}

void
fix_wall_spines(coordxy x1, coordxy y1, coordxy x2, coordxy y2)
{
    uchar type;
    coordxy x, y;
    struct rm *lev;
    int (*loc_f)(coordxy, coordxy);
    int bits;
    int locale[3][3]; /* rock or wall status surrounding positions */

    /*
     * Value 0 represents a free-standing wall.  It could be anything,
     * so even though this table says VWALL, we actually leave whatever
     * typ was there alone.
     */
    static xint16 spine_array[16] = { VWALL, HWALL,    HWALL,    HWALL,
                                     VWALL, TRCORNER, TLCORNER, TDWALL,
                                     VWALL, BRCORNER, BLCORNER, TUWALL,
                                     VWALL, TLWALL,   TRWALL,   CROSSWALL };

    /* sanity check on incoming variables */
    if (x1 < 0 || x2 >= COLNO || x1 > x2 || y1 < 0 || y2 >= ROWNO || y1 > y2)
        panic("wall_extends: bad bounds (%d,%d) to (%d,%d)", x1, y1, x2, y2);

    /* set the correct wall type. */
    for (x = x1; x <= x2; x++)
        for (y = y1; y <= y2; y++) {
            lev = &levl[x][y];
            type = lev->typ;
            if (!(IS_WALL(type) && type != DBWALL))
                continue;

            /* set the locations TRUE if rock or wall or out of bounds */
            loc_f = within_bounded_area(x, y, /* for baalz insect */
                                   gb.bughack.inarea.x1, gb.bughack.inarea.y1,
                                   gb.bughack.inarea.x2, gb.bughack.inarea.y2)
                       ? iswall
                       : iswall_or_stone;
            locale[0][0] = (*loc_f)(x - 1, y - 1);
            locale[1][0] = (*loc_f)(x, y - 1);
            locale[2][0] = (*loc_f)(x + 1, y - 1);

            locale[0][1] = (*loc_f)(x - 1, y);
            locale[2][1] = (*loc_f)(x + 1, y);

            locale[0][2] = (*loc_f)(x - 1, y + 1);
            locale[1][2] = (*loc_f)(x, y + 1);
            locale[2][2] = (*loc_f)(x + 1, y + 1);

            /* determine if wall should extend to each direction NSEW */
            bits = (extend_spine(locale, iswall(x, y - 1), 0, -1) << 3)
                   | (extend_spine(locale, iswall(x, y + 1), 0, 1) << 2)
                   | (extend_spine(locale, iswall(x + 1, y), 1, 0) << 1)
                   | extend_spine(locale, iswall(x - 1, y), -1, 0);

            /* don't change typ if wall is free-standing */
            if (bits)
                lev->typ = spine_array[bits];
        }
}

void
wallification(coordxy x1, coordxy y1, coordxy x2, coordxy y2)
{
    wall_cleanup(x1, y1, x2, y2);
    fix_wall_spines(x1, y1, x2, y2);
}

int main(void){int kind,x,y,center,protect,mask;int types[8];while(scanf("%d%d%d%d%d%d",&kind,&x,&y,&center,&protect,&mask)==6){memset(levl,0,sizeof levl);for(int i=0;i<8;i++)assert(scanf("%d",&types[i])==1);gb.bughack.inarea.x1=protect?x:0;gb.bughack.inarea.x2=protect?x:0;gb.bughack.inarea.y1=protect?y:0;gb.bughack.inarea.y2=protect?y:0;int i=0;for(int dx=-1;dx<=1;dx++)for(int dy=-1;dy<=1;dy++)if(dx||dy){if(x+dx>=0&&x+dx<80&&y+dy>=0&&y+dy<21)levl[x+dx][y+dy].typ=types[i];i++;}levl[x][y].typ=center;if(kind)wallification(x,y,x,y);else fix_wall_spines(x,y,x,y);printf("%d\n",levl[x][y].typ);}return 0;}
