/* C sp_lev.c set_door_orientation, unmodified extraction.
 * Wrapper uses rm.h terrain constants/macros and a fixed map. */
#include <stdio.h>
#include <string.h>
#define staticfn static
typedef int boolean;
enum { STONE=0, DBWALL=12, SDOOR=14, POOL=16, IRONBARS=22, DOOR=23, ROOM=25 };
#define IS_WALL(typ) ((typ) && (typ)<=DBWALL)
#define IS_DOOR(typ) ((typ)==DOOR)
#define IS_OBSTRUCTED(typ) ((typ)<POOL)
#define IS_DOORJOIN(typ) (IS_OBSTRUCTED(typ)||(typ)==IRONBARS)
struct rm {int typ,horizontal,doormask;} levl[80][21];
static int isok(int x,int y){return x>=1&&x<80&&y>=0&&y<21;}
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

int main(void){int x,y,l,r,u,d;while(scanf("%d%d%d%d%d%d",&x,&y,&l,&r,&u,&d)==6){
 memset(levl,0,sizeof levl);levl[x-1][y].typ=l;levl[x+1][y].typ=r;levl[x][y-1].typ=u;levl[x][y+1].typ=d;
 set_door_orientation(x,y);printf("%d\n",levl[x][y].horizontal);
}return 0;}
