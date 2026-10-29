#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
typedef int coordxy;typedef int boolean;typedef signed char schar;typedef short xint16;
typedef struct {coordxy x,y;} coord;
#define COLNO 80
#define ROWNO 21
#define TRUE 1
#define FALSE 0
#define STONE 0
#define SDOOR 14
#define SCORR 15
#define CORR 24
#define BOULDER 0
#define W_NORTH 1
#define W_SOUTH 2
#define W_EAST 4
#define W_WEST 8
#define W_ANY 15
#define W_RANDOM -1
#define IS_DOOR(t) ((t)==23)
#define max(a,b) ((a)>(b)?(a):(b))
#define debugpline4(...) ((void)0)
struct rm{int typ;};static struct rm levl[80][21];
struct mkroom{int lx,hx,ly,hy;};static struct {struct mkroom rooms[2];} svr;
typedef struct {struct {int room,door,wall;}src,dest;} corridor;
static struct {int uz;} u;
static int depth(int*p){assert(p==&u.uz);return 1;}
static int draws;
static int rn2(int n){int bound,value;assert(scanf("%d %d",&bound,&value)==2&&bound==n&&value>=0&&value<n);draws++;return value;}
static void mksobj_at(int a,int b,int c,int d,int e){(void)a;(void)b;(void)c;(void)d;(void)e;assert(!"object branch outside explicit corridor domain");}
static void makecorridors(void){assert(!"random corridors outside scope");}
static void panic(const char*s){(void)s;assert(!"invalid wall outside scope");}
static void impossible(const char*s){(void)s;assert(!"random wall outside scope");}
static boolean
maybe_sdoor(int chance)
{
    return (depth(&u.uz) > 2) && !rn2(max(2, chance));
}
static boolean
search_door(
    struct mkroom *croom,
    coordxy *x, coordxy *y,
    xint16 wall, int cnt)
{
    int dx, dy;
    int xx, yy;

    switch (wall) {
    case W_SOUTH:
        dy = 0;
        dx = 1;
        xx = croom->lx;
        yy = croom->hy + 1;
        break;
    case W_NORTH:
        dy = 0;
        dx = 1;
        xx = croom->lx;
        yy = croom->ly - 1;
        break;
    case W_EAST:
        dy = 1;
        dx = 0;
        xx = croom->hx + 1;
        yy = croom->ly;
        break;
    case W_WEST:
        dy = 1;
        dx = 0;
        xx = croom->lx - 1;
        yy = croom->ly;
        break;
    default:
        panic("search_door: Bad wall!");
        /*NOTREACHED*/
    }
    while (xx <= croom->hx + 1 && yy <= croom->hy + 1) {
        if (IS_DOOR(levl[xx][yy].typ) || levl[xx][yy].typ == SDOOR) {
            *x = xx;
            *y = yy;
            if (cnt-- <= 0)
                return TRUE;
        }
        xx += dx;
        yy += dy;
    }
    return FALSE;
}
boolean
dig_corridor(
    coord *org, coord *dest,
    int *npoints,
    boolean nxcor,
    schar ftyp, schar btyp)
{
    int dx = 0, dy = 0, dix, diy, cct;
    struct rm *crm;
    int tx, ty, xx, yy;

    if (npoints)
        *npoints = 0;
    xx = org->x;
    yy = org->y;
    tx = dest->x;
    ty = dest->y;
    if (xx <= 0 || yy <= 0 || tx <= 0 || ty <= 0 || xx > COLNO - 1
        || tx > COLNO - 1 || yy > ROWNO - 1 || ty > ROWNO - 1) {
        debugpline4("dig_corridor: bad coords <%d,%d> <%d,%d>.",
                    xx, yy, tx, ty);
        return FALSE;
    }
    if (tx > xx)
        dx = 1;
    else if (ty > yy)
        dy = 1;
    else if (tx < xx)
        dx = -1;
    else
        dy = -1;

    xx -= dx;
    yy -= dy;
    cct = 0;
    while (xx != tx || yy != ty) {
        /* loop: dig corridor at [xx,yy] and find new [xx,yy] */
        if (cct++ > 500 || (nxcor && !rn2(35)))
            return FALSE;

        xx += dx;
        yy += dy;

        if (xx >= COLNO - 1 || xx <= 0 || yy <= 0 || yy >= ROWNO - 1)
            return FALSE; /* impossible */

        crm = &levl[xx][yy];
        if (crm->typ == btyp) {
            if (ftyp == CORR && maybe_sdoor(100)) {
                if (npoints)
                    (*npoints)++;
                crm->typ = SCORR;
            } else {
                if (npoints)
                    (*npoints)++;
                crm->typ = ftyp;
                if (nxcor && !rn2(50))
                    (void) mksobj_at(BOULDER, xx, yy, TRUE, FALSE);
            }
        } else if (crm->typ != ftyp && crm->typ != SCORR) {
            /* strange ... */
            return FALSE;
        }

        /* find next corridor position */
        dix = abs(xx - tx);
        diy = abs(yy - ty);

        if ((dix > diy) && diy && !rn2(dix - diy + 1)) {
            dix = 0;
        } else if ((diy > dix) && dix && !rn2(diy - dix + 1)) {
            diy = 0;
        }

        /* do we have to change direction ? */
        if (dy && dix > diy) {
            int ddx = (xx > tx) ? -1 : 1;

            crm = &levl[xx + ddx][yy];
            if (crm->typ == btyp || crm->typ == ftyp || crm->typ == SCORR) {
                dx = ddx;
                dy = 0;
                continue;
            }
        } else if (dx && diy > dix) {
            int ddy = (yy > ty) ? -1 : 1;

            crm = &levl[xx][yy + ddy];
            if (crm->typ == btyp || crm->typ == ftyp || crm->typ == SCORR) {
                dy = ddy;
                dx = 0;
                continue;
            }
        }

        /* continue straight on? */
        crm = &levl[xx + dx][yy + dy];
        if (crm->typ == btyp || crm->typ == ftyp || crm->typ == SCORR)
            continue;

        /* no, what must we do now?? */
        if (dx) {
            dx = 0;
            dy = (ty < yy) ? -1 : 1;
        } else {
            dy = 0;
            dx = (tx < xx) ? -1 : 1;
        }
        crm = &levl[xx + dx][yy + dy];
        if (crm->typ == btyp || crm->typ == ftyp || crm->typ == SCORR)
            continue;
        dy = -dy;
        dx = -dx;
    }
    return TRUE;
}
static void
create_corridor(corridor *c)
{
    coord org, dest;

    if (c->src.room == -1) {
        makecorridors(); /*makecorridors(c->src.door);*/
        return;
    }

    /* Safety railings - if there's ever a case where des.corridor() needs
     * to be called with src/destwall="random", that logic first needs to be
     * implemented in search_door. */
    if (c->src.wall == W_ANY || c->src.wall == W_RANDOM
        || c->dest.wall == W_ANY || c->dest.wall == W_RANDOM) {
        impossible("create_corridor to/from a random wall");
        return;
    }
    if (!search_door(&svr.rooms[c->src.room], &org.x, &org.y, c->src.wall,
                     c->src.door))
        return;
    if (c->dest.room != -1) {
        if (!search_door(&svr.rooms[c->dest.room],
                         &dest.x, &dest.y, c->dest.wall, c->dest.door))
            return;
        switch (c->src.wall) {
        case W_NORTH:
            org.y--;
            break;
        case W_SOUTH:
            org.y++;
            break;
        case W_WEST:
            org.x--;
            break;
        case W_EAST:
            org.x++;
            break;
        }
        switch (c->dest.wall) {
        case W_NORTH:
            dest.y--;
            break;
        case W_SOUTH:
            dest.y++;
            break;
        case W_WEST:
            dest.x--;
            break;
        case W_EAST:
            dest.x++;
            break;
        }
        (void) dig_corridor(&org, &dest, NULL, FALSE, CORR, STONE);
    }
}
int main(int argc,char**argv){assert(argc==3);int source=atoi(argv[1]),wall=atoi(argv[2]);assert(source==0||source==1);assert(wall==1||wall==2||wall==4||wall==8);for(int i=0;i<2;i++)assert(scanf("%d %d %d %d",&svr.rooms[i].lx,&svr.rooms[i].hx,&svr.rooms[i].ly,&svr.rooms[i].hy)==4);for(int x=0;x<80;x++)for(int y=0;y<21;y++)assert(scanf("%d",&levl[x][y].typ)==1);
corridor c={.src={source,0,wall},.dest={1-source,0,wall==1?2:wall==2?1:wall==4?8:4}};create_corridor(&c);int unexpected;assert(scanf("%d",&unexpected)==EOF);printf("%d\n",draws);for(int x=0;x<80;x++)for(int y=0;y<21;y++)printf("%02x",levl[x][y].typ);puts("");return 0;}
