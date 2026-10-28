/* Exact upstream functions below; wrapper stubs must remain uncalled for this domain. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
typedef int coordxy; typedef signed char schar; typedef int boolean; typedef void *genericptr_t;
typedef struct { int ter,tlit; } terrain;
#define staticfn static
#define TRUE 1
#define FALSE 0
#define STONE 0
#define HWALL 2
#define SDOOR 14
#define IRONBARS 22
#define LAVAPOOL 20
#define DOOR 23
#define ICE 33
#define AIR 35
#define CLOUD 36
#define MAX_TYPE 37
#define D_CLOSED 4
#define D_SECRET 32
#define ROOM 25
#define IS_DOORJOIN(t) ((t)<15 || (t)==IRONBARS)
#define SET_LIT_NOCHANGE -2
#define SET_LIT_RANDOM -1
#define ICED_POOL 8
#define ICED_MOAT 16
#define MELT_ICE_AWAY 1
#define CAN_OVERWRITE_TERRAIN(t) ((t)!=26 && (t)!=27)
#define IS_LAVA(t) ((t)==20 || (t)==21)
#define IS_FOUNTAIN(t) ((t)==28)
#define IS_SINK(t) ((t)==30)
#define IS_DOOR(t) ((t)==DOOR)
#define IS_WALL(t) ((t)>0 && (t)<=12)
struct cell {int typ,flags,horizontal,lit,arboreal_sdoor;};
#define doormask flags
#define icedpool flags
static struct cell levl[80][21];
static int SpLev_Map[80][21];
static int splev_init_present=0,icedpools=0;
static int isok(int x,int y){return x>=1&&x<80&&y>=0&&y<21;}
static int is_ice(int x,int y){return levl[x][y].typ==ICE;}
static void obj_ice_effects(int x,int y,int z){abort();}
static void spot_stop_timers(int x,int y,int z){abort();}
static void count_level_features(void){abort();}
static void del_engr_at(int x,int y){abort();}
static int rn2(int n){abort();}
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

/* set map terrain type and light state */
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
staticfn void
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

staticfn void
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
staticfn void
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
/* Public descriptor equivalents, with default whole-level xstart=1.
 * Literal coordinates require no random resolution; callbacks receive x+1.
 * These wrappers are not a Lua interpreter. */
static void terrain_at(int x,int y,int typ){
 terrain t={typ,SET_LIT_NOCHANGE};sel_set_ter(x+1,y,&t);
}
static void door_at(int x,int y,int mask){sel_set_door(x+1,y,&mask);}
int main(void){
 for(int mode=0;mode<3;mode++){
  memset(levl,0,sizeof levl);memset(SpLev_Map,0,sizeof SpLev_Map);
  for(int x=9;x<=11;x++)for(int y=9;y<=11;y++)terrain_at(x,y,ROOM);
  door_at(10,10,D_SECRET);
  door_at(10,10,8); /* D_LOCKED; existing SDOOR is retained by sel_set_door */
  terrain_at(9,10,HWALL);
  struct cell before=levl[11][10];
  assert(before.typ==SDOOR && before.flags==8 && before.horizontal==0 && !before.arboreal_sdoor);
  terrain t={mode==2?SDOOR:AIR,SET_LIT_NOCHANGE};
  if(mode==1) set_levltyp_lit(11,10,t.ter,t.tlit);
  else terrain_at(10,10,t.ter);
  struct cell l=levl[11][10];
  printf("%d %d %d %d\n",l.typ,l.flags,l.horizontal,l.arboreal_sdoor);
 }
}
