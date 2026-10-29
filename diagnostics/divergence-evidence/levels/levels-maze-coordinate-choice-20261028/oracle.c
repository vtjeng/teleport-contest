#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
typedef int coordxy;typedef struct {int x,y;} coord;
#define CORR 24
#define ROOM 25
static struct {struct {struct {int corrmaze;} flags;} level;} svl;
static struct {int x_maze_max;} gx={78};static struct {int y_maze_max;} gy={20};
static struct {int typ;} levl[80][21];static int calls;
static int rnd(int n){int bound,value;assert(scanf("%d %d",&bound,&value)==2);assert(bound==n&&value>=1&&value<=n);calls++;return value;}
static void panic(const char*s){fprintf(stderr,"%s",s);exit(2);}
void
mazexy(coord *cc)
{
    coordxy x, y;
    int allowedtyp = (svl.level.flags.corrmaze ? CORR : ROOM);
    int cpt = 0;

    do {
        /* once upon a time this only considered odd values greater than 2
           and less than N (for N=={x,y}_maze_max) because even values were
           where maze walls always got placed; when wider maze corridors
           were introduced it was changed to 1+rn2(N) which is just an
           obscure way to get rnd(N); probably ought to be using 2+rn2(N-1)
           to exclude the maze's outer boundary walls; trying and rejecting
           those walls will waste some of the 100 random attempts... */
        x = rnd(gx.x_maze_max);
        y = rnd(gy.y_maze_max);
        if (levl[x][y].typ == allowedtyp) {
            cc->x = x;
            cc->y = y;
            return;
        }
    } while (++cpt < 100);
    /* 100 random attempts failed; systematically try every possibility */
    for (x = 1; x <= gx.x_maze_max; x++)
        for (y = 1; y <= gy.y_maze_max; y++)
            if (levl[x][y].typ == allowedtyp) {
                cc->x = x;
                cc->y = y;
                return;
            }
    /* every spot on the area of map allowed for mazes has been rejected */
    panic("mazexy: can't find a place!");
    /*NOTREACHED*/
    return;
}
int main(int argc,char**argv){assert(argc==3);int mode=atoi(argv[1]);svl.level.flags.corrmaze=atoi(argv[2]);int typ=svl.level.flags.corrmaze?CORR:ROOM;if(mode==3){for(int x=1;x<=78;x++)for(int y=1;y<=20;y++)levl[x][y].typ=typ;}else {levl[2][7].typ=typ;levl[7][2].typ=typ;}coord c={-9,-9};mazexy(&c);int extra;assert(scanf("%d",&extra)==EOF);printf("%d %d %d\n",c.x,c.y,calls);return 0;}
