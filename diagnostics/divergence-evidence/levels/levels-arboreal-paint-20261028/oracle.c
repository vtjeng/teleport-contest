/* Exact upstream functions below; wrapper stubs must remain uncalled for this domain. */
#include <stdio.h>
#include <stdlib.h>
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

int main(void){
 for(int mode=0;mode<3;mode++){
  levl[10][10]=(struct cell){.typ=SDOOR,.flags=8};
  levl[9][10]=(struct cell){.typ=HWALL};
  terrain t={mode==2?SDOOR:AIR,SET_LIT_NOCHANGE};
  if(mode==1) set_levltyp_lit(10,10,t.ter,t.tlit);
  else sel_set_ter(10,10,&t);
  struct cell l=levl[10][10];
  printf("%d %d %d %d\n",l.typ,l.flags,l.horizontal,l.arboreal_sdoor);
 }
}
