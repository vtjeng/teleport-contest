/* Scoped fixtures for the unchanged C map/terrain writers below. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
typedef int boolean; typedef int coordxy; typedef int lua_Integer;
#define TRUE 1
#define FALSE 0
#define COLNO 80
#define ROWNO 21
#define STONE 0
#define ROOM 25
#define ICE 33
#define NO_ROOM 0
#define INVALID_TYPE (-1)
#define MAX_TYPE 37
#define SPLEV_LEFT 1
#define SPLEV_H_LEFT 2
#define SPLEV_CENTER 3
#define SPLEV_H_RIGHT 4
#define SPLEV_RIGHT 5
#define TOP 1
#define BOTTOM 5
#define LUA_TSTRING 4
#define LUA_TFUNCTION 6
#define NHLpa_panic 0
#define min(a,b) ((a)<(b)?(a):(b))
struct mkroom {int lx,ly,hx,hy;};
struct coder { struct mkroom *croom; int lvl_is_joined; } coder;
struct {struct coder *coder;} gc={&coder};
struct {int in_mk_themerooms;} gi;
struct {int themeroom_failed;} gt;
struct {int xstart,xsize,x_maze_max;} gx={1,79,78};
struct {int ystart,ysize,y_maze_max;} gy={0,21,20};
int splev_init_present, icedpools;
struct {int typ,flags,horizontal,roomno,edge,lit,arboreal_sdoor;} levl[80][21];
int SpLev_Map[80][21];
struct mapfragment {int wid,hei;};
struct selectionvar {int points[80][21];};
typedef struct {int style,fg,x,y,dir,open,typ;} lua_State;
typedef struct {int ter,tlit;} terrain;
static int captured[80][21];
static int transparent;
static int isok(int x,int y){return x>=1&&x<80&&y>=0&&y<21;}
static int rn2(int n){(void)n;abort();}
typedef signed char schar; typedef void *genericptr_t;
#define staticfn static
#define SDOOR 14
#define DOOR 23
#define HWALL 2
#define IRONBARS 22
#define AIR 35
#define CLOUD 36
#define LADDER 27
#define STAIRS 26
#define D_CLOSED 4
#define ICED_POOL 8
#define ICED_MOAT 16
#define SET_LIT_NOCHANGE (-2)
#define SET_LIT_RANDOM (-1)
#define MELT_ICE_AWAY 0
#define IS_DOOR(t) ((t)==DOOR)
#define IS_WALL(t) ((t) && (t)<=12)
#define IS_LAVA(t) ((t)==20 || (t)==21)
#define IS_FOUNTAIN(t) ((t)==28)
#define IS_SINK(t) ((t)==30)
#define CAN_OVERWRITE_TERRAIN(t) (iflags.debug_overwrite_stairs || !((t)==LADDER || (t)==STAIRS))
/* rm.h aliases both these names to flags. */
#define icedpool flags
#define doormask flags
#define wall_info flags
#define IS_STWALL(t) ((t)<=12)
#define IS_TREE(t) ((t)==13) /* arboreal false in these fixtures */
struct {int debug_overwrite_stairs;} iflags;
#define DRAWBRIDGE_UP 19
#define DRAWBRIDGE_DOWN 34
#define DBWALL 12
#define DB_NORTH 0
#define DB_SOUTH 1
#define DB_EAST 2
#define DB_WEST 3
#define DB_UNDER 28
#define DB_ICE 8
#define DB_LAVA 4
#define LAVAPOOL 20
#define MOAT 17
#define D_NODOOR 0
#define W_NONDIGGABLE 8
#define drawbridgemask flags
#define FALLTHROUGH
boolean
is_ice(coordxy x, coordxy y)
{
    schar ltyp;

    if (!isok(x, y))
        return FALSE;
    ltyp = levl[x][y].typ;
    if (ltyp == ICE || (ltyp == DRAWBRIDGE_UP
                        && (levl[x][y].drawbridgemask & DB_UNDER) == DB_ICE))
        return TRUE;
    return FALSE;
}

static void obj_ice_effects(int x,int y,int b){abort();}
static void spot_stop_timers(int x,int y,int t){abort();}
static void count_level_features(void){abort();}
static void del_engr_at(int x,int y){abort();}

struct {struct {struct {int corrmaze;} flags;} level;} svl;
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
static void
sel_set_ter(coordxy x, coordxy y, genericptr_t arg)
{
    terrain terr;

    terr = *(terrain *) arg;
    if (!set_levltyp_lit(x, y, terr.ter, terr.tlit))
        return;
    /* TODO: move this below into set_levltyp? */
    /* handle doors and secret doors */
    if (levl[x][y].typ == SDOOR || IS_DOOR(levl[x][y].typ)) {
        if (levl[x][y].typ == SDOOR)
            levl[x][y].doormask = D_CLOSED;
        if (x && (IS_WALL(levl[x - 1][y].typ) || levl[x - 1][y].horizontal))
            levl[x][y].horizontal = 1;
    } else if (levl[x][y].typ == HWALL || levl[x][y].typ == IRONBARS) {
        levl[x][y].horizontal = 1;
    } else if (splev_init_present && levl[x][y].typ == ICE) {
        levl[x][y].icedpool = icedpools ? ICED_POOL : ICED_MOAT;
    } else if (levl[x][y].typ == CLOUD) {
        del_engr_at(x, y); /* clouds cannot have engravings */
    }
}
static void
lvlfill_solid(schar filling, schar lit)
{
    int x, y;

    for (x = 2; x <= gx.x_maze_max; x++)
        for (y = 0; y <= gy.y_maze_max; y++) {
            if (!set_levltyp_lit(x, y, filling, lit))
                continue;
            /* TODO: consolidate this w lspo_map ? */
            levl[x][y].flags = 0;
            levl[x][y].horizontal = 0;
            levl[x][y].roomno = 0;
            levl[x][y].edge = 0;
        }
}
static void
sel_set_wall_property(coordxy x, coordxy y, genericptr_t arg)
{
    int prop = *(int *) arg;

    if (IS_STWALL(levl[x][y].typ) || IS_TREE(levl[x][y].typ)
        /* 3.6.2: made iron bars eligible to be flagged nondiggable
           (checked by chewing(hack.c) and zap_over_floor(zap.c)) */
        || levl[x][y].typ == IRONBARS)
        levl[x][y].wall_info |= prop;
}
static void
lvlfill_maze_grid(int x1, int y1, int x2, int y2, schar filling)
{
    int x, y;

    for (x = x1; x <= x2; x++)
        for (y = y1; y <= y2; y++) {
            if (svl.level.flags.corrmaze)
                levl[x][y].typ = STONE;
            else
                levl[x][y].typ = (y < 2 || ((x % 2) && (y % 2))) ? STONE
                                                                 : filling;
        }
}
#define LVLINIT_NONE 0
#define LVLINIT_SOLIDFILL 1
#define LVLINIT_MAZEGRID 2
#define LVLINIT_MAZE 3
#define LVLINIT_ROGUE 5
#define LVLINIT_MINES 4
#define LVLINIT_SWAMP 6
#define BOOL_RANDOM -1
#define MOAT 17
typedef struct {int init_style,fg,bg,smoothed,joined,lit,walled,filling,corrwid,wallthick,rm_deadends,icedpools;} lev_init;
static void impossible(const char*s){(void)s;abort();}
static void create_maze(int a,int b,int c){(void)a;(void)b;(void)c;abort();}
static void makeroguerooms(void){abort();}
static void mkmap(lev_init*l){(void)l;abort();}
static void lvlfill_swamp(int a,int b,int c){(void)a;(void)b;(void)c;abort();}
static void create_des_coder(void){}
static void lcheck_param_table(lua_State*L){assert(L);}
static int get_table_option(lua_State*L,const char*k,const char*d,const char*const*o){if(!strcmp(k,"style")){assert(!strcmp(d,"solidfill"));return L->style;}if(!strcmp(k,"dir")){assert(L->dir>=0&&L->dir<4);return L->dir==2?3:L->dir==3?2:L->dir;}assert(!strcmp(k,"state"));return L->open?0:1;}
static int get_table_mapchr_opt(lua_State*L,const char*k,int d){if(!strcmp(k,"fg"))return L->fg;if(!strcmp(k,"bg"))return L->fg==ICE?ICE:d;assert(!strcmp(k,"filling"));return d;}
static int get_table_boolean_opt(lua_State*L,const char*k,int d){assert(L);if(!strcmp(k,"lit"))return 0;return d;}
static int get_table_int_opt(lua_State*L,const char*k,int d){assert(L);if(!strcmp(k,"lit"))return 0;assert(!strcmp(k,"corrwid")||!strcmp(k,"wallthick"));return d;}
static void
splev_initlev(lev_init *linit)
{
    switch (linit->init_style) {
    default:
        impossible("Unrecognized level init style.");
        break;
    case LVLINIT_NONE:
        break;
    case LVLINIT_SOLIDFILL:
        if (linit->lit == BOOL_RANDOM)
            linit->lit = rn2(2);
        lvlfill_solid(linit->filling, linit->lit);
        break;
    case LVLINIT_MAZEGRID:
        lvlfill_maze_grid(2, 0, gx.x_maze_max, gy.y_maze_max, linit->bg);
        break;
    case LVLINIT_MAZE:
        create_maze(linit->corrwid, linit->wallthick, linit->rm_deadends);
        break;
    case LVLINIT_ROGUE:
        makeroguerooms();
        break;
    case LVLINIT_MINES:
        if (linit->lit == BOOL_RANDOM)
            linit->lit = rn2(2);
        if (linit->filling > -1)
            lvlfill_solid(linit->filling, 0);
        linit->icedpools = icedpools;
        mkmap(linit);
        break;
    case LVLINIT_SWAMP:
        if (linit->lit == BOOL_RANDOM)
            linit->lit = rn2(2);
        lvlfill_swamp(linit->fg, linit->bg, linit->lit);
        break;
    }
}
int
lspo_level_init(lua_State *L)
{
    static const char *const initstyles[] = {
        "solidfill", "mazegrid", "maze", "rogue", "mines", "swamp", NULL
    };
    static const int initstyles2i[] = {
        LVLINIT_SOLIDFILL, LVLINIT_MAZEGRID, LVLINIT_MAZE, LVLINIT_ROGUE,
        LVLINIT_MINES, LVLINIT_SWAMP, 0
    };
    lev_init init_lev;

    create_des_coder();

    lcheck_param_table(L);

    splev_init_present = TRUE;

    init_lev.init_style
        = initstyles2i[get_table_option(L, "style", "solidfill", initstyles)];
    init_lev.fg = get_table_mapchr_opt(L, "fg", ROOM);
    init_lev.bg = get_table_mapchr_opt(L, "bg", INVALID_TYPE);
    init_lev.smoothed = get_table_boolean_opt(L, "smoothed", FALSE);
    init_lev.joined = get_table_boolean_opt(L, "joined", FALSE);
    init_lev.lit = get_table_boolean_opt(L, "lit", BOOL_RANDOM);
    init_lev.walled = get_table_boolean_opt(L, "walled", FALSE);
    init_lev.filling = get_table_mapchr_opt(L, "filling", init_lev.fg);
    init_lev.corrwid = get_table_int_opt(L, "corrwid", -1);
    init_lev.wallthick = get_table_int_opt(L, "wallthick", -1);
    init_lev.rm_deadends = !get_table_boolean_opt(L, "deadends", TRUE);

    gc.coder->lvl_is_joined = init_lev.joined;

    if (init_lev.bg == INVALID_TYPE)
        init_lev.bg = (init_lev.init_style == LVLINIT_SWAMP) ? MOAT : STONE;

    splev_initlev(&init_lev);

    return 0;
}

boolean
create_drawbridge(coordxy x, coordxy y, int dir, boolean flag)
{
    coordxy x2, y2;
    boolean horiz;
    boolean lava = levl[x][y].typ == LAVAPOOL; /* assume initialized map */

    x2 = x;
    y2 = y;
    switch (dir) {
    case DB_NORTH:
        horiz = TRUE;
        y2--;
        break;
    case DB_SOUTH:
        horiz = TRUE;
        y2++;
        break;
    case DB_EAST:
        horiz = FALSE;
        x2++;
        break;
    default:
        impossible("bad direction in create_drawbridge");
        FALLTHROUGH;
        /*FALLTHRU*/
    case DB_WEST:
        horiz = FALSE;
        x2--;
        break;
    }
    if (!IS_WALL(levl[x2][y2].typ))
        return FALSE;
    if (flag) { /* We want the bridge open */
        levl[x][y].typ = DRAWBRIDGE_DOWN;
        levl[x2][y2].typ = DOOR;
        levl[x2][y2].doormask = D_NODOOR;
    } else {
        levl[x][y].typ = DRAWBRIDGE_UP;
        levl[x2][y2].typ = DBWALL;
        /* Drawbridges are non-diggable. */
        levl[x2][y2].wall_info = W_NONDIGGABLE;
    }
    levl[x][y].horizontal = !horiz;
    levl[x2][y2].horizontal = horiz;
    levl[x][y].drawbridgemask = dir;
    if (lava)
        levl[x][y].drawbridgemask |= DB_LAVA;
    return  TRUE;
}

#define LUA_TTABLE 5
#define ANY_LOC 16
#define DRY 1
#define WET 2
#define HOT 4
#define SP_COORD_PACK(x,y) (((x)&0xffL)|(((y)&0xffL)<<16))
/* Fixed typed-table reader adapters: all fixture values are explicit integers/enums. */
static int lua_gettop(lua_State*L){assert(L);return 1;}
static void get_table_xy_or_coord(lua_State*L,lua_Integer*x,lua_Integer*y){assert(L->x>0&&L->y>0);*x=L->x;*y=L->y;}
static int get_table_mapchr(lua_State*L,const char*k){assert(!strcmp(k,"typ"));assert(L->typ==ROOM||L->typ==MOAT||L->typ==HWALL||L->typ==DOOR||L->typ==SDOOR);return L->typ;}
/* Pinned default map frame (1,0), explicit coordinates only; no random/room conversions. */
static void get_location_coord(coordxy*x,coordxy*y,int humidity,struct mkroom*room,long packed){assert(!room&&(humidity==ANY_LOC||humidity==(DRY|WET|HOT)));assert(packed==SP_COORD_PACK(*x,*y)&&*x>0&&*y>0);*x+=gx.xstart;*y+=gy.ystart;assert(isok(*x,*y));}
static void lua_getfield(lua_State*L,int i,const char*k){abort();}
static void lua_pop(lua_State*L,int n){abort();}
static int lua_type(lua_State*L,int n){abort();}
static const char*luaL_checkstring(lua_State*L,int n){abort();}
static int luaL_checkinteger(lua_State*L,int n){abort();}
static int check_mapchr(const char*s){abort();}
static int get_coord(lua_State*L,int n,lua_Integer*x,lua_Integer*y){abort();}
static struct selectionvar*l_selection_check(lua_State*L,int n){abort();}
static void selection_iterate(struct selectionvar*s,void(*f)(coordxy,coordxy,genericptr_t),genericptr_t a){abort();}
static void nhl_error(lua_State*L,const char*s){abort();}

int
lspo_terrain(lua_State *L)
{
    terrain tmpterrain;
    coordxy x = 0, y = 0;
    struct selectionvar *sel = NULL;
    int argc = lua_gettop(L);

    create_des_coder();
    tmpterrain.tlit = SET_LIT_NOCHANGE;
    tmpterrain.ter = INVALID_TYPE;

    if (argc == 1) {
        lua_Integer tx, ty;
        lcheck_param_table(L);

        get_table_xy_or_coord(L, &tx, &ty);
        x = tx, y = ty;
        if (tx == -1 && ty == -1) {
            lua_getfield(L, 1, "selection");
            sel = l_selection_check(L, -1);
            lua_pop(L, 1);
        }
        tmpterrain.ter = get_table_mapchr(L, "typ");
        tmpterrain.tlit = get_table_int_opt(L, "lit", SET_LIT_NOCHANGE);
    } else if (argc == 2 && lua_type(L, 1) == LUA_TTABLE
               && lua_type(L, 2) == LUA_TSTRING) {
        lua_Integer tx, ty;
        tmpterrain.ter = check_mapchr(luaL_checkstring(L, 2));
        lua_pop(L, 1);
        (void) get_coord(L, 1, &tx, &ty);
        x = tx;
        y = ty;
    } else if (argc == 2) {
        sel = l_selection_check(L, 1);
        tmpterrain.ter = check_mapchr(luaL_checkstring(L, 2));
    } else if (argc == 3) {
        x = luaL_checkinteger(L, 1);
        y = luaL_checkinteger(L, 2);
        tmpterrain.ter = check_mapchr(luaL_checkstring(L, 3));
    } else {
        nhl_error(L, "wrong parameters");
    }

    if (tmpterrain.ter == INVALID_TYPE)
        nhl_error(L, "Erroneous map char");

    if (sel) {
        selection_iterate(sel, sel_set_ter, (genericptr_t) &tmpterrain);
    } else {
        get_location_coord(&x, &y, ANY_LOC, gc.coder->croom,
                           SP_COORD_PACK(x, y));
        if (!isok(x, y)) {
            nhl_error(L, "terrain coord not ok");
            /*NOTREACHED*/
            return 0;
        }
        sel_set_ter(x, y, (genericptr_t) &tmpterrain);
    }

    return 0;
}
int
lspo_drawbridge(lua_State *L)
{
    static const char *const mwdirs[] = {
        "north", "south", "west", "east", "random", NULL
    };
    static const int mwdirs2i[] = {
        DB_NORTH, DB_SOUTH, DB_WEST, DB_EAST, -1, -2
    };
    static const char *const dbopens[] = {
        "open", "closed", "random", NULL
    };
    static const int dbopens2i[] = { 1, 0, -1, -2 };
    coordxy x, y;
    lua_Integer mx, my;
    int dir;
    int db_open;
    long dcoord;

    create_des_coder();

    lcheck_param_table(L);

    get_table_xy_or_coord(L, &mx, &my);

    dir = mwdirs2i[get_table_option(L, "dir", "random", mwdirs)];
    dcoord = SP_COORD_PACK(mx, my);
    db_open = dbopens2i[get_table_option(L, "state", "random", dbopens)];
    x = mx;
    y = my;

    get_location_coord(&x, &y, DRY | WET | HOT, gc.coder->croom, dcoord);
    if (!isok(mx, my)) {
        nhl_error(L, "drawbridge coord not ok");
        /*NOTREACHED*/
        return 0;
    }
    if (db_open == -1)
        db_open = !rn2(2);
    if (!create_drawbridge(x, y, dir, db_open ? TRUE : FALSE))
        impossible("Cannot create drawbridge.");
    SpLev_Map[x][y] = 1;

    return 0;
}int main(int argc,char**argv){assert(argc==3);int dir=atoi(argv[1]),mode=atoi(argv[2]);assert(dir>=0&&dir<4&&mode>=0&&mode<3);
lua_State L={0,ROOM};lspo_level_init(&L);int x=14,y=10,wx=x+(dir==DB_EAST)-(dir==DB_WEST),wy=y+(dir==DB_SOUTH)-(dir==DB_NORTH);
L.x=x-1;L.y=y;L.typ=MOAT;lspo_terrain(&L);L.x=wx-1;L.y=wy;L.typ=HWALL;lspo_terrain(&L);L.x=x-1;L.y=y;L.dir=dir;L.open=mode==1;lspo_drawbridge(&L);assert(levl[x][y].typ==(mode==1?DRAWBRIDGE_DOWN:DRAWBRIDGE_UP));
printf("%d %d %d\n",levl[wx][wy].typ,levl[wx][wy].wall_info,levl[wx][wy].horizontal);
L.x=wx-1;L.y=wy;L.typ=mode==2?SDOOR:DOOR;lspo_terrain(&L);L.x=x-1;L.y=y;L.typ=ROOM;lspo_terrain(&L);assert(levl[x][y].typ==ROOM);
printf("%d %d %d\n",levl[wx][wy].typ,levl[wx][wy].doormask,levl[wx][wy].horizontal);return 0;}
