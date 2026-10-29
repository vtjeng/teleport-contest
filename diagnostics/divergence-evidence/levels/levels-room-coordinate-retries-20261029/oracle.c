#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <assert.h>
#include <setjmp.h>
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

typedef int boolean;typedef int16_t coordxy;typedef uint32_t getloc_flags_t;typedef long packed_coord;
typedef struct {coordxy x,y;}coord;
typedef struct {coordxy x,y;int is_random;getloc_flags_t getloc_flags;}unpacked_coord;
#define TRUE 1
#define FALSE 0
#define COLNO 80
#define ROWNO 21
#define ROOMOFFSET 3
#define DRY 1
#define WET 2
#define HOT 4
#define SOLID 8
#define ANY_LOC 16
#define NO_LOC_WARN 32
#define SPACELOC 64
#define BOULDER 0
#define IS_OBSTRUCTED(typ) ((typ) < POOL)
#define SPACE_POS(typ) ((typ) > DOOR)
#define IS_WALL(typ) ((typ) && (typ) <= DBWALL)
#define SP_COORD_IS_RANDOM 0x01000000L
#define SP_COORD_X(l) ((l)&0xff)
#define SP_COORD_Y(l) (((l)>>16)&0xff)
struct mkroom{coordxy lx,hx,ly,hy;int irregular,nsubrooms;struct mkroom*sbrooms[1];};
static struct {struct mkroom rooms[2];}svr;
static struct {int typ,edge,roomno;}levl[COLNO][ROWNO];
static struct {int xstart,xsize,x_maze_max;}gx;
static struct {int ystart,ysize,y_maze_max;}gy;
static struct {int uz;}u;
#define Is_waterlevel(p) 0
static boolean(*is_ok_location_func)(coordxy,coordxy)=NULL;
static int isok(int x,int y){return x>0&&x<COLNO&&y>=0&&y<ROWNO;}
/* Empty object grid and nonwater fixture; excluded branches fail loudly. */
static void*sobj_at(int o,int x,int y){assert(o==BOULDER&&isok(x,y));return NULL;}
static int is_pool(int x,int y){abort();}
static int is_lava(int x,int y){abort();}
static void impossible(const char*s){abort();}
static jmp_buf failure;
static void panic(const char*s){longjmp(failure,1);}
static int calls,tape[220];
static int rn2(int n){assert(calls<220);int v=tape[calls++];assert(v>=0&&v<n);return v;}
static int rn1(int n,int b){return b+rn2(n);}

int
somex(struct mkroom *croom)
{
    return rn1(croom->hx - croom->lx + 1, croom->lx);
}

int
somey(struct mkroom *croom)
{
    return rn1(croom->hy - croom->ly + 1, croom->ly);
}

boolean
inside_room(struct mkroom *croom, coordxy x, coordxy y)
{
    if (croom->irregular) {
        int i = (int) ((croom - svr.rooms) + ROOMOFFSET);
        return (!levl[x][y].edge && (int) levl[x][y].roomno == i);
    }

    return (boolean) (x >= croom->lx - 1 && x <= croom->hx + 1
                      && y >= croom->ly - 1 && y <= croom->hy + 1);
}

boolean
somexy(struct mkroom *croom, coord *c)
{
    int try_cnt = 0;
    int i;

    if (croom->irregular) {
        i = (int) ((croom - svr.rooms) + ROOMOFFSET);

        while (try_cnt++ < 100) {
            c->x = somex(croom);
            c->y = somey(croom);
            if (!levl[c->x][c->y].edge && (int) levl[c->x][c->y].roomno == i)
                return TRUE;
        }
        /* try harder; exhaustively search until one is found */
        for (c->x = croom->lx; c->x <= croom->hx; c->x++)
            for (c->y = croom->ly; c->y <= croom->hy; c->y++)
                if (!levl[c->x][c->y].edge
                    && (int) levl[c->x][c->y].roomno == i)
                    return TRUE;
        return FALSE;
    }

    if (!croom->nsubrooms) {
        c->x = somex(croom);
        c->y = somey(croom);
        return TRUE;
    }

    /* Check that coords doesn't fall into a subroom or into a wall */

    while (try_cnt++ < 100) {
        c->x = somex(croom);
        c->y = somey(croom);
        if (IS_WALL(levl[c->x][c->y].typ))
            continue;
        for (i = 0; i < croom->nsubrooms; i++)
            if (inside_room(croom->sbrooms[i], c->x, c->y))
                goto you_lose;
        break;
 you_lose:
        ;
    }
    if (try_cnt >= 100)
        return FALSE;
    return TRUE;
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

void
get_location(
    coordxy *x, coordxy *y,
    getloc_flags_t humidity,
    struct mkroom *croom)
{
    int cpt = 0;
    int mx, my, sx, sy;

    if (croom) {
        mx = croom->lx;
        my = croom->ly;
        sx = croom->hx - mx + 1;
        sy = croom->hy - my + 1;
    } else {
        mx = gx.xstart;
        my = gy.ystart;
        sx = gx.xsize;
        sy = gy.ysize;
    }

    if (*x >= 0) { /* normal locations */
        *x += mx;
        *y += my;
    } else { /* random location */
        do {
            if (croom) { /* handle irregular areas */
                coord tmpc;
                (void) somexy(croom, &tmpc);
                *x = tmpc.x;
                *y = tmpc.y;
            } else {
                *x = mx + rn2((int) sx);
                *y = my + rn2((int) sy);
            }
            if (is_ok_location(*x, *y, humidity))
                break;
        } while (++cpt < 100);
        if (cpt >= 100) {
            int xx, yy;

            /* last try */
            for (xx = 0; xx < sx; xx++)
                for (yy = 0; yy < sy; yy++) {
                    *x = mx + xx;
                    *y = my + yy;
                    if (is_ok_location(*x, *y, humidity))
                        goto found_it;
                }
            if (!(humidity & NO_LOC_WARN)) {
                impossible("get_location:  can't find a place!");
            } else {
                *x = *y = -1;
            }
        }
    }
 found_it:
    ;

    if (!(humidity & ANY_LOC) && !isok(*x, *y)) {
        if (!(humidity & NO_LOC_WARN)) {
            /*warning("get_location:  (%d,%d) out of bounds", *x, *y);*/
            *x = gx.x_maze_max;
            *y = gy.y_maze_max;
        } else {
            *x = *y = -1;
        }
    }
}

unpacked_coord
get_unpacked_coord(long loc, int defhumidity)
{
    static unpacked_coord c;

    if (loc & SP_COORD_IS_RANDOM) {
        c.x = c.y = -1;
        c.is_random = 1;
        c.getloc_flags = (getloc_flags_t)(loc & ~SP_COORD_IS_RANDOM);
        if (!c.getloc_flags)
            c.getloc_flags = defhumidity;
    } else {
        c.is_random = 0;
        c.getloc_flags = defhumidity;
        c.x = SP_COORD_X(loc);
        c.y = SP_COORD_Y(loc);
    }
    return c;
}

void
get_location_coord(
    coordxy *x, coordxy *y,
    int humidity,
    struct mkroom *croom,
    long crd)
{
    unpacked_coord c;

    c = get_unpacked_coord(crd, humidity);
    *x = c.x;
    *y = c.y;
    get_location(x, y, c.getloc_flags | (c.is_random ? NO_LOC_WARN : 0),
                 croom);

    if (*x == -1 && *y == -1 && c.is_random)
        get_location(x, y, humidity, croom);
}

void
get_room_loc(coordxy *x, coordxy *y, struct mkroom *croom)
{
    coord c;

    if (*x < 0 && *y < 0) {
        if (somexy(croom, &c)) {
            *x = c.x;
            *y = c.y;
        } else
            panic("get_room_loc : can't find a place!");
    } else {
        if (*x < 0)
            *x = rn2(croom->hx - croom->lx + 1);
        if (*y < 0)
            *y = rn2(croom->hy - croom->ly + 1);
        *x += croom->lx;
        *y += croom->ly;
    }
}

void
get_free_room_loc(
    coordxy *x, coordxy *y,
    struct mkroom *croom,
    packed_coord pos)
{
    coordxy try_x, try_y;
    int trycnt = 0;

    get_location_coord(&try_x, &try_y, DRY, croom, pos);
    if (levl[try_x][try_y].typ != ROOM) {
        do {
            try_x = *x, try_y = *y;
            get_room_loc(&try_x, &try_y, croom);
        } while (levl[try_x][try_y].typ != ROOM && ++trycnt <= 100);

        if (trycnt > 100)
            panic("get_free_room_loc:  can't find a place!");
    }
    *x = try_x, *y = try_y;
}

int main(int argc,char**argv){assert(argc==4);int random=atoi(argv[1]),success=atoi(argv[2]),direct=atoi(argv[3]);assert(random==0||random==1);assert(success>=1&&success<=102);struct mkroom*r=&svr.rooms[0];*r=(struct mkroom){.lx=10,.hx=14,.ly=6,.hy=8};for(int x=10;x<=14;x++)for(int y=6;y<=8;y++)levl[x][y].typ=ROOM;levl[10][6].typ=direct?ROOM:FOUNTAIN;
int offset=random?2:0;for(int i=0;i<220;i++)tape[i]=0;tape[offset+2*(success-1)]=1;
coordxy x=-1,y=-1;int failed=setjmp(failure);if(!failed)get_free_room_loc(&x,&y,r,random?SP_COORD_IS_RANDOM:0);
printf("%d %d %d %d\n",failed,(int)x,(int)y,calls);return 0;}
