#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
typedef int boolean;typedef int coordxy;typedef long lua_Integer;
#define TRUE 1
#define FALSE 0
#define LUA_TTABLE 1
#define LUA_TSTRING 2
#define LUA_TNUMBER 3
#define DRY 1
#define SP_COORD_IS_RANDOM 0x01000000L
#define SP_COORD_PACK(x,y) (((x)&0xff)+(((y)&0xff)<<16))
#define SP_COORD_PACK_RANDOM(f) (SP_COORD_IS_RANDOM|(f))
#define LADDER 27
#define LA_UP 1
#define LA_DOWN 2
typedef struct {int dnum,dlevel;} d_level;
static struct {d_level uz;} u={{0,1}};
static struct {int typ,ladder;} levl[80][21];static int SpLev_Map[80][21];
static struct {struct {void*croom;}*coder;} gc;
typedef struct {int form,argc;} lua_State;
static int ox=1,oy=0,added,sx,sy,sup,sladder;static d_level destination;
static void create_des_coder(void){static struct {void*croom;} coder;gc.coder=(void*)&coder;}
static int lua_gettop(lua_State*L){return L->argc;}
static int lua_type(lua_State*L,int i){assert(i==1);return L->form<2?LUA_TTABLE:L->form==2?LUA_TSTRING:LUA_TNUMBER;}
static lua_Integer lua_tointeger(lua_State*L,int i){assert(L->argc==2&&(i==1||i==2));return 2;}
static void lcheck_param_table(lua_State*L){assert(L->form<2&&L->argc==1);}
static void get_table_xy_or_coord(lua_State*L,lua_Integer*x,lua_Integer*y){assert(L->form<2);*x=*y=2;}
static int get_table_option(lua_State*L,const char*k,const char*d,const char*const*o){assert(L->form<2&&!strcmp(k,"dir")&&!strcmp(d,"down")&&!strcmp(o[0],"down"));return 0;}
static int luaL_checkoption(lua_State*L,int i,const char*d,const char*const*o){assert(L->form==2&&i==1&&!strcmp(d,"down")&&!strcmp(o[0],"down"));return 0;}
static void lua_remove(lua_State*L,int i){assert(i==1&&L->argc==3);L->argc--;}
static int get_coord(lua_State*L,int i,lua_Integer*x,lua_Integer*y){(void)L;(void)i;(void)x;(void)y;abort();}
static int good_stair_loc(int x,int y){(void)x;(void)y;abort();}
static void set_ok_location_func(int(*f)(int,int)){assert(!f);}
static void get_location_coord(coordxy*x,coordxy*y,int h,void*r,long c){assert(*x==2&&*y==2&&h==DRY&&!r&&c==SP_COORD_PACK(2,2));*x+=ox;*y+=oy;}
struct trap {int unused;};static struct trap*t_at(int x,int y){assert(x==ox+2&&y==oy+2);return NULL;}
static void deltrap(struct trap*t){(void)t;abort();}
static void stairway_add(int x,int y,int up,int ladder,d_level*d){added++;sx=x;sy=y;sup=up;sladder=ladder;destination=*d;}
static void mkstairs(int x,int y,char up,void*r,int force){(void)x;(void)y;(void)up;(void)r;(void)force;abort();}
boolean
nhl_get_xy_params(lua_State *L, lua_Integer *x, lua_Integer *y)
{
    int argc = lua_gettop(L);
    boolean ret = FALSE;

    if (argc == 2) {
        *x = lua_tointeger(L, 1);
        *y = lua_tointeger(L, 2);
        ret = TRUE;
    } else if (argc == 1 && lua_type(L, 1) == LUA_TTABLE) {
        lua_Integer ax, ay;

        ret = get_coord(L, 1, &ax, &ay);
        *x = ax;
        *y = ay;
    }
    return ret;
}
int
l_create_stairway(lua_State *L, boolean using_ladder)
{
    static const char *const stairdirs[] = { "down", "up", NULL };
    static const int stairdirs2i[] = { 0, 1 };
    int argc = lua_gettop(L);
    coordxy x = -1, y = -1;
    struct trap *badtrap;

    long scoord;
    int up = 0; /* default is down */
    int ltype = lua_type(L, 1);

    create_des_coder();

    if (argc == 1 && ltype == LUA_TTABLE) {
        lua_Integer ax = -1, ay = -1;
        lcheck_param_table(L);
        get_table_xy_or_coord(L, &ax, &ay);
        up = stairdirs2i[get_table_option(L, "dir", "down", stairdirs)];
        x = (coordxy) ax;
        y = (coordxy) ay;
    } else {
        lua_Integer ix = -1, iy = -1;
        if (argc > 0 && ltype == LUA_TSTRING) {
            up = stairdirs2i[luaL_checkoption(L, 1, "down", stairdirs)];
            lua_remove(L, 1);
        }
        nhl_get_xy_params(L, &ix, &iy);
        x = (coordxy) ix;
        y = (coordxy) iy;
    }

    if (x == -1 && y == -1) {
        set_ok_location_func(good_stair_loc);
        scoord = SP_COORD_PACK_RANDOM(0);
    } else
        scoord = SP_COORD_PACK(x, y);

    get_location_coord(&x, &y, DRY, gc.coder->croom, scoord);
    set_ok_location_func(NULL);
    if ((badtrap = t_at(x, y)) != 0)
        deltrap(badtrap);
    SpLev_Map[x][y] = 1;

    if (using_ladder) {
        levl[x][y].typ = LADDER;
        if (up) {
            d_level dest;

            dest.dnum = u.uz.dnum;
            dest.dlevel = u.uz.dlevel - 1;
            stairway_add(x, y, TRUE, TRUE, &dest);
            levl[x][y].ladder = LA_UP;
        } else {
            d_level dest;

            dest.dnum = u.uz.dnum;
            dest.dlevel = u.uz.dlevel + 1;
            stairway_add(x, y, FALSE, TRUE, &dest);
            levl[x][y].ladder = LA_DOWN;
        }
    } else {
        mkstairs(x, y, (char) up, gc.coder->croom,
                 !(scoord & SP_COORD_IS_RANDOM));
    }
    return 0;
}
int main(int argc,char**argv){assert(argc==3);lua_State L={atoi(argv[1]),0};L.argc=L.form<2?1:L.form==2?3:2;if(atoi(argv[2])){ox=10;oy=6;}assert(l_create_stairway(&L,TRUE)==0);assert(added==1);printf("%d %d %d %d %d %d %d %d %d\n",sx,sy,sup,sladder,destination.dnum,destination.dlevel,levl[sx][sy].typ,levl[sx][sy].ladder,SpLev_Map[sx][sy]);return 0;}
