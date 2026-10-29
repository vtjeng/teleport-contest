/* Exact upstream bodies with fixed terrain storage and checked RNG replay. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef int coordxy;typedef int xint16;typedef int boolean;typedef signed char schar;
typedef struct {int x,y;} coord;
#define COLNO 80
#define ROWNO 21
#define STONE 0
#define HWALL 2
#define DOOR 23
#define CORR 24
#define ROOM 25
#define TRUE 1
#define FALSE 0
#define ACCESSIBLE(t) ((t)>=DOOR)
#define IS_DOOR(t) ((t)==DOOR)
struct {int typ,flags;} levl[COLNO][ROWNO];
struct {int x_maze_max;} gx={78};struct {int y_maze_max;} gy={20};
struct {struct {struct {int corrmaze;} flags;} level;} svl;
static int calls;
static int rn2(int n){int bound,value;assert(scanf("%d %d",&bound,&value)==2);assert(bound==n&&value>=0&&value<n);calls++;return value;}
static int rnd(int n){return rn2(n)+1;}
static int isok(int x,int y){return x>0&&x<COLNO&&y>=0&&y<ROWNO;}
#define panic(...) abort()
#define mz_move(X, Y, dir) \
    do {                                                         \
        switch (dir) {                                           \
        case 0:  --(Y);  break;                                  \
        case 1:  (X)++;  break;                                  \
        case 2:  (Y)++;  break;                                  \
        case 3:  --(X);  break;                                  \
        default: panic("mz_move: bad direction %d", dir);        \
        }                                                        \
    } while (0)
static int
okay(coordxy x, coordxy y, coordxy dir)
{
    mz_move(x, y, dir);
    mz_move(x, y, dir);
    if (x < 3 || y < 3 || x > gx.x_maze_max || y > gy.y_maze_max
        || levl[x][y].typ != STONE)
        return FALSE;
    return TRUE;
}
static void
maze0xy(coord *cc)
{
    cc->x = 3 + 2 * rn2((gx.x_maze_max >> 1) - 1);
    cc->y = 3 + 2 * rn2((gy.y_maze_max >> 1) - 1);
    return;
}
static int
maze_inbounds(coordxy x, coordxy y)
{
    return (x >= 2 && y >= 2
            && x < gx.x_maze_max && y < gy.y_maze_max
            /* isok() test is superfluous here (unless something has
               clobbered the static *_maze_max variables) */
            && isok(x, y));
}
static void
maze_remove_deadends(xint16 typ)
{
    char dirok[4];
    coordxy x, y, dir, idx, idx2, dx, dy, dx2, dy2;

    dirok[0] = 0; /* lint suppression */
    for (x = 2; x < gx.x_maze_max; x++)
        for (y = 2; y < gy.y_maze_max; y++)
            if (ACCESSIBLE(levl[x][y].typ) && (x % 2) && (y % 2)) {
                idx = idx2 = 0;
                for (dir = 0; dir < 4; dir++) {
                    /* note: mz_move() is a macro which modifies
                       one of its first two parameters */
                    dx = dx2 = x;
                    dy = dy2 = y;
                    mz_move(dx, dy, dir);
                    if (!maze_inbounds(dx, dy)) {
                        idx2++;
                        continue;
                    }
                    mz_move(dx2, dy2, dir);
                    mz_move(dx2, dy2, dir);
                    if (!maze_inbounds(dx2, dy2)) {
                        idx2++;
                        continue;
                    }
                    if (!ACCESSIBLE(levl[dx][dy].typ)
                        && ACCESSIBLE(levl[dx2][dy2].typ)) {
                        dirok[idx++] = dir;
                        idx2++;
                    }
                }
                if (idx2 >= 3 && idx > 0) {
                    dx = x;
                    dy = y;
                    dir = dirok[rn2(idx)];
                    mz_move(dx, dy, dir);
                    levl[dx][dy].typ = typ;
                }
            }
}
void
walkfrom(coordxy x, coordxy y, schar typ)
{
    int q, a, dir;
    int dirs[4];

    if (!typ) {
        if (svl.level.flags.corrmaze)
            typ = CORR;
        else
            typ = ROOM;
    }

    if (!IS_DOOR(levl[x][y].typ)) {
        /* might still be on edge of MAP, so don't overwrite */
        levl[x][y].typ = typ;
        levl[x][y].flags = 0;
    }

    while (1) {
        q = 0;
        for (a = 0; a < 4; a++)
            if (okay(x, y, a))
                dirs[q++] = a;
        if (!q)
            return;
        dir = dirs[rn2(q)];
        mz_move(x, y, dir);
        levl[x][y].typ = typ;
        mz_move(x, y, dir);
        walkfrom(x, y, typ);
    }
}
void
create_maze(int corrwid, int wallthick, boolean rmdeadends)
{
    coordxy x,y;
    coord mm;
    int tmp_xmax = gx.x_maze_max;
    int tmp_ymax = gy.y_maze_max;
    int rdx = 0;
    int rdy = 0;
    int scale;

    if (corrwid == -1)
        corrwid = rnd(4);

    if (wallthick == -1)
        wallthick = rnd(4) - corrwid;

    if (wallthick < 1)
        wallthick = 1;
    else if (wallthick > 5)
        wallthick = 5;

    if (corrwid < 1)
        corrwid = 1;
    else if (corrwid > 5)
        corrwid = 5;

    scale = corrwid + wallthick;
    rdx = (gx.x_maze_max / scale);
    rdy = (gy.y_maze_max / scale);

    if (svl.level.flags.corrmaze)
        for (x = 2; x < (rdx * 2); x++)
            for (y = 2; y < (rdy * 2); y++)
                levl[x][y].typ = STONE;
    else
        for (x = 2; x <= (rdx * 2); x++)
            for (y = 2; y <= (rdy * 2); y++)
                levl[x][y].typ = ((x % 2) && (y % 2)) ? STONE : HWALL;

    /* set upper bounds for maze0xy and walkfrom */
    gx.x_maze_max = (rdx * 2);
    gy.y_maze_max = (rdy * 2);

    /* create maze */
    maze0xy(&mm);
    walkfrom((int) mm.x, (int) mm.y, 0);

    if (rmdeadends)
        maze_remove_deadends((svl.level.flags.corrmaze) ? CORR : ROOM);

    /* restore bounds */
    gx.x_maze_max = tmp_xmax;
    gy.y_maze_max = tmp_ymax;

    /* scale maze up if needed */
    if (scale > 2) {
        char tmpmap[COLNO][ROWNO];
        int mx, my, dx, dy, rx = 1, ry = 1;

        /* back up the existing smaller maze */
        for (x = 1; x < gx.x_maze_max; x++)
            for (y = 1; y < gy.y_maze_max; y++) {
                tmpmap[x][y] = levl[x][y].typ;
            }

        /* do the scaling */
        rx = x = 2;
        while (rx < gx.x_maze_max) {
            mx = (x % 2) ? corrwid : (x == 2 || x == rdx * 2) ? 1 : wallthick;
            ry = y = 2;
            while (ry < gy.y_maze_max) {
                my = (y % 2) ? corrwid
                     : (y == 2 || y == rdy * 2) ? 1
                       : wallthick;
                for (dx = 0; dx < mx; dx++)
                    for (dy = 0; dy < my; dy++) {
                        if (rx + dx >= gx.x_maze_max
                            || ry + dy >= gy.y_maze_max)
                            break;
                        levl[rx + dx][ry + dy].typ = tmpmap[x][y];
                    }
                ry += my;
                y++;
            }
            rx += mx;
            x++;
        }

    }
}
int main(int argc,char **argv){assert(argc==5);svl.level.flags.corrmaze=atoi(argv[1]);create_maze(atoi(argv[2]),atoi(argv[3]),atoi(argv[4]));int extra;assert(scanf("%d",&extra)==EOF);assert(gx.x_maze_max==78&&gy.y_maze_max==20);printf("%d\n",calls);for(int y=0;y<ROWNO;y++)for(int x=0;x<COLNO;x++)printf("%d%c",levl[x][y].typ,x==COLNO-1?'\n':' ');}
