/* Scoped fixtures for the unchanged C map/terrain writers below. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
typedef signed char boolean; typedef int coordxy; typedef int lua_Integer;
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
#define TRUE 1
#define FALSE 0
#define COLNO 80
#define ROWNO 21
#define NO_ROOM 0
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
typedef signed char schar; typedef unsigned char uchar;
#define Bitfield(x,n) unsigned x:n
#define arboreal_sdoor candig
struct rm {
    int glyph;               /* what the hero thinks is there */
    schar typ;               /* what is really there  [why is this signed?] */
    uchar seenv;             /* seen vector */
    Bitfield(flags, 5);      /* extra information for typ */
    Bitfield(horizontal, 1); /* wall/door/etc is horiz. (more typ info) */
    Bitfield(lit, 1);        /* speed hack for lit rooms */
    Bitfield(waslit, 1);     /* remember if a location was lit */

    Bitfield(roomno, 6); /* room # for special rooms */
    Bitfield(edge, 1);   /* marks boundaries for special rooms*/
    Bitfield(candig, 1); /* Exception to Can_dig_down; was a trapdoor */
};
struct rm levl[80][21];
int SpLev_Map[80][21];
struct mapfragment {int wid,hei;};
struct selectionvar {int points[80][21];};
typedef struct {int kind,value; const char *word,*fg,*field;} lua_State;
typedef struct {int ter,tlit;} terrain;
static int captured[80][21];
static int transparent;
static int isok(int x,int y){return x>=1&&x<80&&y>=0&&y<21;}
static int rn2(int n){(void)n;abort();}
typedef signed char schar; typedef void *genericptr_t;
#define staticfn static
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
static int is_ice(int x,int y){assert(levl[x][y].typ==STONE || levl[x][y].typ==ROOM || levl[x][y].typ==ICE);return levl[x][y].typ==ICE;}
static void obj_ice_effects(int x,int y,int b){abort();}
static void spot_stop_timers(int x,int y,int t){abort();}
static void count_level_features(void){abort();}
static void del_engr_at(int x,int y){abort();}

struct {struct {struct {int corrmaze;} flags;} level;} svl;

#define LUA_TNIL 0
#define LUA_TBOOLEAN 1
#define LUA_TNUMBER 3
#define NHLpa_panic 0
#define LUALIB_API
#define LVLINIT_NONE 0
#define LVLINIT_SOLIDFILL 1
#define LVLINIT_MAZEGRID 2
#define LVLINIT_MAZE 3
#define LVLINIT_MINES 4
#define LVLINIT_ROGUE 5
#define LVLINIT_SWAMP 6
#define BOOL_RANDOM -1
typedef signed char xint8; typedef short xint16;
static int diagnostic_count;
static void impossible(const char *fmt,...){(void)fmt;diagnostic_count++;}
static void create_des_coder(void){}
static void lcheck_param_table(lua_State*L){assert(L && !L->field);}
static void lua_getfield(lua_State*L,int i,const char*k){assert(i==-1&&!L->field);L->field=k;}
static void lua_pop(lua_State*L,int n){assert(n==1&&L->field);L->field=NULL;}
static int lua_type(lua_State*L,int i){assert(i==-1&&L->field);if(!strcmp(L->field,"style")||!strcmp(L->field,"fg"))return LUA_TSTRING;if(!strcmp(L->field,"lit"))return L->kind;return LUA_TNIL;}
static int lua_isnil(lua_State*L,int i){return lua_type(L,i)==LUA_TNIL;}
static const char*luaL_checkstring(lua_State*L,int i){assert(lua_type(L,i)==LUA_TSTRING);return !strcmp(L->field,"style")?"solidfill":!strcmp(L->field,"fg")?L->fg:L->word;}
static const char*luaL_optstring(lua_State*L,int i,const char*d){return lua_isnil(L,i)?d:luaL_checkstring(L,i);}
static int lua_toboolean(lua_State*L,int i){assert(lua_type(L,i)==LUA_TBOOLEAN);return L->value;}
static lua_Integer luaL_checkinteger(lua_State*L,int i){assert(lua_type(L,i)==LUA_TNUMBER);return L->value;}
static const char*lua_pushfstring(lua_State*L,const char*f,const char*n){abort();}
static int luaL_argerror(lua_State*L,int i,const char*s){abort();}
static void nhl_error(lua_State*L,const char*s){abort();}
static void nhl_pcall_handle(lua_State*L,int a,int b,const char*s,int m){abort();}
static char*dupstr(const char*s){char*p=malloc(strlen(s)+1);assert(p);return strcpy(p,s);}
static char emptystr[]="";
#include "lua-checkoption.inc"
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
typedef struct {
    xint16 init_style; /* one of LVLINIT_foo */
    long flags;
    schar filling;
    boolean init_present, padding;
    char fg, bg;
    boolean smoothed, joined;
    xint16 lit, walled;
    boolean icedpools;
    int corrwid, wallthick;
    boolean rm_deadends;
} lev_init;
static void create_maze(int a,int b,int c){abort();}
static void makeroguerooms(void){abort();}
static void mkmap(lev_init*l){abort();}
static void lvlfill_swamp(int a,int b,int c){abort();}
static void lvlfill_maze_grid(int a,int b,int c,int d,schar e){abort();}
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

int
get_table_int_opt(lua_State *L, const char *name, int defval)
{
    int ret = defval;

    lua_getfield(L, -1, name);
    if (!lua_isnil(L, -1)) {
        ret = (int) luaL_checkinteger(L, -1);
    }
    lua_pop(L, 1);
    return ret;
}

char *
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

schar
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
get_table_boolean(lua_State *L, const char *name)
{
    static const char *const boolstr[] = {
        "true", "false", "yes", "no", NULL
    };
    /* static const int boolstr2i[] = { TRUE, FALSE, TRUE, FALSE, -1 }; */
    int ltyp;
    int ret = -1;

    lua_getfield(L, -1, name);
    ltyp = lua_type(L, -1);
    if (ltyp == LUA_TSTRING) {
        ret = luaL_checkoption(L, -1, NULL, boolstr);
        /* nhUse(boolstr2i[0]); */
    } else if (ltyp == LUA_TBOOLEAN) {
        ret = lua_toboolean(L, -1);
    } else if (ltyp == LUA_TNUMBER) {
        ret = (int) luaL_checkinteger(L, -1);
        if (ret < 0 || ret > 1)
            ret = -1;
    }
    lua_pop(L, 1);
    if (ret == -1)
        nhl_error(L, "Expected a boolean");
    return ret;
}

int
get_table_boolean_opt(lua_State *L, const char *name, int defval)
{
    int ret = defval;

    lua_getfield(L, -1, name);
    if (lua_type(L, -1) != LUA_TNIL) {
        lua_pop(L, 1);
        return get_table_boolean(L, name);
    }
    lua_pop(L, 1);
    return ret;
}

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

int main(int argc,char**argv){assert(argc==4);lua_State L={atoi(argv[1]),atoi(argv[2]),argv[2],argv[3],NULL};assert(L.kind==LUA_TSTRING||L.kind==LUA_TBOOLEAN||L.kind==LUA_TNUMBER);int parsed=get_table_boolean(&L,"lit");assert(!L.field);lspo_level_init(&L);printf("%d %d\n",parsed,diagnostic_count);for(int x=2;x<=78;x++)for(int y=0;y<=20;y++)printf("%d %d\n",levl[x][y].typ,levl[x][y].lit);return 0;}
