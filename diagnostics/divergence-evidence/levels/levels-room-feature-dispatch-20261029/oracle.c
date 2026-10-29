#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <assert.h>
typedef int boolean;typedef int16_t coordxy;typedef struct {coordxy x,y;}coord;
#define TRUE 1
#define FALSE 0
#define COLNO 80
#define ROWNO 21
#define ROOMOFFSET 3
#define ROOM 25
#define CORR 24
#define ICE 33
#define SDOOR 14
#define DOOR 23
#define FOUNTAIN 28
#define IS_DOOR(t) ((t)==DOOR)
#define IS_WALL(t) ((t)>0&&(t)<=12)
#define IS_FURNITURE(t) ((t)>=26&&(t)<=32)
struct mkroom {coordxy lx,hx,ly,hy;int irregular,nsubrooms,rtype,needfill;struct mkroom *sbrooms[4];};
static struct {struct mkroom rooms[4];}svr;
static struct {int typ,lit,edge,roomno,blessedftn,altarmask,arboreal_sdoor;}levl[80][21];
static int isok(int x,int y){return x>0&&x<80&&y>=0&&y<21;}
/* Fixture has no traps, fluids or invocation square; not their implementations. */
static void*t_at(int x,int y){assert(isok(x,y));return NULL;}
static int is_lava(int x,int y){assert(levl[x][y].typ==ROOM||levl[x][y].typ==FOUNTAIN);return 0;}
static int is_pool(int x,int y){return is_lava(x,y);}
static int invocation_pos(int x,int y){return is_lava(x,y);}
boolean occupied(coordxy,coordxy); boolean bydoor(coordxy,coordxy);
static int calls,tape[1000],draw,draws,bound;
static int rn1(int n,int b){assert(calls<1000);int v=tape[calls++];assert(v>=0&&v<n);return b+v;}

typedef signed char schar;typedef int aligntyp;
#define STONE 0
#define MAX_TYPE 37
#define SINK 30
#define ALTAR 32
#define AIR 35
#define STAIRS 26
#define LADDER 27
#define MELT_ICE_AWAY 0
#define A_LAWFUL 1
#define A_NONE (-128)
#define AM_NONE 0
#define AM_LAWFUL 4
#define Align2amask(x) \
    ((unsigned) (((x) == A_NONE) ? AM_NONE                      \
                 : ((x) == A_LAWFUL) ? AM_LAWFUL                \
                   : ((x) + 2))) /* -1 => 1, 0 => 2 */
#define FILL_NONE 0
#define FILL_NORMAL 1
#define IS_LAVA(t) ((t)==20 || (t)==21)
#define IS_FOUNTAIN(t) ((t)==FOUNTAIN)
#define IS_SINK(t) ((t)==SINK)
#define CAN_OVERWRITE_TERRAIN(ttyp) \
    (iflags.debug_overwrite_stairs || !((ttyp) == LADDER || (ttyp) == STAIRS))
static struct{int debug_overwrite_stairs;}iflags;
static struct{struct{struct{int nfountains,nsinks,has_shop,has_vault,has_zoo,has_court,has_morgue,has_beehive,has_barracks,has_temple,has_swamp;}flags;}level;}svl;
static int rn2(int n){assert(draw>=0&&draw<n);draws++;bound=n;return draw;}
static int is_ice(int x,int y){assert(levl[x][y].typ==ROOM);return 0;}
static void obj_ice_effects(int x,int y,int b){(void)x;(void)y;(void)b;abort();}
static void spot_stop_timers(int x,int y,int a){(void)x;(void)y;(void)a;abort();}
static struct{int uz;}u;
static int depth(int*p){(void)p;abort();}
static void*mkgold(long a,int x,int y){(void)a;(void)x;(void)y;abort();}
static void fill_zoo(struct mkroom*r){(void)r;abort();}
static int trace[20],nt;
static int flagmask(void){return svl.level.flags.has_shop+(svl.level.flags.has_vault<<1)+(svl.level.flags.has_zoo<<2)+(svl.level.flags.has_court<<3)+(svl.level.flags.has_morgue<<4)+(svl.level.flags.has_beehive<<5)+(svl.level.flags.has_barracks<<6)+(svl.level.flags.has_temple<<7)+(svl.level.flags.has_swamp<<8);}
static void stock_room(int type,struct mkroom*r){assert(nt<17);trace[nt++]=(int)(r-svr.rooms);trace[nt++]=type;trace[nt++]=flagmask();}
enum roomtype_types {
    OROOM      =  0, /* ordinary room */
    THEMEROOM  =  1, /* like OROOM, but never converted to special room */
    COURT      =  2, /* contains a throne */
    SWAMP      =  3, /* contains pools */
    VAULT      =  4, /* detached room usually reached via teleport trap */
    BEEHIVE    =  5, /* contains killer bees and royal jelly */
    MORGUE     =  6, /* contains corpses, undead and graves */
    BARRACKS   =  7, /* contains soldiers and their gear */
    ZOO        =  8, /* floor covered with treasure and monsters */
    DELPHI     =  9, /* contains Oracle and peripherals */
    TEMPLE     = 10, /* contains a shrine (altar attended by priest[ess]) */
    LEPREHALL  = 11, /* leprechaun hall (Tom Proudfoot) */
    COCKNEST   = 12, /* cockatrice nest (Tom Proudfoot) */
    ANTHOLE    = 13, /* ants (Tom Proudfoot) */
    SHOPBASE   = 14, /* everything above this is a shop */
    ARMORSHOP  = 15, /* specific shop defines for level compiler */
    SCROLLSHOP = 16,
    POTIONSHOP = 17,
    WEAPONSHOP = 18,
    FOODSHOP   = 19,
    RINGSHOP   = 20,
    WANDSHOP   = 21,
    TOOLSHOP   = 22,
    BOOKSHOP   = 23,
    FODDERSHOP = 24, /* health food store */
    CANDLESHOP = 25
};
int
somex(struct mkroom *croom)
{
    return rn1(croom->hx - croom->lx + 1, croom->lx);
}

int
somey(struct mkroom *croom)
{
    return rn1(croom->hy - croom->ly + 1, croom->ly);
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

boolean
somexy(struct mkroom *croom, coord *c)
{
    int try_cnt = 0;
    int i;

    if (croom->irregular) {
        i = (int) ((croom - svr.rooms) + ROOMOFFSET);

        while (try_cnt++ < 100) {
            c->x = somex(croom);
            c->y = somey(croom);
            if (!levl[c->x][c->y].edge && (int) levl[c->x][c->y].roomno == i)
                return TRUE;
        }
        /* try harder; exhaustively search until one is found */
        for (c->x = croom->lx; c->x <= croom->hx; c->x++)
            for (c->y = croom->ly; c->y <= croom->hy; c->y++)
                if (!levl[c->x][c->y].edge
                    && (int) levl[c->x][c->y].roomno == i)
                    return TRUE;
        return FALSE;
    }

    if (!croom->nsubrooms) {
        c->x = somex(croom);
        c->y = somey(croom);
        return TRUE;
    }

    /* Check that coords doesn't fall into a subroom or into a wall */

    while (try_cnt++ < 100) {
        c->x = somex(croom);
        c->y = somey(croom);
        if (IS_WALL(levl[c->x][c->y].typ))
            continue;
        for (i = 0; i < croom->nsubrooms; i++)
            if (inside_room(croom->sbrooms[i], c->x, c->y))
                goto you_lose;
        break;
 you_lose:
        ;
    }
    if (try_cnt >= 100)
        return FALSE;
    return TRUE;
}

boolean
somexyspace(struct mkroom* croom, coord *c)
{
    int trycnt = 0;
    boolean okay;

    do {
        okay = somexy(croom, c) && isok(c->x, c->y) && !occupied(c->x, c->y)
            && (levl[c->x][c->y].typ == ROOM
                || levl[c->x][c->y].typ == CORR
                || levl[c->x][c->y].typ == ICE);
    } while (trycnt++ < 100 && !okay);
    return okay;
}

boolean
occupied(coordxy x, coordxy y)
{
    return (boolean) (t_at(x, y) || IS_FURNITURE(levl[x][y].typ)
                      || is_lava(x, y) || is_pool(x, y)
                      || invocation_pos(x, y));
}

boolean
bydoor(coordxy x, coordxy y)
{
    int typ;

    if (isok(x + 1, y)) {
        typ = levl[x + 1][y].typ;
        if (IS_DOOR(typ) || typ == SDOOR)
            return TRUE;
    }
    if (isok(x - 1, y)) {
        typ = levl[x - 1][y].typ;
        if (IS_DOOR(typ) || typ == SDOOR)
            return TRUE;
    }
    if (isok(x, y + 1)) {
        typ = levl[x][y + 1].typ;
        if (IS_DOOR(typ) || typ == SDOOR)
            return TRUE;
    }
    if (isok(x, y - 1)) {
        typ = levl[x][y - 1].typ;
        if (IS_DOOR(typ) || typ == SDOOR)
            return TRUE;
    }
    return FALSE;
}

boolean
find_okay_roompos(struct mkroom *croom, coord *crd)
{
    int tryct = 0;

    do {
        if (++tryct > 200)
            return FALSE;
        if (!somexyspace(croom, crd))
            return FALSE;
    } while (occupied(crd->x, crd->y) || bydoor(crd->x, crd->y));
    return TRUE;
}

void
count_level_features(void)
{
    coordxy x, y;

    svl.level.flags.nfountains = svl.level.flags.nsinks = 0;
    for (y = 0; y < ROWNO; y++)
        for (x = 1; x < COLNO; x++) {
            int typ = levl[x][y].typ;

            if (typ == FOUNTAIN)
                svl.level.flags.nfountains++;
            else if (typ == SINK)
                svl.level.flags.nsinks++;
        }
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
mkfount(struct mkroom *croom)
{
    coord m;

    if (!find_okay_roompos(croom, &m))
        return;

    /* Put a fountain at m.x, m.y */
    if (!set_levltyp(m.x, m.y, FOUNTAIN))
        return;
    /* Is it a "blessed" fountain? (affects drinking from fountain) */
    if (!rn2(7))
        levl[m.x][m.y].blessedftn = 1;

    svl.level.flags.nfountains++;
}

void
mksink(struct mkroom *croom)
{
    coord m;

    if (!find_okay_roompos(croom, &m))
        return;

    /* Put a sink at m.x, m.y */
    if (!set_levltyp(m.x, m.y, SINK))
        return;

    svl.level.flags.nsinks++;
}

void
mkaltar(struct mkroom *croom)
{
    coord m;
    aligntyp al;

    if (croom->rtype != OROOM)
        return;

    if (!find_okay_roompos(croom, &m))
        return;

    /* Put an altar at m.x, m.y */
    if (!set_levltyp(m.x, m.y, ALTAR))
        return;

    /* -1 - A_CHAOTIC, 0 - A_NEUTRAL, 1 - A_LAWFUL */
    al = rn2((int) A_LAWFUL + 2) - 1;
    levl[m.x][m.y].altarmask = Align2amask(al);
}

void
fill_special_room(struct mkroom *croom)
{
    int i;

    if (!croom)
        return;

    /* First recurse into subrooms. We don't want to block an ordinary room
     * with a special subroom from having the subroom filled, or an unfilled
     * outer room preventing a special subroom from being filled. */
    for (i = 0; i < croom->nsubrooms; ++i) {
        fill_special_room(croom->sbrooms[i]);
    }

    if (croom->rtype == OROOM || croom->rtype == THEMEROOM
        || croom->needfill == FILL_NONE)
        return;

    if (croom->needfill == FILL_NORMAL) {
        int x, y;

        /* Shop ? */
        if (croom->rtype >= SHOPBASE) {
            stock_room(croom->rtype - SHOPBASE, croom);
            svl.level.flags.has_shop = TRUE;
            return;
        }

        switch (croom->rtype) {
        case VAULT:
            for (x = croom->lx; x <= croom->hx; x++)
                for (y = croom->ly; y <= croom->hy; y++)
                    (void) mkgold((long) rn1(abs(depth(&u.uz)) * 100, 51),
                                  x, y);
            break;
        case COURT:
        case ZOO:
        case BEEHIVE:
        case ANTHOLE:
        case COCKNEST:
        case LEPREHALL:
        case MORGUE:
        case BARRACKS:
            fill_zoo(croom);
            break;
        }
    }
    switch (croom->rtype) {
    case VAULT:
        svl.level.flags.has_vault = TRUE;
        break;
    case ZOO:
        svl.level.flags.has_zoo = TRUE;
        break;
    case COURT:
        svl.level.flags.has_court = TRUE;
        break;
    case MORGUE:
        svl.level.flags.has_morgue = TRUE;
        break;
    case BEEHIVE:
        svl.level.flags.has_beehive = TRUE;
        break;
    case BARRACKS:
        svl.level.flags.has_barracks = TRUE;
        break;
    case TEMPLE:
        svl.level.flags.has_temple = TRUE;
        break;
    case SWAMP:
        svl.level.flags.has_swamp = TRUE;
        break;
    }
}
int main(int argc,char**argv){assert(argc==8);int op=atoi(argv[1]),a=atoi(argv[2]),b=atoi(argv[3]),d=atoi(argv[4]),e=atoi(argv[5]),f=atoi(argv[6]),g=atoi(argv[7]);
if(op==0){struct mkroom*r=&svr.rooms[0];*r=(struct mkroom){.lx=10,.hx=14,.ly=6,.hy=10,.rtype=b};for(int x=10;x<=14;x++)for(int y=6;y<=10;y++){levl[x][y].typ=g?FOUNTAIN:ROOM;levl[x][y].blessedftn=e;}levl[30][5].typ=FOUNTAIN;levl[32][5].typ=SINK;count_level_features();for(int i=0;i<1000;i++)tape[i]=d;draw=f;if(a==0)mkfount(r);else if(a==1)mksink(r);else mkaltar(r);int x=10+d,y=6+d;printf("%d %d %d %d %d %d %d %d\n",levl[x][y].typ,levl[x][y].blessedftn,levl[x][y].altarmask,svl.level.flags.nfountains,svl.level.flags.nsinks,calls,draws,bound);}
else{struct mkroom*r=svr.rooms;r[0]=(struct mkroom){.lx=10,.hx=20,.ly=4,.hy=16,.rtype=a,.needfill=g?0:b};r[1]=(struct mkroom){.lx=12,.hx=14,.ly=6,.hy=9,.rtype=SHOPBASE,.needfill=g?0:1};r[2]=(struct mkroom){.lx=16,.hx=18,.ly=11,.hy=14,.rtype=TEMPLE,.needfill=g?0:2};if(d==1){r[0].nsubrooms=2;r[0].sbrooms[0]=r+1;r[0].sbrooms[1]=r+2;}if(d==2){r[1]=(struct mkroom){.lx=12,.hx=18,.ly=6,.hy=14,.rtype=OROOM,.needfill=0,.nsubrooms=1};r[2]=(struct mkroom){.lx=14,.hx=16,.ly=8,.hy=12,.rtype=SHOPBASE,.needfill=g?0:1};r[0].nsubrooms=1;r[0].sbrooms[0]=r+1;r[1].sbrooms[0]=r+2;}fill_special_room(r);printf("%d",flagmask());for(int i=0;i<nt;i++)printf(" %d",trace[i]);puts("");}return 0;}
