/* Scoped fixtures for the unchanged C map/terrain writers below. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
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


typedef int boolean; typedef int coordxy; typedef int lua_Integer;
#define TRUE 1
#define FALSE 0
#define COLNO 80
#define ROWNO 21
#define STONE 0
#define ROOM 25
#define ICE 33
#define NO_ROOM 0
#define INVALID_TYPE 127
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
typedef struct {int lx,ly,hx,hy;} NhRect;
struct selectionvar {int wid,hei,bounds_dirty;NhRect bounds;char*map;};
static struct {NhRect zeroNhRect;}cg;
typedef struct {int style,fg,x,y,dir,open,typ,argc,stage;const char*text;const char*field;const char*current;} lua_State;
typedef struct {int ter,tlit;} terrain;
static int captured[80][21];
static int transparent;
static int isok(int x,int y){return x>=1&&x<80&&y>=0&&y<21;}
static int random_calls;static int rn2(int n){assert(n==100);random_calls++;return 0;}
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
static schar get_table_mapchr_opt(lua_State*,const char*,schar);
static int get_table_boolean_opt(lua_State*L,const char*k,int d){assert(L);if(!strcmp(k,"lit"))return 0;return d;}
static int get_table_int_opt(lua_State*L,const char*k,int d){if(!strcmp(k,"lit"))return 0;if(!strcmp(k,"chance"))return 100;if(!strcmp(k,"x1")||!strcmp(k,"x2"))return 13;if(!strcmp(k,"y1")||!strcmp(k,"y2"))return 10;assert(!strcmp(k,"corrwid")||!strcmp(k,"wallthick"));return d;}
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

#define LUA_TTABLE 5
#define ANY_LOC 16
#define DRY 1
#define WET 2
#define HOT 4
#define SP_COORD_PACK(x,y) (((x)&0xffL)|(((y)&0xffL)<<16))
/* Fixed typed-table reader adapters: all fixture values are explicit integers/enums. */
static int lua_gettop(lua_State*L){assert(L);return L->argc;}
static void get_table_xy_or_coord(lua_State*L,lua_Integer*x,lua_Integer*y){assert(L->x>0&&L->y>0);*x=L->x;*y=L->y;}

/* Pinned default map frame (1,0), explicit coordinates only; no random/room conversions. */
static void get_location_coord(coordxy*x,coordxy*y,int humidity,struct mkroom*room,long packed){assert(!room&&(humidity==ANY_LOC||humidity==(DRY|WET|HOT)));assert(packed==SP_COORD_PACK(*x,*y)&&*x>0&&*y>0);*x+=gx.xstart;*y+=gy.ystart;assert(isok(*x,*y));}
static void lua_getfield(lua_State*L,int i,const char*k){assert(i==-1);if(!L->stage){assert(!strcmp(k,"fg")||!strcmp(k,"bg")||!strcmp(k,"filling"));L->current=!strcmp(k,"fg")?".":NULL;return;}if(!strcmp(k,L->field)){L->current=L->text;return;}if(!strcmp(k,"fg")){L->current=".";return;}if(!strcmp(k,"bg")||!strcmp(k,"filling")){L->current=NULL;return;}if(!strcmp(k,"fromterrain")){L->current=".";return;}if(!strcmp(k,"toterrain")){L->current="T";return;}abort();}
static void lua_pop(lua_State*L,int n){assert(L&&n==1);}
#define LUA_TNIL 0
static int lua_type(lua_State*L,int n){assert(n==-1);return L->current?LUA_TSTRING:LUA_TNIL;}
static const char*luaL_checkstring(lua_State*L,int n){assert((n==-1||n==3)&&L->text);return n==-1?L->current:L->text;}
static int luaL_checkinteger(lua_State*L,int n){assert(n==1||n==2);return n==1?L->x:L->y;}
static int get_coord(lua_State*L,int n,lua_Integer*x,lua_Integer*y){abort();}
static struct selectionvar*l_selection_check(lua_State*L,int n){abort();}
static void selection_iterate(struct selectionvar*s,void(*f)(coordxy,coordxy,genericptr_t),genericptr_t a){abort();}
static jmp_buf input_error;static void nhl_error(lua_State*L,const char*s){assert(!strcmp(s,"Erroneous map char"));longjmp(input_error,1);}

typedef signed char xint8;
static void*alloc(unsigned n){void*p=malloc(n);assert(p);return p;}
static void panic(const char*s){abort();}
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

char*
dupstr(const char *string)
{
    size_t len = strlen(string);

    /* make sure len+1 doesn't overflow plain unsigned (for alloc()) */
    if (len > (unsigned) (~0U - 1U))
        panic("dupstr: string length overflow");

    return strcpy((char *) alloc(len + 1), string);
}
static char emptystr[]={0};
static const char*luaL_optstring(lua_State*L,int n,char*d){assert(n==-1);return L->current?L->current:d;}
static void nhl_pcall_handle(lua_State*L,int a,int b,const char*n,int policy){abort();}
char*
get_table_str(lua_State *L, const char *name)
{
    char *ret;

    lua_getfield(L, -1, name);
    ret = dupstr(luaL_checkstring(L, -1));
    lua_pop(L, 1);
    return ret;
}
schar
splev_chr2typ(char c)
{
    int i;

    for (i = 0; char2typ[i].ch; i++)
        if (c == char2typ[i].ch)
            return char2typ[i].typ;
    return (INVALID_TYPE);
}
schar
check_mapchr(const char *s)
{
    if (s && strlen(s) == 1)
        return splev_chr2typ(s[0]);
    return INVALID_TYPE;
}
schar
get_table_mapchr(lua_State *L, const char *name)
{
    char *ter;
    xint8 typ;

    ter = get_table_str(L, name);
    typ = check_mapchr(ter);
    if (typ == INVALID_TYPE)
        nhl_error(L, "Erroneous map char");
    if (ter)
        free(ter);
    return typ;
}

char*
get_table_str_opt(lua_State *L, const char *name, char *defval)
{
    const char *ret;
    int ltyp;

    lua_getfield(L, -1, name);
    ltyp = lua_type(L, -1);
    if (ltyp == LUA_TSTRING || ltyp == LUA_TNIL) {
        ret = luaL_optstring(L, -1, defval);
    } else if (ltyp == LUA_TFUNCTION) {
        nhl_pcall_handle(L, 0, 1, "get_table_str_opt", NHLpa_panic);
        ret = luaL_optstring(L, -1, defval);
    } else {
        nhl_error(L, "get_table_str_opt: no string");
    }
    if (ret) {
        lua_pop(L, 1);
        return dupstr(ret);
    }
    lua_pop(L, 1);
    return NULL;
}
static schar
get_table_mapchr_opt(lua_State *L, const char *name, schar defval)
{
    char *ter;
    xint8 typ;

    ter = get_table_str_opt(L, name, emptystr);
    if (ter && *ter) {
        typ = (xint8) check_mapchr(ter);
        if (typ == INVALID_TYPE)
            nhl_error(L, "Erroneous map char");
    } else
        typ = (xint8) defval;
    if (ter)
        free(ter);
    return typ;
}
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



#define max(a,b) ((a)>(b)?(a):(b))
static void get_location(coordxy*x,coordxy*y,int humidity,struct mkroom*room){assert(humidity==ANY_LOC&&!room&&*x==13&&*y==10);(*x)++;}
static int get_table_region(lua_State*L,const char*n,lua_Integer*a,lua_Integer*b,lua_Integer*c,lua_Integer*d,int opt){abort();}
static struct mapfragment*mapfrag_fromstr(char*s){abort();}
static const char*mapfrag_error(struct mapfragment*m){abort();}
static int mapfrag_match(struct mapfragment*m,int x,int y){abort();}
static void mapfrag_free(struct mapfragment**m){assert(!*m);}
void selection_recalc_bounds(struct selectionvar*);int selection_getpoint(coordxy,coordxy,struct selectionvar*);

struct selectionvar *
selection_new(void)
{
    struct selectionvar *tmps = (struct selectionvar *) alloc(sizeof *tmps);

    tmps->wid = COLNO;
    tmps->hei = ROWNO;
    tmps->bounds_dirty = FALSE;
    tmps->bounds.lx = COLNO;
    tmps->bounds.ly = ROWNO;
    tmps->bounds.hx = tmps->bounds.hy = 0;
    tmps->map = (char *) alloc((COLNO * ROWNO) + 1);
    (void) memset(tmps->map, 1, (COLNO * ROWNO));
    tmps->map[(COLNO * ROWNO)] = '\0';

    return tmps;
}

void
selection_free(struct selectionvar *sel, boolean freesel)
{
    if (sel) {
        if (sel->map)
            free(sel->map);
        sel->map = NULL;
        if (freesel)
            free((genericptr_t) sel);
        else
            (void) memset((genericptr_t) sel, 0, sizeof *sel);
    }
}

void
selection_clear(struct selectionvar *sel, int val)
{
    (void) memset(sel->map, 1 + val, (COLNO * ROWNO));
    if (val) {
        sel->bounds.lx = 0;
        sel->bounds.ly = 0;
        sel->bounds.hx = COLNO - 1;
        sel->bounds.hy = ROWNO - 1;
    } else {
        sel->bounds.lx = COLNO;
        sel->bounds.ly = ROWNO;
        sel->bounds.hx = sel->bounds.hy = 0;
    }
    sel->bounds_dirty = FALSE;
}

void
selection_getbounds(struct selectionvar *sel, NhRect *b)
{
    if (!sel || !b)
        return;

    selection_recalc_bounds(sel);

    if (sel->bounds.lx >= sel->wid) {
        b->lx = 0;
        b->ly = 0;
        b->hx = COLNO - 1;
        b->hy = ROWNO - 1;
    } else {
        b->lx = sel->bounds.lx;
        b->ly = sel->bounds.ly;
        b->hx = sel->bounds.hx;
        b->hy = sel->bounds.hy;
    }
}

void
selection_recalc_bounds(struct selectionvar *sel)
{
    coordxy x, y;
    NhRect r;

    if (!sel->bounds_dirty)
        return;

    sel->bounds.lx = COLNO;
    sel->bounds.ly = ROWNO;
    sel->bounds.hx = sel->bounds.hy = 0;

    r.lx = r.ly = r.hx = r.hy = -1;

    /* left */
    for (x = 0; x < sel->wid; x++) {
        for (y = 0; y < sel->hei; y++) {
            if (selection_getpoint(x, y, sel)) {
                r.lx = x;
                break;
            }
        }
        if (r.lx > -1)
            break;
    }

    if (r.lx > -1) {
        /* right */
        for (x = sel->wid-1; x >= r.lx; x--) {
            for (y = 0; y < sel->hei; y++) {
                if (selection_getpoint(x, y, sel)) {
                    r.hx = x;
                    break;
                }
            }
            if (r.hx > -1)
                break;
        }

        /* top */
        for (y = 0; y < sel->hei; y++) {
            for (x = r.lx; x <= r.hx; x++) {
                if (selection_getpoint(x, y, sel)) {
                    r.ly = y;
                    break;
                }
            }
            if (r.ly > -1)
                break;
        }

        /* bottom */
        for (y = sel->hei-1; y >= r.ly; y--) {
            for (x = r.lx; x <= r.hx; x++) {
                if (selection_getpoint(x, y, sel)) {
                    r.hy = y;
                    break;
                }
            }
            if (r.hy > -1)
                break;
        }
        sel->bounds = r;
    }

    sel->bounds_dirty = FALSE;
}

coordxy
selection_getpoint(
    coordxy x, coordxy y,
    struct selectionvar *sel)
{
    if (!sel || !sel->map)
        return 0;
    if (x < 0 || y < 0 || x >= sel->wid || y >= sel->hei)
        return 0;

    return (sel->map[sel->wid * y + x] - 1);
}

void
selection_setpoint(
    coordxy x, coordxy y,
    struct selectionvar *sel,
    int c)
{
    if (!sel || !sel->map)
        return;
    if (x < 0 || y < 0 || x >= sel->wid || y >= sel->hei)
        return;

    if (c && !sel->bounds_dirty) {
        if (sel->bounds.lx > x)
            sel->bounds.lx = x;
        if (sel->bounds.ly > y)
            sel->bounds.ly = y;
        if (sel->bounds.hx < x)
            sel->bounds.hx = x;
        if (sel->bounds.hy < y)
            sel->bounds.hy = y;

    /* only set bounds_dirty if changing a point from 1 to 0; if changing
       a point from 0 to 0, nothing has really changed with the bounds */
    } else if (sel->map[sel->wid * y + x] != 0) {
        sel->bounds_dirty = TRUE;
    }

    sel->map[sel->wid * y + x] = (char) (c + 1);
}

int
lspo_replace_terrain(lua_State *L)
{
    coordxy totyp, fromtyp;
    struct mapfragment *mf = NULL;
    struct selectionvar *sel = NULL;
    boolean freesel = FALSE;
    coordxy x, y;
    lua_Integer x1, y1, x2, y2;
    int chance;
    int tolit;
    NhRect rect = cg.zeroNhRect;

    create_des_coder();

    lcheck_param_table(L);

    totyp = get_table_mapchr(L, "toterrain");

    if (totyp >= MAX_TYPE)
        return 0;

    fromtyp = get_table_mapchr_opt(L, "fromterrain", INVALID_TYPE);

    if (fromtyp == INVALID_TYPE) {
        const char *err;
        char *tmpstr = get_table_str(L, "mapfragment");
        mf = mapfrag_fromstr(tmpstr);
        free(tmpstr);

        if ((err = mapfrag_error(mf)) != NULL) {
            nhl_error(L, err);
            /*NOTREACHED*/
        }
    }

    chance = get_table_int_opt(L, "chance", 100);
    tolit = get_table_int_opt(L, "lit", SET_LIT_NOCHANGE);
    x1 = get_table_int_opt(L, "x1", -1);
    y1 = get_table_int_opt(L, "y1", -1);
    x2 = get_table_int_opt(L, "x2", -1);
    y2 = get_table_int_opt(L, "y2", -1);

    if (x1 == -1 && y1 == -1 && x2 == -1 && y2 == -1) {
        get_table_region(L, "region", &x1, &y1, &x2, &y2, TRUE);
    }

    if (x1 == -1 && y1 == -1 && x2 == -1 && y2 == -1) {
        lua_getfield(L, 1, "selection");
        if (lua_type(L, -1) != LUA_TNIL)
            sel = l_selection_check(L, -1);
        lua_pop(L, 1);
    }

    if (!sel) {
        sel = selection_new();
        freesel = TRUE;

        if (x1 == -1 && y1 == -1 && x2 == -1 && y2 == -1) {
            (void) selection_clear(sel, 1);
        } else {
            coordxy rx1, ry1, rx2, ry2;
            rx1 = x1, ry1 = y1, rx2 = x2, ry2 = y2;
            get_location(&rx1, &ry1, ANY_LOC, gc.coder->croom);
            get_location(&rx2, &ry2, ANY_LOC, gc.coder->croom);
            for (x = max(rx1, 0); x <= min(rx2, COLNO - 1); x++)
                for (y = max(ry1, 0); y <= min(ry2, ROWNO - 1); y++)
                    selection_setpoint(x, y, sel, 1);
        }
    }

    selection_getbounds(sel, &rect);

    for (x = max(1, rect.lx); x <= rect.hx; x++)
        for (y = rect.ly; y <= rect.hy; y++)
            if (selection_getpoint(x, y,sel)) {
                if (mf) {
                    if (mapfrag_match(mf, x, y) && (rn2(100)) < chance)
                        (void) set_levltyp_lit(x, y, totyp, tolit);
                } else {
                    if (((fromtyp == MATCH_WALL && IS_STWALL(levl[x][y].typ))
                         || levl[x][y].typ == fromtyp)
                        && rn2(100) < chance)
                        (void) set_levltyp_lit(x, y, totyp, tolit);
                }
            }

    if (freesel)
        selection_free(sel, TRUE);

    mapfrag_free(&mf);

    return 0;
}
int main(int argc,char**argv){assert(argc==3);char text[128]={0};size_t n=strlen(argv[2]);assert(n%2==0&&n/2<sizeof text);for(size_t i=0;i<n/2;i++){unsigned v;assert(sscanf(argv[2]+2*i,"%2x",&v)==1);text[i]=(char)v;}
lua_State L={.style=0,.fg=ROOM};lspo_level_init(&L);L.argc=1;L.stage=1;L.field=argv[1];L.text=text;L.style=!strcmp(L.field,"bg");
int failed=setjmp(input_error);if(!failed){if(!strcmp(L.field,"fromterrain")||!strcmp(L.field,"toterrain"))lspo_replace_terrain(&L);else{assert(!strcmp(L.field,"fg")||!strcmp(L.field,"bg")||!strcmp(L.field,"filling"));lspo_level_init(&L);}}
printf("%d %d\n",failed,levl[14][10].typ);return 0;}
