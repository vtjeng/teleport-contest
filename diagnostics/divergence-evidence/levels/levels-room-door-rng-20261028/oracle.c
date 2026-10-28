#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
typedef int boolean;typedef int coordxy;
#define TRUE 1
#define FALSE 0
#define HWALL 2
#define VWALL 1
#define ROOM 25
#define SDOOR 14
#define DOOR 23
#define D_NODOOR 0
#define D_BROKEN 1
#define D_ISOPEN 2
#define D_CLOSED 4
#define D_LOCKED 8
#define D_TRAPPED 16
#define D_SECRET 32
#define W_RANDOM -1
#define W_ANY 15
#define W_NORTH 1
#define W_SOUTH 2
#define W_EAST 4
#define W_WEST 8
#define IS_DOOR(t) ((t)==DOOR)
#define IS_OBSTRUCTED(t) ((t)<15)
#define ROLL_FROM(a) ((a)[rn2(sizeof(a)/sizeof((a)[0]))])
struct {int typ;unsigned flags:5;} levl[80][21];
#define doormask flags
struct mkroom {int lx,ly,hx,hy;};
typedef struct {int secret,wall,mask,pos;} room_door;
static int calls;static int rn2(int n){int bound,v;assert(scanf("%d %d",&bound,&v)==2&&bound==n&&v>=0&&v<n);calls++;return v;}
static int isok(int x,int y){return x>0&&x<80&&y>=0&&y<21;}
static int set_levltyp(int x,int y,int typ){assert((levl[x][y].typ==HWALL||levl[x][y].typ==VWALL)&&(typ==DOOR||typ==SDOOR));levl[x][y].typ=typ;return 1;}
static void impossible(const char*s){(void)s;abort();}
static boolean
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
static int
okdoor(coordxy x, coordxy y)
{
    boolean near_door = bydoor(x, y);

    return ((levl[x][y].typ == HWALL || levl[x][y].typ == VWALL)
            && ((isok(x - 1, y) && !IS_OBSTRUCTED(levl[x - 1][y].typ))
                || (isok(x + 1, y) && !IS_OBSTRUCTED(levl[x + 1][y].typ))
                || (isok(x, y - 1) && !IS_OBSTRUCTED(levl[x][y - 1].typ))
                || (isok(x, y + 1) && !IS_OBSTRUCTED(levl[x][y + 1].typ)))
            && !near_door);
}
static int
rnddoor(void)
{
    static int state[] = { D_NODOOR, D_BROKEN, D_ISOPEN, D_CLOSED, D_LOCKED };

    return ROLL_FROM(state);
}
static void
create_door(room_door *dd, struct mkroom *broom)
{
    int x = 0, y = 0;
    int trycnt;

    if (dd->secret == -1)
        dd->secret = rn2(2);

    if (dd->wall == W_RANDOM)
        dd->wall = W_ANY; /* speeds things up in the below loop */

    if (dd->mask == -1) {
        /* is it a locked door, closed, or a doorway? */
        if (!dd->secret) {
            if (!rn2(3)) {
                if (!rn2(5))
                    dd->mask = D_ISOPEN;
                else if (!rn2(6))
                    dd->mask = D_LOCKED;
                else
                    dd->mask = D_CLOSED;
                if (dd->mask != D_ISOPEN && !rn2(25))
                    dd->mask |= D_TRAPPED;
            } else
                dd->mask = D_NODOOR;
        } else {
            if (!rn2(5))
                dd->mask = D_LOCKED;
            else
                dd->mask = D_CLOSED;

            if (!rn2(20))
                dd->mask |= D_TRAPPED;
        }
    }

    for (trycnt = 0; trycnt < 100; ++trycnt) {
        int dwall = dd->wall, dpos = dd->pos;

        /* Convert wall and pos into an absolute coordinate! */
        switch (rn2(4)) {
        case 0:
            if (!(dwall & W_NORTH))
                continue;
            y = broom->ly - 1;
            x = broom->lx + ((dpos == -1) ? rn2(1 + broom->hx - broom->lx)
                                          : dpos);
            if (!isok(x, y - 1) || IS_OBSTRUCTED(levl[x][y - 1].typ))
                continue;
            break;
        case 1:
            if (!(dwall & W_SOUTH))
                continue;
            y = broom->hy + 1;
            x = broom->lx + ((dpos == -1) ? rn2(1 + broom->hx - broom->lx)
                                          : dpos);
            if (!isok(x, y + 1) || IS_OBSTRUCTED(levl[x][y + 1].typ))
                continue;
            break;
        case 2:
            if (!(dwall & W_WEST))
                continue;
            x = broom->lx - 1;
            y = broom->ly + ((dpos == -1) ? rn2(1 + broom->hy - broom->ly)
                                          : dpos);
            if (!isok(x - 1, y) || IS_OBSTRUCTED(levl[x - 1][y].typ))
                continue;
            break;
        case 3:
            if (!(dwall & W_EAST))
                continue;
            x = broom->hx + 1;
            y = broom->ly + ((dpos == -1) ? rn2(1 + broom->hy - broom->ly)
                                          : dpos);
            if (!isok(x + 1, y) || IS_OBSTRUCTED(levl[x + 1][y].typ))
                continue;
            break;
        default:
            /*NOTREACHED*/
            break;
        }

        if (okdoor(x, y))
            break;
    }
    if (trycnt >= 100) {
        impossible("create_door: Can't find a proper place!");
        return;
    }
    if (!set_levltyp(x, y, (dd->secret ? SDOOR : DOOR)))
        return;
    levl[x][y].doormask = dd->mask;
}
int main(int argc,char**argv){assert(argc==4);int wall=atoi(argv[1]),pos=atoi(argv[2]),kind=atoi(argv[3]);for(int x=0;x<80;x++)for(int y=0;y<21;y++)levl[x][y].typ=ROOM;for(int x=11;x<=15;x++){levl[x][4].typ=HWALL;levl[x][10].typ=HWALL;}for(int y=5;y<=9;y++){levl[10][y].typ=VWALL;levl[16][y].typ=VWALL;}struct mkroom room={11,5,15,9};int mask=kind==0?D_CLOSED:kind==1?D_SECRET:-1;int typ=mask==-1?rnddoor():mask;room_door d={typ==D_SECRET,wall,mask,pos};create_door(&d,&room);int extra;assert(scanf("%d",&extra)==EOF);printf("%d\n",calls);int count=0;for(int x=1;x<80;x++)for(int y=0;y<21;y++)if(levl[x][y].typ==DOOR||levl[x][y].typ==SDOOR){printf("%d %d %d %d\n",x,y,levl[x][y].typ,levl[x][y].flags);count++;}assert(count==1);return 0;}
