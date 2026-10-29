#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <setjmp.h>
typedef int coordxy;typedef int boolean;typedef long lua_Integer;typedef void*genericptr_t;
#define TRUE 1
#define FALSE 0
#define LUA_TTABLE 1
#define LUA_TSTRING 2
#define LUA_TNUMBER 3
#define ANY_LOC 16
#define DRY 1
#define SP_COORD_IS_RANDOM 0x01000000L
#define SP_COORD_PACK(x,y) (((x)&0xff)+(((y)&0xff)<<16))
#define SP_COORD_PACK_RANDOM(f) (SP_COORD_IS_RANDOM|(f))
#define W_ANY 15
#define W_RANDOM -1
#define W_NORTH 1
#define W_SOUTH 2
#define W_EAST 4
#define W_WEST 8
#define alloc malloc
#define assign_level(a,b) (*(a)=*(b))
#define LUALIB_API
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
#define IS_DOOR(typ) ((typ) == DOOR)
#define IS_DOORJOIN(typ) (IS_OBSTRUCTED(typ) || (typ) == IRONBARS)
#define IS_FURNITURE(typ) ((typ) >= STAIRS && (typ) <= ALTAR)
#define D_NODOOR  0x00
#define D_BROKEN  0x01
#define D_ISOPEN  0x02
#define D_CLOSED  0x04
#define D_LOCKED  0x08
#define D_SECRET  0x20 /* only used by sp_lev.c, NOT in rm-struct */
#define T_LOOTED 1
#define TREE_LOOTED 1
#define TREE_SWARM 2
#define F_LOOTED 1
#define F_WARNED 2
#define S_LPUDDING 1
#define S_LDWASHER 2
#define S_LRING 4
#define LA_UP 1
#define LA_DOWN 2
typedef struct {int dnum,dlevel;} d_level;
typedef struct stairway {int sx,sy;d_level tolev;int up,isladder,u_traversed;struct stairway*next;} stairway;
static struct {stairway*stairs;} gs;static struct {d_level uz;} u={{0,1}};
static struct {int typ,flags,doormask,ladder,horizontal;} levl[80][21];static int SpLev_Map[80][21];
static struct {struct {void*croom;}*coder;} gc;
typedef struct {int path,form,argc;const char*bytes;const char*field;} lua_State;
static jmp_buf failure;
static int isok(int x,int y){return x>=1&&x<80&&y>=0&&y<21;}
static void create_des_coder(void){static struct {void*croom;} coder;gc.coder=(void*)&coder;}
static int lua_gettop(lua_State*L){return L->argc;}
static int lua_type(lua_State*L,int i){assert(i==1||i==2);return i==1?(L->form?LUA_TSTRING:LUA_TTABLE):LUA_TNUMBER;}
static void lcheck_param_table(lua_State*L){assert(!L->form&&L->argc==1);}
static lua_Integer luaL_checkinteger(lua_State*L,int i){assert(L->form&&L->argc==3&&(i==2||i==3));return i==2?13:10;}
static lua_Integer lua_tointeger(lua_State*L,int i){assert(L->path==1&&L->argc==2&&(i==1||i==2));return i==1?13:10;}
static void lua_remove(lua_State*L,int i){assert(L->path==1&&i==1&&L->argc==3);L->argc--;}
static void get_table_xy_or_coord(lua_State*L,lua_Integer*x,lua_Integer*y){assert(!L->form);*x=13;*y=10;}
static void lua_getfield(lua_State*L,int i,const char*k){assert(!L->form&&i==-1&&!strcmp(k,L->path==0?"state":L->path==1?"dir":"type"));L->field=k;}
static void lua_pop(lua_State*L,int n){assert(n==1&&L->field);L->field=NULL;}
/* These typed string adapters preserve the entire supplied byte allocation. */
static const char*luaL_checkstring(lua_State*L,int i){assert((!L->form&&i==-1&&L->field)||(L->form&&i==1));return L->bytes;}
static const char*luaL_optstring(lua_State*L,int i,const char*d){assert(d);return luaL_checkstring(L,i);}
static const char*lua_pushfstring(lua_State*L,const char*f,const char*n){(void)L;(void)f;(void)n;return "invalid option";}
static int luaL_argerror(lua_State*L,int i,const char*s){(void)L;(void)i;(void)s;longjmp(failure,1);}
static void nhl_error(lua_State*L,const char*s){(void)L;(void)s;longjmp(failure,1);}
#include "lua-checkoption.inc"
int
get_table_option(lua_State *L,
                 const char *name,
                 const char *defval,
                 const char *const opts[])
{
    int ret;

    lua_getfield(L, -1, name);
    ret = luaL_checkoption(L, -1, defval, opts);
    lua_pop(L, 1);
    return ret;
}
static int get_table_int_opt(lua_State*L,const char*k,int d){(void)L;(void)k;(void)d;abort();}
static int get_table_boolean_opt(lua_State*L,const char*k,int d){assert(L->path==2&&!L->form&&d==-2&&(!strcmp(k,"looted")||!strcmp(k,"swarm")));return d;}
static int get_coord(lua_State*L,int n,lua_Integer*x,lua_Integer*y){(void)L;(void)n;(void)x;(void)y;abort();}
static void get_location_coord(coordxy*x,coordxy*y,int h,void*r,long c){assert(*x==13&&*y==10&&(h==ANY_LOC||h==DRY)&&!r&&c==SP_COORD_PACK(13,10));(*x)++;}
static int good_stair_loc(int x,int y){(void)x;(void)y;abort();}
static void set_ok_location_func(int(*f)(int,int)){assert(!f);}
struct trap{int unused;};static struct trap*t_at(int x,int y){assert(x==14&&y==10);return NULL;}
static void deltrap(struct trap*t){(void)t;abort();}
static void mkstairs(int x,int y,char up,void*r,int f){(void)x;(void)y;(void)up;(void)r;(void)f;abort();}
static void impossible(const char*s){(void)s;abort();}
static int rn2(int n){(void)n;abort();}static int rnddoor(void){abort();}
typedef struct{int secret,mask,pos,wall;}room_door;static void create_door(room_door*d,void*r){(void)d;(void)r;abort();}
void
stairway_add(
    coordxy x, coordxy y,
    boolean up, boolean isladder,
    d_level *dest)
{
    stairway *tmp = (stairway *) alloc(sizeof (stairway));

    (void) memset((genericptr_t) tmp, 0, sizeof (stairway));
    tmp->sx = x;
    tmp->sy = y;
    tmp->up = up;
    tmp->isladder = isladder;
    tmp->u_traversed = FALSE;
    assign_level(&(tmp->tolev), dest);
    tmp->next = gs.stairs;
    gs.stairs = tmp;
}
void
set_door_orientation(int x, int y)
{
    boolean wleft, wright, wup, wdown;

    /* If there's a wall or door on either the left side or right
     * side (or both) of this secret door, make it be horizontal.
     *
     * It is feasible to put SDOOR in a corner, tee, or crosswall
     * position, although once the door is found and opened it won't
     * make a lot sense (diagonal access required).  Still, we try to
     * handle that as best as possible.  For top or bottom tee, using
     * horizontal is the best we can do.  For corner or crosswall,
     * either horizontal or vertical are just as good as each other;
     * we produce horizontal for corners and vertical for crosswalls.
     * For left or right tee, using vertical is best.
     *
     * A secret door with no adjacent walls is also feasible and makes
     * even less sense.  It will be displayed as a vertical wall while
     * hidden and become a vertical door when found.  Before resorting
     * to that, we check for solid rock which hasn't been wallified
     * yet (cf lower leftside of leader's room in Cav quest).
     */
    wleft  = (isok(x - 1, y) && (IS_WALL(levl[x - 1][y].typ)
                                 || IS_DOOR(levl[x - 1][y].typ)
                                 || levl[x - 1][y].typ == SDOOR));
    wright = (isok(x + 1, y) && (IS_WALL(levl[x + 1][y].typ)
                                 || IS_DOOR(levl[x + 1][y].typ)
                                 || levl[x + 1][y].typ == SDOOR));
    wup    = (isok(x, y - 1) && (IS_WALL(levl[x][y - 1].typ)
                                 || IS_DOOR(levl[x][y - 1].typ)
                                 || levl[x][y - 1].typ == SDOOR));
    wdown  = (isok(x, y + 1) && (IS_WALL(levl[x][y + 1].typ)
                                 || IS_DOOR(levl[x][y + 1].typ)
                                 || levl[x][y + 1].typ == SDOOR));
    if (!wleft && !wright && !wup && !wdown) {
        /* out of bounds is treated as implicit wall; should be academic
           because we don't expect to have doors so near the level's edge */
        wleft  = (!isok(x - 1, y) || IS_DOORJOIN(levl[x - 1][y].typ));
        wright = (!isok(x + 1, y) || IS_DOORJOIN(levl[x + 1][y].typ));
        wup    = (!isok(x, y - 1) || IS_DOORJOIN(levl[x][y - 1].typ));
        wdown  = (!isok(x, y + 1) || IS_DOORJOIN(levl[x][y + 1].typ));
    }
    levl[x][y].horizontal = ((wleft || wright) && !(wup && wdown)) ? 1 : 0;
}
static void
sel_set_door(coordxy dx, coordxy dy, genericptr_t arg)
{
    coordxy typ = *(coordxy *) arg;
    coordxy x = dx, y = dy;

    if (!IS_DOOR(levl[x][y].typ) && levl[x][y].typ != SDOOR)
        levl[x][y].typ = (typ & D_SECRET) ? SDOOR : DOOR;
    if (typ & D_SECRET) {
        typ &= ~D_SECRET;
        if (typ < D_CLOSED)
            typ = D_CLOSED;
    }
    set_door_orientation(x, y); /* set/clear levl[x][y].horizontal */
    levl[x][y].doormask = typ;
    SpLev_Map[x][y] = 1;
}
static void
sel_set_feature(coordxy x, coordxy y, genericptr_t arg)
{
    if (!isok(x, y)) {
#ifdef EXTRA_SANITY_CHECKS
        impossible("sel_set_feature(%i,%i,%i) !isok", x, y, (*(int *) arg));
#endif /*EXTRA_SANITY_CHECKS*/
        return;
    }
    if (IS_FURNITURE(levl[x][y].typ))
        return;
    levl[x][y].typ = (*(int *) arg);
}
static void
l_table_getset_feature_flag(
    lua_State *L,
    int x, int y,
    const char *name,
    int flag)
{
    int val = get_table_boolean_opt(L, name, -2);

    if (val != -2) {
        if (val == -1)
            val = rn2(2);
        if (val)
            levl[x][y].flags |= flag;
        else
            levl[x][y].flags &= ~flag;
    }
}
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
static int
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
int
lspo_ladder(lua_State *L)
{
    return l_create_stairway(L, TRUE);
}
int
lspo_door(lua_State *L)
{
    static const char *const doorstates[] = {
        "random", "open", "closed", "locked", "nodoor", "broken",
        "secret", NULL
    };
    static const int doorstates2i[] = {
        -1, D_ISOPEN, D_CLOSED, D_LOCKED, D_NODOOR, D_BROKEN, D_SECRET
    };
    int msk;
    coordxy x, y;
    coordxy typ;
    int argc = lua_gettop(L);

    create_des_coder();

    if (argc == 3) {
        msk = doorstates2i[luaL_checkoption(L, 1, "random", doorstates)];
        x = luaL_checkinteger(L, 2);
        y = luaL_checkinteger(L, 3);

    } else {
        lua_Integer dx, dy;
        lcheck_param_table(L);

        get_table_xy_or_coord(L, &dx, &dy);
        x = dx, y = dy;
        msk = doorstates2i[get_table_option(L, "state", "random",
                                            doorstates)];
    }

    typ = (msk == -1) ? rnddoor() : (coordxy) msk;

    if (x == -1 && y == -1) {
        static const char *const walldirs[] = {
            "all", "random", "north", "west", "east", "south", NULL
        };
        /* Note that "random" is also W_ANY, because create_door just wants a
         * mask of acceptable walls */
        static const int walldirs2i[] = {
            W_ANY, W_ANY, W_NORTH, W_WEST, W_EAST, W_SOUTH, 0
        };
        room_door tmpd;

        tmpd.secret = (typ == D_SECRET) ? 1 : 0;
        tmpd.mask = msk;
        tmpd.pos = get_table_int_opt(L, "pos", -1);
        tmpd.wall = walldirs2i[get_table_option(L, "wall", "all", walldirs)];

        create_door(&tmpd, gc.coder->croom);
    } else {
        /*selection_iterate(sel, sel_set_door, (genericptr_t) &typ);*/
        get_location_coord(&x, &y, ANY_LOC, gc.coder->croom,
                           SP_COORD_PACK(x, y));
        if (!isok(x, y)) {
            nhl_error(L, "door coord not ok");
            /*NOTREACHED*/
            return 0;
        }
        sel_set_door(x, y, (genericptr_t) &typ);
    }

    return 0;
}
int
lspo_feature(lua_State *L)
{
    static const char *const features[] = { "fountain", "sink", "pool",
                                            "throne", "tree", NULL };
    static const int features2i[] = { FOUNTAIN, SINK, POOL,
                                      THRONE, TREE, STONE };
    coordxy x, y;
    int typ;
    int argc = lua_gettop(L);
    boolean can_have_flags = FALSE;
    long fcoord;
    int humidity;

    create_des_coder();

    if (argc == 1 && lua_type(L, 1) == LUA_TSTRING) {
        typ = features2i[luaL_checkoption(L, 1, NULL, features)];
        x = y = -1;
    } else if (argc == 2 && lua_type(L, 1) == LUA_TSTRING
        && lua_type(L, 2) == LUA_TTABLE) {
        lua_Integer fx, fy;
        typ = features2i[luaL_checkoption(L, 1, NULL, features)];
        (void) get_coord(L, 2, &fx, &fy);
        x = fx;
        y = fy;
    } else if (argc == 3) {
        typ = features2i[luaL_checkoption(L, 1, NULL, features)];
        x = luaL_checkinteger(L, 2);
        y = luaL_checkinteger(L, 3);
    } else {
        lua_Integer fx, fy;
        lcheck_param_table(L);

        get_table_xy_or_coord(L, &fx, &fy);
        x = fx, y = fy;
        typ = features2i[get_table_option(L, "type", NULL, features)];
        can_have_flags = TRUE;
    }

    if (x == -1 && y == -1) {
        fcoord = SP_COORD_PACK_RANDOM(0);
        humidity = DRY; /* pick a regular space, no rock or other furniture */
    }
    else {
        fcoord = SP_COORD_PACK(x, y);
        humidity = ANY_LOC; /* assume the author knows what they're doing */
    }
    get_location_coord(&x, &y, humidity, gc.coder->croom, fcoord);

    if (typ == STONE)
        impossible("feature has unknown type param.");
    else
        sel_set_feature(x, y, (genericptr_t) &typ);

    if (levl[x][y].typ != typ || !can_have_flags)
        return 0;

    switch (typ) {
    default:
        break;
    case FOUNTAIN:
        l_table_getset_feature_flag(L, x, y, "looted", F_LOOTED);
        l_table_getset_feature_flag(L, x, y, "warned", F_WARNED);
        break;
    case SINK:
        l_table_getset_feature_flag(L, x, y, "pudding", S_LPUDDING);
        l_table_getset_feature_flag(L, x, y, "dishwasher", S_LDWASHER);
        l_table_getset_feature_flag(L, x, y, "ring", S_LRING);
        break;
    case THRONE:
        l_table_getset_feature_flag(L, x, y, "looted", T_LOOTED);
        break;
    case TREE:
        l_table_getset_feature_flag(L, x, y, "looted", TREE_LOOTED);
        l_table_getset_feature_flag(L, x, y, "swarm", TREE_SWARM);
        break;
    }

    return 0;
}
int main(int argc,char**argv){assert(argc==4);int path=atoi(argv[1]),form=atoi(argv[2]);assert(path>=0&&path<=2&&(form==0||form==1));size_t n=strlen(argv[3]);assert(n%2==0&&n<1000);char*bytes=calloc(n/2+1,1);for(size_t i=0;i<n/2;i++){unsigned b;assert(sscanf(argv[3]+2*i,"%2x",&b)==1);bytes[i]=(char)b;}
for(int x=0;x<80;x++)for(int y=0;y<21;y++)levl[x][y].typ=ROOM;
lua_State L={path,form,form?3:1,bytes,NULL};int rejected=setjmp(failure);if(!rejected){if(path==0)lspo_door(&L);else if(path==1)lspo_ladder(&L);else lspo_feature(&L);}
int count=0;for(stairway*t=gs.stairs;t;t=t->next){assert(t->sx==14&&t->sy==10&&t->isladder&&!t->up&&t->tolev.dnum==0&&t->tolev.dlevel==2);count++;}
printf("%d %d %d %d %d %d %d\n",!rejected,levl[14][10].typ,levl[14][10].doormask,levl[14][10].ladder,levl[14][10].horizontal,SpLev_Map[14][10],count);free(bytes);while(gs.stairs){stairway*t=gs.stairs;gs.stairs=t->next;free(t);}return 0;}
