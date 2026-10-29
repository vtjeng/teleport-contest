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
typedef struct {int style,fg;} lua_State;
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
static int is_ice(int x,int y){assert(levl[x][y].typ==STONE || levl[x][y].typ==ROOM || levl[x][y].typ==ICE);return levl[x][y].typ==ICE;}
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
static int get_table_option(lua_State*L,const char*k,const char*d,const char*const*o){assert(!strcmp(k,"style")&&!strcmp(d,"solidfill")&&!strcmp(o[0],"solidfill")&&!strcmp(o[1],"mazegrid"));return L->style;}
static int get_table_mapchr_opt(lua_State*L,const char*k,int d){if(!strcmp(k,"fg"))return L->fg;if(!strcmp(k,"bg"))return L->fg==ICE?ICE:d;assert(!strcmp(k,"filling"));return d;}
static int get_table_boolean_opt(lua_State*L,const char*k,int d){assert(L);if(!strcmp(k,"lit"))return 0;return d;}
static int get_table_int_opt(lua_State*L,const char*k,int d){assert(L&&(!strcmp(k,"corrwid")||!strcmp(k,"wallthick")));return d;}
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
int main(int argc,char**argv){assert(argc==3);int prop=atoi(argv[1]);assert(prop==8||prop==16);icedpools=prop==8;lua_State L={0,ROOM};lspo_level_init(&L);terrain t={ICE,0};for(int x=10;x<13;x++)for(int y=6;y<9;y++){sel_set_ter(x,y,&t);printf("%s%d",x==10&&y==6?"":",",levl[x][y].icedpool);}puts("");if(!strcmp(argv[2],"terrain")){for(int x=10;x<13;x++)for(int y=6;y<9;y++)sel_set_ter(x,y,&t);}else{assert(!strcmp(argv[2],"solidfill")||!strcmp(argv[2],"mazegrid"));L.style=!strcmp(argv[2],"mazegrid");L.fg=ICE;lspo_level_init(&L);}for(int x=10;x<13;x++)for(int y=6;y<9;y++)printf("%d,%d,%d,%d\n",x,y,levl[x][y].typ,levl[x][y].icedpool);return 0;}
