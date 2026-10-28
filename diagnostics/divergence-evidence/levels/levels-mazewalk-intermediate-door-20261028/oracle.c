/* Exact upstream bodies with fixed terrain storage and checked RNG replay. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef int coordxy;typedef int xint16;typedef int boolean;typedef signed char schar;
typedef struct {int x,y;} coord;
#define COLNO 80
#define ROWNO 21
#define STONE 0
#define HWALL 2
#define DOOR 23
#define CORR 24
#define ROOM 25
#define TRUE 1
#define FALSE 0
#define ACCESSIBLE(t) ((t)>=DOOR)
#define IS_DOOR(t) ((t)==DOOR)
struct {int typ,flags;} levl[COLNO][ROWNO];
struct {int x_maze_max;} gx={78};struct {int y_maze_max;} gy={20};
struct {struct {struct {int corrmaze;} flags;} level;} svl;
static int calls;
static int rn2(int n){assert(n==1);calls++;return 0;}
static int rnd(int n){return rn2(n)+1;}
static int isok(int x,int y){return x>0&&x<COLNO&&y>=0&&y<ROWNO;}
#define panic(...) abort()
#define mz_move(X, Y, dir) \
    do {                                                         \
        switch (dir) {                                           \
        case 0:  --(Y);  break;                                  \
        case 1:  (X)++;  break;                                  \
        case 2:  (Y)++;  break;                                  \
        case 3:  --(X);  break;                                  \
        default: panic("mz_move: bad direction %d", dir);        \
        }                                                        \
    } while (0)
static int
okay(coordxy x, coordxy y, coordxy dir)
{
    mz_move(x, y, dir);
    mz_move(x, y, dir);
    if (x < 3 || y < 3 || x > gx.x_maze_max || y > gy.y_maze_max
        || levl[x][y].typ != STONE)
        return FALSE;
    return TRUE;
}
void
walkfrom(coordxy x, coordxy y, schar typ)
{
    int q, a, dir;
    int dirs[4];

    if (!typ) {
        if (svl.level.flags.corrmaze)
            typ = CORR;
        else
            typ = ROOM;
    }

    if (!IS_DOOR(levl[x][y].typ)) {
        /* might still be on edge of MAP, so don't overwrite */
        levl[x][y].typ = typ;
        levl[x][y].flags = 0;
    }

    while (1) {
        q = 0;
        for (a = 0; a < 4; a++)
            if (okay(x, y, a))
                dirs[q++] = a;
        if (!q)
            return;
        dir = dirs[rn2(q)];
        mz_move(x, y, dir);
        levl[x][y].typ = typ;
        mz_move(x, y, dir);
        walkfrom(x, y, typ);
    }
}

typedef long lua_Integer;typedef struct {int midpoint,typ;} lua_State;
#define ANY_LOC 1
#define SP_COORD_PACK(x,y) (((x)&0xff)+(((y)&0xff)<<16))
#define W_NORTH 1
#define W_SOUTH 2
#define W_EAST 4
#define W_WEST 8
#define W_RANDOM -1
static struct {struct {void*croom;}*coder;} gc;
static void create_des_coder(void){static struct {void*croom;} coder;gc.coder=(void*)&coder;}
static int lua_gettop(lua_State*L){(void)L;return 1;}
static int luaL_checkinteger(lua_State*L,int i){(void)L;(void)i;abort();}
static int luaL_checkoption(lua_State*L,int i,const char*d,const char*const*o){(void)L;(void)i;(void)d;(void)o;abort();}
static void lcheck_param_table(lua_State*L){assert(L);}
static void get_table_xy_or_coord(lua_State*L,lua_Integer*x,lua_Integer*y){assert(L);*x=11;*y=11;}
static int get_table_mapchr_opt(lua_State*L,const char*k,int d){assert(!strcmp(k,"typ")&&d==ROOM);return L->typ;}
static int get_table_boolean_opt(lua_State*L,const char*k,int d){assert(L&&!strcmp(k,"stocked")&&d==1);return 0;}
static int get_table_option(lua_State*L,const char*k,const char*d,const char*const*o){assert(L&&!strcmp(k,"dir")&&!strcmp(d,"random")&&!strcmp(o[2],"east"));return 2;}
static void get_location_coord(coordxy*x,coordxy*y,int h,void*r,long c){assert(*x==11&&*y==11&&h==ANY_LOC&&!r&&c==SP_COORD_PACK(11,11));*x+=1;}
static void nhl_error(lua_State*L,const char*s){(void)L;(void)s;abort();}
static int random_wdir(void){abort();}static void impossible(const char*s){(void)s;abort();}static void fill_empty_maze(void){abort();}
int
lspo_mazewalk(lua_State *L)
{
    static const char *const mwdirs[] = {
        "north", "south", "east", "west", "random", NULL
    };
    static const int mwdirs2i[] = {
        W_NORTH, W_SOUTH, W_EAST, W_WEST, W_RANDOM, -2
    };
    coordxy x, y;
    lua_Integer mx, my;
    coordxy ftyp = ROOM;
    int fstocked = 1, dir = -1;
    long mcoord;
    int argc = lua_gettop(L);

    create_des_coder();

    if (argc == 3) {
        mx = luaL_checkinteger(L, 1);
        my = luaL_checkinteger(L, 2);
        dir = mwdirs2i[luaL_checkoption(L, 3, "random", mwdirs)];
    } else {
        lcheck_param_table(L);

        get_table_xy_or_coord(L, &mx, &my);
        ftyp = get_table_mapchr_opt(L, "typ", ROOM);
        fstocked = get_table_boolean_opt(L, "stocked", 1);
        dir = mwdirs2i[get_table_option(L, "dir", "random", mwdirs)];
    }

    mcoord = SP_COORD_PACK(mx, my);
    x = mx;
    y = my;

    get_location_coord(&x, &y, ANY_LOC, gc.coder->croom, mcoord);

    if (!isok(x, y)) {
        nhl_error(L, "mazewalk coord not ok");
        /*NOTREACHED*/
        return 0;
    }

    if (ftyp < 1) {
        ftyp = svl.level.flags.corrmaze ? CORR : ROOM;
    }

    if (dir == W_RANDOM)
        dir = random_wdir();

    /* don't use move() - it doesn't use W_NORTH, etc. */
    switch (dir) {
    case W_NORTH:
        --y;
        break;
    case W_SOUTH:
        y++;
        break;
    case W_EAST:
        x++;
        break;
    case W_WEST:
        --x;
        break;
    default:
        impossible("mazewalk: Bad direction");
    }

    if (!IS_DOOR(levl[x][y].typ)) {
        levl[x][y].typ = ftyp;
        levl[x][y].flags = 0;
    }

    /*
     * We must be sure that the parity of the coordinates for
     * walkfrom() is odd.  But we must also take into account
     * what direction was chosen.
     */
    if (!(x % 2)) {
        if (dir == W_EAST)
            x++;
        else
            x--;

        /* no need for IS_DOOR check; out of map bounds */
        levl[x][y].typ = ftyp;
        levl[x][y].flags = 0;
    }

    if (!(y % 2)) {
        if (dir == W_SOUTH)
            y++;
        else
            y--;
    }

    walkfrom(x, y, ftyp);
    if (fstocked)
        fill_empty_maze();

    return 0;
}

int main(int argc,char**argv){assert(argc==3);lua_State L={atoi(argv[1]),atoi(argv[2])};assert((L.midpoint==ROOM||L.midpoint==DOOR)&&(L.typ==ROOM||L.typ==CORR));for(int x=0;x<COLNO;x++)for(int y=0;y<ROWNO;y++)levl[x][y].typ=ROOM;levl[14][11].typ=L.midpoint;levl[15][11].typ=STONE;lspo_mazewalk(&L);printf("%d %d %d %d\n",levl[13][11].typ,levl[14][11].typ,levl[15][11].typ,calls);return 0;}
