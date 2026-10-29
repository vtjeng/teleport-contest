#include <assert.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <strings.h>
typedef int coordxy;typedef short xint16;typedef signed char schar;typedef unsigned char uchar;typedef int boolean;typedef long lua_Integer;typedef long packed_coord;typedef void*genericptr_t;
typedef struct{int x,y;}coord;typedef struct{int dnum,dlevel;}d_level;
#define TRUE 1
#define FALSE 0
#define Bitfield(x,n) unsigned x:n
#define alloc malloc
#define newtrap() (struct trap*)alloc(sizeof(struct trap))
#define assign_level(a,b) (*(a)=*(b))
#define strcmpi strcasecmp
#define panic(...) abort()
#define impossible(...) abort()
#define debugpline2(...) ((void)0)
#define Snprintf snprintf
#define BUFSZ 256
#define FALLTHROUGH
#define IS_DOOR(t) ((t)==DOOR)
#define IS_WALL(t) ((t)>0&&(t)<=DBWALL)
#define IS_ROOM(t) ((t)>=ROOM)
#define IS_AIR(t) ((t)==AIR)
#define IS_FURNITURE(t) ((t)>=STAIRS&&(t)<=ALTAR)
#define CAN_OVERWRITE_TERRAIN(t) ((t)!=LADDER&&(t)!=STAIRS)
#define is_pit(t) ((t)==PIT||(t)==SPIKED_PIT)
#define is_hole(t) ((t)==HOLE||(t)==TRAPDOOR)
#define unhideable_trap(t) ((t)==HOLE)
#define MKTRAP_SEEN 1
#define MKTRAP_MAZEFLAG 2
#define MKTRAP_NOSPIDERONWEB 4
#define MKTRAP_NOVICTIM 8
#define DRY 1
#define SP_COORD_IS_RANDOM 0x1000000L
#define SP_COORD_PACK(x,y) (((x)&0xff)+(((y)&0xff)<<16))
#define SP_COORD_PACK_RANDOM(f) (SP_COORD_IS_RANDOM|(f))
#define LUA_TSTRING 4
#define LUA_TTABLE 5
#define TT_BEARTRAP 1
#define TT_WEB 2
#define TT_PIT 3
#define TT_LAVA 4
#define BOULDER 1
#define SHOPBASE 14
#define SHOP_HOLE_COST 100
#define DB_UNDER 28
#define DB_ICE 16
#define DB_FLOOR 0
#define MELT_ICE_AWAY 0
#define PM_GIANT_SPIDER 0
#define NO_MM_FLAGS 0
#define Inhell 0
#define Sokoban 0
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
enum trap_types {
    ALL_TRAPS    = -1, /* mon_knows_traps(), mon_learns_traps() */
    NO_TRAP      =  0,
    ARROW_TRAP   =  1,
    DART_TRAP    =  2,
    ROCKTRAP     =  3,
    SQKY_BOARD   =  4,
    BEAR_TRAP    =  5,
    LANDMINE     =  6,
    ROLLING_BOULDER_TRAP = 7,
    SLP_GAS_TRAP =  8,
    RUST_TRAP    =  9,
    FIRE_TRAP    = 10,
    PIT          = 11,
    SPIKED_PIT   = 12,
    HOLE         = 13,
    TRAPDOOR     = 14,
    TELEP_TRAP   = 15,
    LEVEL_TELEP  = 16,
    MAGIC_PORTAL = 17,
    WEB          = 18,
    STATUE_TRAP  = 19,
    MAGIC_TRAP   = 20,
    ANTI_MAGIC   = 21,
    POLY_TRAP    = 22,
    VIBRATING_SQUARE = 23, /* not a trap but shown/remembered as if one
                            * once it has been discovered */

    /* trapped door and trapped chest aren't traps on the map, but they
       might be shown/remembered as such after trap detection until hero
       comes in view of them and sees the feature or object;
       key-using or door-busting monsters who survive a door trap learn
       to avoid other such doors [not implemented] */
    TRAPPED_DOOR = 24, /* part of door; not present on map as a trap */
    TRAPPED_CHEST = 25, /* part of object; not on map */

    TRAPNUM = 26
};
union vlaunchinfo {
    short v_launch_otyp; /* type of object to be triggered */
    coord v_launch2;     /* secondary launch point (for boulders) */
    uchar v_conjoined;   /* conjoined pit locations */
    short v_tnote;       /* boards: 12 notes        */
};

struct trap {
    struct trap *ntrap;
    coordxy tx, ty;
    d_level dst; /* destination for portals/holes/trapdoors */
    coord launch;
#define teledest launch /* x,y destination for teleport traps, if > 0 */
    Bitfield(ttyp, 5);
    Bitfield(tseen, 1);
    Bitfield(once, 1);
    Bitfield(madeby_u, 1); /* So monsters may take offence when you trap
                            * them.  Recognizing who made the trap isn't
                            * completely unreasonable; everybody has
                            * their own style.  This flag is also needed
                            * when you untrap a monster.  It would be too
                            * easy to make a monster peaceful if you could
                            * set a trap for it and then untrap it. */
    union vlaunchinfo vl;
#define launch_otyp vl.v_launch_otyp
#define launch2 vl.v_launch2
#define conjoined vl.v_conjoined
#define tnote vl.v_tnote
};


struct rm{int typ,flags;};static struct rm levl[80][21];
#define drawbridgemask flags
struct mkroom{int unused;};static struct{struct{struct mkroom*croom;}*coder;}gc;
static struct{struct trap*ftrap;}gf;static struct{coord launchplace;}gl;static struct{int xstart;}gx={1};static struct{int ystart;}gy;
static struct{d_level uz,ucamefrom;int utrap,utraptype;}u;
static struct{struct{int mon_moving;}context;}svc;static struct{struct{struct{int is_maze_lev,is_cavernous_lev;}flags;}level;}svl;static struct{int in_mklev;}gi={1};static int mons[1];
static int isok(int x,int y){return x>0&&x<80&&y>=0&&y<21;}
static struct trap*t_at(int x,int y){assert(x==11&&y==6&&!gf.ftrap);return NULL;}
static int is_pool_or_lava(int x,int y){assert(x==11&&y==6&&levl[x][y].typ==ROOM);return 0;}
static int level_difficulty(void){return 1;}
static int rnd(int n){assert(n==4);return 1;}
static int rn2(int n){abort();}
static int Is_rogue_level(d_level*l){abort();}
static int traptype_roguelvl(void){abort();}static int traptype_rnd(int n){abort();}
static int Can_fall_thru(d_level*l){abort();}static int single_level_branch(d_level*l){abort();}
static int undestroyable_trap(int t){abort();}static int u_at(int x,int y){abort();}static int is_lava(int x,int y){abort();}static void reset_utrap(int b){abort();}
static int choose_trapnote(struct trap*t){abort();}static void mk_trap_statue(int x,int y){abort();}static int mkroll_launch(struct trap*t,int x,int y,int o,long n){abort();}
static void hole_destination(d_level*l){abort();}static char*in_rooms(int x,int y,int typ){abort();}static void add_damage(int x,int y,long n){abort();}
static void obj_ice_effects(int x,int y,int b){abort();}static void spot_stop_timers(int x,int y,int t){abort();}static int set_levltyp(int x,int y,int t){abort();}
static void unearth_objs(int x,int y){abort();}static void recalc_block_point(int x,int y){abort();}static void maybe_finish_sokoban(void){abort();}
static void paniclog(const char*a,const char*b){abort();}static void mazexy(coord*c){abort();}static int somexyspace(struct mkroom*r,coord*c){abort();}
static int occupied(int x,int y){abort();}static void*sobj_at(int o,int x,int y){abort();}static void*makemon(int*m,int x,int y,int flags){abort();}static void mktrap_victim(struct trap*t){abort();}
typedef struct{packed_coord coord;coordxy x,y;xint16 type;boolean spider_on_web,seen,novictim;}spltrap;
static struct{coord inv_pos;}svi;
static void pick_vibrasquare_location(void){abort();}static void get_free_room_loc(int*x,int*y,struct mkroom*r,long pos){abort();}
static void get_location_coord(int*x,int*y,int humidity,struct mkroom*r,long pos){assert(humidity==DRY&&!r&&pos==SP_COORD_PACK(10,6));*x=11;*y=6;}
typedef struct{const char*name,*field;}lua_State;
static void create_des_coder(void){static struct{struct mkroom*croom;}coder;gc.coder=(void*)&coder;}
static int lua_gettop(lua_State*L){return 3;}
static int lua_type(lua_State*L,int i){assert(i==1);return LUA_TSTRING;}
static const char*luaL_checkstring(lua_State*L,int i){assert(i==1);return L->name;}
static lua_Integer luaL_checkinteger(lua_State*L,int i){assert(i==2||i==3);return i==2?10:6;}
static void nhl_error(lua_State*L,const char*s){abort();}
static void lcheck_param_table(lua_State*L){abort();}static void get_table_xy_or_coord(lua_State*L,lua_Integer*x,lua_Integer*y){abort();}
static int get_table_traptype_opt(lua_State*L,const char*k,int d){abort();}static int get_table_boolean_opt(lua_State*L,const char*k,int d){abort();}
static int get_coord(lua_State*L,int i,lua_Integer*x,lua_Integer*y){abort();}static void lua_getfield(lua_State*L,int i,const char*k){abort();}static void lua_pop(lua_State*L,int n){abort();}
static const struct {
    const char *name;
    int type;
} trap_types[] = { { "arrow", ARROW_TRAP },
                   { "dart", DART_TRAP },
                   { "falling rock", ROCKTRAP },
                   { "board", SQKY_BOARD },
                   { "bear", BEAR_TRAP },
                   { "land mine", LANDMINE },
                   { "rolling boulder", ROLLING_BOULDER_TRAP },
                   { "sleep gas", SLP_GAS_TRAP },
                   { "rust", RUST_TRAP },
                   { "fire", FIRE_TRAP },
                   { "pit", PIT },
                   { "spiked pit", SPIKED_PIT },
                   { "hole", HOLE },
                   { "trap door", TRAPDOOR },
                   { "teleport", TELEP_TRAP },
                   { "level teleport", LEVEL_TELEP },
                   { "magic portal", MAGIC_PORTAL },
                   { "web", WEB },
                   { "statue", STATUE_TRAP },
                   { "magic", MAGIC_TRAP },
                   { "anti magic", ANTI_MAGIC },
                   { "polymorph", POLY_TRAP },
                   { "vibrating square", VIBRATING_SQUARE },
                   { "random", -1 },
                   { 0, NO_TRAP } };
struct trap *
maketrap(coordxy x, coordxy y, int typ)
{
    static union vlaunchinfo zero_vl;
    boolean oldplace, was_ice, clear_flags;
    struct trap *ttmp;
    struct rm *lev = &levl[x][y];

    if (typ == TRAPPED_DOOR || typ == TRAPPED_CHEST)
        return (struct trap *) 0;

    if ((ttmp = t_at(x, y)) != 0) {
        if (undestroyable_trap(ttmp->ttyp))
            return (struct trap *) 0;
        oldplace = TRUE;
        if (u.utrap && u_at(x, y)
            && ((u.utraptype == TT_BEARTRAP && typ != BEAR_TRAP)
                || (u.utraptype == TT_WEB && typ != WEB)
                || (u.utraptype == TT_PIT && !is_pit(typ))
                || (u.utraptype == TT_LAVA && !is_lava(x, y))))
            reset_utrap(FALSE);
        /* old <tx,ty> remain valid */
    } else if (!CAN_OVERWRITE_TERRAIN(lev->typ) /* stairs */
               || is_pool_or_lava(x, y)
               || (IS_FURNITURE(lev->typ) && (typ != PIT && typ != HOLE))
               || (lev->typ == DRAWBRIDGE_UP && typ == MAGIC_PORTAL)
               || (IS_AIR(lev->typ) && typ != MAGIC_PORTAL)
               || (typ == LEVEL_TELEP && single_level_branch(&u.uz))) {
        /* no trap on top of furniture (caller usually screens the
           location to inhibit this, but wizard mode wishing doesn't)
           and no level teleporter in branch with only one level */
        return (struct trap *) 0;
    } else {
        oldplace = FALSE;
        ttmp = newtrap();
        (void) memset((genericptr_t) ttmp, 0, sizeof(struct trap));
        ttmp->ntrap = 0;
        ttmp->tx = x;
        ttmp->ty = y;
    }
    /* [re-]initialize all fields except ntrap (handled below) and <tx,ty> */
    ttmp->vl = zero_vl;
    ttmp->launch.x = ttmp->launch.y = -1; /* force error if used before set */
    ttmp->dst.dnum = ttmp->dst.dlevel = -1;
    ttmp->madeby_u = 0;
    ttmp->once = 0;
    ttmp->tseen = unhideable_trap(typ);
    ttmp->ttyp = typ;

    switch (typ) {
    case SQKY_BOARD:
        ttmp->tnote = choose_trapnote(ttmp);
        break;
    case STATUE_TRAP: /* create a "living" statue */
        mk_trap_statue(x, y);
        break;
    case ROLLING_BOULDER_TRAP: /* boulder will roll towards trigger */
        (void) mkroll_launch(ttmp, x, y, BOULDER, 1L);
        break;
    case PIT:
    case SPIKED_PIT:
        ttmp->conjoined = 0;
        FALLTHROUGH;
        /*FALLTHRU*/
    case HOLE:
    case TRAPDOOR:
        if (is_hole(typ))
            hole_destination(&(ttmp->dst));
        if (*in_rooms(x, y, SHOPBASE)
            && (is_hole(typ) || IS_DOOR(lev->typ) || IS_WALL(lev->typ)))
            add_damage(x, y, /* schedule repair */
                       ((IS_DOOR(lev->typ) || IS_WALL(lev->typ))
                        && !svc.context.mon_moving) ? SHOP_HOLE_COST : 0L);

        clear_flags = TRUE; /* assume lev->flags needs to be reset */
        /* DRAWBRIDGE_UP passes the IS_ROOM() test so check it first;
           it also needs to retain lev->drawbridgemask */
        if (lev->typ == DRAWBRIDGE_UP) {
            /* bridge is closed and we're putting a hole or pit at the span
               spot; this trap will be deleted if/when the bridge is opened;
               terrain becomes room floor even if it was moat, lava, or ice */
            clear_flags = FALSE; /* keep lev->drawbridgemask */
            was_ice = (lev->drawbridgemask & DB_UNDER) == DB_ICE;
            lev->drawbridgemask &= ~DB_UNDER;
            lev->drawbridgemask |= DB_FLOOR;
            if (was_ice) {
                /* subset of set_levltyp() after changing ice to floor;
                   frozen corpses resume rotting, no more ice to melt away */
                obj_ice_effects(x, y, TRUE);
                spot_stop_timers(x, y, MELT_ICE_AWAY);
            }
        } else if (IS_ROOM(lev->typ)) {
            (void) set_levltyp(x, y, ROOM);

        /*
         * some cases which can happen when digging
         * down while phasing thru solid areas
         */
        } else if (lev->typ == STONE || lev->typ == SCORR) {
            (void) set_levltyp(x, y, CORR);
        } else if (IS_WALL(lev->typ) || lev->typ == SDOOR) {
            (void) set_levltyp(x, y, svl.level.flags.is_maze_lev ? ROOM
                                     : svl.level.flags.is_cavernous_lev ? CORR
                                       : DOOR);
        }
        if (clear_flags)
            lev->flags = 0; /* set_levltyp doesn't take care of this [yet?] */

        unearth_objs(x, y);
        recalc_block_point(x, y);
        break;
    case TELEP_TRAP:
        if (isok(gl.launchplace.x, gl.launchplace.y)) {
            ttmp->teledest.x = gx.xstart + gl.launchplace.x;
            ttmp->teledest.y = gy.ystart + gl.launchplace.y;
            if (ttmp->teledest.x == x && ttmp->teledest.y == y) {
                impossible("making fixed-dest tele trap pointing to itself");
            }
        }
        break;
    }

    if (!oldplace) {
        ttmp->ntrap = gf.ftrap;
        gf.ftrap = ttmp;
    } else {
        /* oldplace;
           it shouldn't be possible to override a sokoban pit or hole
           with some other trap, but we'll check just to be safe */
        if (Sokoban)
            maybe_finish_sokoban();
    }
    return ttmp;
}

void
mktrap(
    int num,              /* if non-zero, specific type of trap to make */
    unsigned mktrapflags, /* MKTRAP_{SEEN,MAZEFLAG,NOSPIDERONWEB,NOVICTIM} */
    struct mkroom *croom, /* room to hold trap */
    coord *tm)            /* specific location for trap */
{
    static int mktrap_err = 0; /* move to struct g? */
    struct trap *t;
    coord m;
    int kind;
    unsigned lvl = level_difficulty();

    if (!tm && !croom && !(mktrapflags & MKTRAP_MAZEFLAG)) {
        /* complain when the combination of arguments will never set 'm' */
        if (!mktrap_err++) {
            char errbuf[BUFSZ];

            Snprintf(errbuf, sizeof errbuf,
                     "args (%d,%d,%s,%s) are invalid",
                     num, mktrapflags, "null room", "null location");
            paniclog("mktrap", errbuf);
        }
        return;
    }
    m.x = m.y = 0;

    /* no traps in pools */
    if (tm && is_pool_or_lava(tm->x, tm->y))
        return;

    if (num > NO_TRAP && num < TRAPNUM) {
        kind = num;
    } else if (Is_rogue_level(&u.uz)) {
        kind = traptype_roguelvl();
    } else if (Inhell && !rn2(5)) {
        /* bias the frequency of fire traps in Gehennom */
        kind = FIRE_TRAP;
    } else {
        do {
            kind = traptype_rnd(mktrapflags);
        } while (kind == NO_TRAP);
    }

    if (is_hole(kind) && !Can_fall_thru(&u.uz))
        kind = ROCKTRAP;

    if (tm) {
        m = *tm;
    } else {
        int tryct = 0;
        boolean avoid_boulder = (is_pit(kind) || is_hole(kind));

        do {
            if (++tryct > 200)
                return;
            if ((mktrapflags & MKTRAP_MAZEFLAG) != 0)
                mazexy(&m);
            else if (croom && !somexyspace(croom, &m))
                return;
        } while (occupied(m.x, m.y)
                 || (avoid_boulder && sobj_at(BOULDER, m.x, m.y)));
    }

    t = maketrap(m.x, m.y, kind);
    /* we should always get type of trap we're asking for (occupied() test
       should prevent cases where that might not happen) but be paranoid */
    kind = t ? t->ttyp : NO_TRAP;

    if (kind == WEB && !(mktrapflags & MKTRAP_NOSPIDERONWEB))
        (void) makemon(&mons[PM_GIANT_SPIDER], m.x, m.y, NO_MM_FLAGS);
    if (t && (mktrapflags & MKTRAP_SEEN))
        t->tseen = TRUE;
    if (kind == MAGIC_PORTAL && (u.ucamefrom.dnum || u.ucamefrom.dlevel)) {
        assign_level(&t->dst, &u.ucamefrom);
    }

    /* The hero isn't the only person who's entered the dungeon in
       search of treasure. On the very shallowest levels, there's a
       chance that a created trap will have killed something already
       (and this is guaranteed on the first level).

       This isn't meant to give any meaningful treasure (in fact, any
       items we drop here are typically cursed, other than ammo fired
       by the trap). Rather, it's mostly just for flavour and to give
       players on very early levels a sufficient chance to avoid traps
       that may end up killing them before they have a fair chance to
       build max HP. Including cursed items gives the same fair chance
       to the starting pet, and fits the rule that possessions of the
       dead are normally cursed.

       Some types of traps are excluded because they're entirely
       nonlethal, even indirectly. We also exclude all of the
       later/fancier traps because they tend to have special
       considerations (e.g. webs, portals), often are indirectly
       lethal, and tend not to generate on shallower levels anyway
       (exception: magic traps can generate on dlvl 1 and be
       immediately lethal). Finally, pits are excluded because it's
       weird to see an item in a pit and yet not be able to identify
       that the pit is there. */
    if (gi.in_mklev
        && kind != NO_TRAP && !(mktrapflags & MKTRAP_NOVICTIM)
        && lvl <= (unsigned) rnd(4)
        && kind != SQKY_BOARD && kind != RUST_TRAP
        /* rolling boulder trap might not have a boulder if there was no
           viable path (such as when placed in the corner of a room), in
           which case tx,ty==launch.x,y; no boulder => no dead predecessor */
        && !(kind == ROLLING_BOULDER_TRAP
             && t->launch.x == t->tx && t->launch.y == t->ty)
        && !is_pit(kind) && (kind < HOLE || kind == MAGIC_TRAP)) {
        if (kind == LANDMINE) {
            /* if victim was killed by a land mine, we won't scatter objects;
               treat it as exploded, converting it into an unconcealed pit */
            t->ttyp = PIT;
            t->tseen = 1;
        }
        mktrap_victim(t);
    }
    return;
}

void
create_trap(spltrap *t, struct mkroom *croom)
{
    coordxy x = -1, y = -1;
    coord tm;
    unsigned mktrap_flags = MKTRAP_MAZEFLAG;

    if (t->type == VIBRATING_SQUARE) {
        pick_vibrasquare_location();
        maketrap(svi.inv_pos.x, svi.inv_pos.y, VIBRATING_SQUARE);
        return;
    } else if (croom) {
        get_free_room_loc(&x, &y, croom, t->coord);
    } else {
        int trycnt = 0;

        do {
            get_location_coord(&x, &y, DRY, croom, t->coord);
        } while ((levl[x][y].typ == STAIRS || levl[x][y].typ == LADDER)
                 && ++trycnt <= 100);
        if (trycnt > 100)
            return;
    }

    if (!t->spider_on_web)
        mktrap_flags |= MKTRAP_NOSPIDERONWEB;
    if (t->seen)
        mktrap_flags |= MKTRAP_SEEN;
    if (t->novictim)
        mktrap_flags |= MKTRAP_NOVICTIM;

    tm.x = x;
    tm.y = y;

    mktrap(t->type, mktrap_flags, (struct mkroom *) 0, &tm);
}

int
get_traptype_byname(const char *trapname)
{
    int i;

    for (i = 0; trap_types[i].name; i++)
        if (!strcmpi(trapname, trap_types[i].name))
            return trap_types[i].type;

    return NO_TRAP;
}

int
lspo_trap(lua_State *L)
{
    spltrap tmptrap;
    lua_Integer x, y;
    int argc = lua_gettop(L);

    create_des_coder();

    tmptrap.spider_on_web = TRUE;
    tmptrap.seen = FALSE;
    tmptrap.novictim = FALSE;

    if (argc == 1 && lua_type(L, 1) == LUA_TSTRING) {
        const char *trapstr = luaL_checkstring(L, 1);

        tmptrap.type = get_traptype_byname(trapstr);
        x = y = -1;
    } else if (argc == 2 && lua_type(L, 1) == LUA_TSTRING
               && lua_type(L, 2) == LUA_TTABLE) {
        const char *trapstr = luaL_checkstring(L, 1);

        tmptrap.type = get_traptype_byname(trapstr);
        (void) get_coord(L, 2, &x, &y);
    } else if (argc == 3) {
        const char *trapstr = luaL_checkstring(L, 1);

        tmptrap.type = get_traptype_byname(trapstr);
        x = luaL_checkinteger(L, 2);
        y = luaL_checkinteger(L, 3);
    } else {
        lcheck_param_table(L);

        get_table_xy_or_coord(L, &x, &y);
        tmptrap.type = get_table_traptype_opt(L, "type", -1);
        tmptrap.spider_on_web = get_table_boolean_opt(L, "spider_on_web", 1);
        tmptrap.seen = get_table_boolean_opt(L, "seen", FALSE);
        tmptrap.novictim = !get_table_boolean_opt(L, "victim", TRUE);

        lua_getfield(L, -1, "launchfrom");
        if (lua_type(L, -1) == LUA_TTABLE) {
            lua_Integer lx = -1, ly = -1;

            (void) get_coord(L, -1, &lx, &ly);
            lua_pop(L, 1);
            gl.launchplace.x = lx;
            gl.launchplace.y = ly;
        } else
            lua_pop(L, 1);

        lua_getfield(L, -1, "teledest");
        if (lua_type(L, -1) == LUA_TTABLE) {
            lua_Integer lx = -1, ly = -1;

            (void) get_coord(L, -1, &lx, &ly);
            lua_pop(L, 1);
            gl.launchplace.x = lx;
            gl.launchplace.y = ly;
        } else
            lua_pop(L, 1);
    }

    if (tmptrap.type == NO_TRAP)
        nhl_error(L, "Unknown trap type");

    if (x == -1 && y == -1)
        tmptrap.coord = SP_COORD_PACK_RANDOM(0);
    else
        tmptrap.coord = SP_COORD_PACK(x, y);

    create_trap(&tmptrap, gc.coder->croom);
    gl.launchplace.x = gl.launchplace.y = 0;

    return 0;
}

int main(int argc,char**argv){assert(argc==2);size_t n=strlen(argv[1]);assert(n%2==0&&n<1000);char*name=calloc(n/2+1,1);for(size_t i=0;i<n/2;i++){unsigned v;assert(sscanf(argv[1]+2*i,"%2x",&v)==1);name[i]=(char)v;}for(int x=0;x<80;x++)for(int y=0;y<21;y++)levl[x][y].typ=ROOM;lua_State L={name,NULL};lspo_trap(&L);assert(gf.ftrap&&!gf.ftrap->ntrap);struct trap*t=gf.ftrap;assert(t->ttyp==RUST_TRAP||t->ttyp==ANTI_MAGIC);printf("%d %d %d %d\n",t->tx,t->ty,t->ttyp,t->tseen);free(t);free(name);}
