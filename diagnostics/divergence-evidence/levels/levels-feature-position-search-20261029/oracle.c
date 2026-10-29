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
struct mkroom {coordxy lx,hx,ly,hy;int irregular,nsubrooms;struct mkroom *sbrooms[1];};
static struct {struct mkroom rooms[2];}svr;
static struct {int typ,edge,roomno;}levl[80][21];
static int isok(int x,int y){return x>0&&x<80&&y>=0&&y<21;}
/* Fixture has no traps, fluids or invocation square; not their implementations. */
static void*t_at(int x,int y){assert(isok(x,y));return NULL;}
static int is_lava(int x,int y){assert(levl[x][y].typ==ROOM||levl[x][y].typ==FOUNTAIN);return 0;}
static int is_pool(int x,int y){return is_lava(x,y);}
static int invocation_pos(int x,int y){return is_lava(x,y);}
boolean occupied(coordxy,coordxy); boolean bydoor(coordxy,coordxy);
static int calls,tape[1000];
static int rn1(int n,int b){assert(calls<1000);int v=tape[calls++];assert(v>=0&&v<n);return b+v;}

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
int main(int argc,char**argv){assert(argc==5);int side=atoi(argv[1]),secret=atoi(argv[2]),success=atoi(argv[3]),mode=atoi(argv[4]);assert(side>=0&&side<4&&success>0&&success<=201&&mode>=0&&mode<=2);int xy[4][4]={{10,6,9,6},{14,10,15,10},{10,6,10,5},{14,10,14,11}};
struct mkroom*r=&svr.rooms[0];*r=(struct mkroom){.lx=10,.hx=14,.ly=6,.hy=10};for(int x=10;x<=14;x++)for(int y=6;y<=10;y++)levl[x][y].typ=mode==2?FOUNTAIN:ROOM;if(mode==0)levl[xy[side][2]][xy[side][3]].typ=secret?SDOOR:DOOR;
for(int i=0;i<500;i++){tape[2*i]=xy[side][0]-10;tape[2*i+1]=xy[side][1]-6;}tape[2*(success-1)]=2;tape[2*(success-1)+1]=2;
coord crd={-1,-1};int result=find_okay_roompos(r,&crd);printf("%d %d %d %d\n",result,crd.x,crd.y,calls);return 0;}
