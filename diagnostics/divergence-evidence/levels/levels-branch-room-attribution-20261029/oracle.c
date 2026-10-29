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
struct mkroom {int lx,ly,hx,hy,irregular;};
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
struct {int debug_overwrite_stairs,debug_fuzzer;} iflags;
static int is_ice(int x,int y){assert(levl[x][y].typ==ROOM || levl[x][y].typ==CORR || levl[x][y].typ==AIR);return levl[x][y].typ==ICE;}
static void obj_ice_effects(int x,int y,int b){abort();}
static void spot_stop_timers(int x,int y,int t){abort();}
static void count_level_features(void){abort();}
static void del_engr_at(int x,int y){abort();}




#define ROOMOFFSET 3
#define LA_UP 1
#define LA_DOWN 2
#define BR_STAIR 0
#define BR_NO_END1 1
#define BR_NO_END2 2
#define BR_PORTAL 3
#define UNUSED
#define ladder flags
typedef struct {int x,y;}coord;
typedef struct {int dnum,dlevel;}d_level;
typedef struct {d_level end1,end2;int type,end1_up;}branch;
typedef struct stairway {int sx,sy,up,isladder,u_traversed;d_level tolev;struct stairway*next;}stairway;
#define alloc malloc
#define assign_level(a,b) (*(a)=*(b))
static struct {stairway*stairs;}gs;
static struct {d_level uz,ucamefrom;}u;
static struct {int made_branch;}gm;
static struct {int nroom;}svn;
static struct {struct mkroom rooms[4];}svr;
static int lookupIndex;
static void impossible(const char*s,...){abort();}
static struct mkroom*find_branch_room(coord*p){abort();}
static void mkportal(int x,int y,int dnum,int dlevel){abort();}
boolean
on_level(d_level *lev1, d_level *lev2)
{
    return (boolean) (lev1->dnum == lev2->dnum
                      && lev1->dlevel == lev2->dlevel);
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

static struct mkroom *
pos_to_room(coordxy x, coordxy y)
{
    int i;
    struct mkroom *curr;

    for (curr = svr.rooms, i = 0; i < svn.nroom; curr++, i++)
        if (inside_room(curr, x, y))
            return curr;
    ;
    return (struct mkroom *) 0;
}

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

void
place_branch(
    branch *br,       /* branch to place */
    coordxy x, coordxy y) /* location */
{
    coord m = {0};
    d_level *dest;
    boolean make_stairs;

    /*
     * Return immediately if there is no branch to make or we have
     * already made one.  This routine can be called twice when
     * a special level is loaded that specifies an SSTAIR location
     * as a favored spot for a branch.
     */
    if (!br || gm.made_branch)
        return;

    if (!x) { /* find random coordinates for branch */
        /* br_room = find_branch_room(&m); */
        (void) find_branch_room(&m);  /* sets m via mazexy() or somexy() */
        x = m.x;
        y = m.y;
    } else {
        (void) pos_to_room(x, y);
    }

    if (on_level(&br->end1, &u.uz)) {
        /* we're on end1 */
        make_stairs = br->type != BR_NO_END1;
        dest = &br->end2;
    } else {
        /* we're on end2 */
        make_stairs = br->type != BR_NO_END2;
        dest = &br->end1;
    }

    if (br->type == BR_PORTAL) {
        if (iflags.debug_fuzzer && (u.ucamefrom.dnum || u.ucamefrom.dlevel))
            mkportal(x, y, u.ucamefrom.dnum, u.ucamefrom.dlevel);
        else
            mkportal(x, y, dest->dnum, dest->dlevel);
    } else if (make_stairs) {
        boolean goes_up = on_level(&br->end1, &u.uz) ? br->end1_up
                                                     : !br->end1_up;

        stairway_add(x, y, goes_up, FALSE, dest);
        (void) set_levltyp(x, y, STAIRS);
        levl[x][y].ladder = goes_up ? LA_UP : LA_DOWN;
    }
    /*
     * Set made_branch to TRUE even if we didn't make a stairwell (i.e.
     * make_stairs is false) since there is currently only one branch
     * per level, if we failed once, we're going to fail again on the
     * next call.
     */
    gm.made_branch = TRUE;
}

int main(void){int layout,typ,end,type,up,stop;while(scanf("%d%d%d%d%d%d",&layout,&typ,&end,&type,&up,&stop)==6){memset(levl,0,sizeof levl);memset(&svr,0,sizeof svr);gs.stairs=NULL;gm.made_branch=stop==1;svn.nroom=layout==0?0:1;svr.rooms[0]=(struct mkroom){10,6,14,10,layout>=2};levl[12][8].typ=typ;if(layout==2)levl[12][8].roomno=ROOMOFFSET;if(layout==3){levl[12][8].roomno=ROOMOFFSET;levl[12][8].edge=1;}branch b={.end1={0,2},.end2={1,1},.type=type,.end1_up=up};u.uz=end?b.end2:b.end1;struct mkroom*room=pos_to_room(12,8);lookupIndex=room?(int)(room-svr.rooms):-1;place_branch(stop==2?NULL:&b,12,8);printf("%d %d %d %d",lookupIndex,gm.made_branch,levl[12][8].typ,levl[12][8].ladder);if(gs.stairs){assert(!gs.stairs->next);printf(" %d %d %d %d %d %d %d",gs.stairs->sx,gs.stairs->sy,gs.stairs->up,gs.stairs->isladder,gs.stairs->tolev.dnum,gs.stairs->tolev.dlevel,gs.stairs->u_traversed);free(gs.stairs);}puts("");}return 0;}
