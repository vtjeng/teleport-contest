#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <stdint.h>
typedef int boolean;typedef int16_t coordxy;typedef void* genericptr_t;
typedef struct {coordxy x,y;}coord;
#define TRUE 1
#define FALSE 0
#define DOORINC 20
#define ROOMOFFSET 3
#define IS_DOOR(t) ((t)==23)
#define SDOOR 14
struct mkroom {coordxy lx,hx,ly,hy;int irregular,fdoor;signed char nsubrooms,doorct;struct mkroom*sbrooms[1];};
static struct {struct mkroom rooms[4];}svr;
static struct {struct mkroom subrooms[1];}gs;
static struct {int nroom;}svn;
static struct {int nsubroom;}gn;
static struct {coord*doors;int doors_alloc;}svd;
static struct {int doorindex;}gd;
static struct {int typ,roomno,edge;}levl[80][21];
static int allocations;
static void*alloc(size_t n){allocations++;void*p=malloc(n);assert(p);return p;}
/* All tested rooms are regular and each candidate is inside expanded bounds. */
static int shared_with_room(int x,int y,struct mkroom*r){abort();}

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

void
alloc_doors(void)
{
    if (!svd.doors || gd.doorindex >= svd.doors_alloc) {
        int c = svd.doors_alloc + DOORINC;
        coord *doortmp = (coord *) alloc(c * sizeof (coord));

        (void) memset((genericptr_t) doortmp, 0, c * sizeof (coord));
        if (svd.doors) {
            (void) memcpy(doortmp, svd.doors,
                          svd.doors_alloc * sizeof (coord));
            free(svd.doors);
        }
        svd.doors = doortmp;
        svd.doors_alloc = c;
    }
}

void
add_door(coordxy x, coordxy y, struct mkroom *aroom)
{
    struct mkroom *broom;
    int tmp;
    int i;

    alloc_doors();

    if (aroom->doorct) {
        for (i = 0; i < aroom->doorct; i++) {
            tmp = aroom->fdoor + i;
            if (svd.doors[tmp].x == x && svd.doors[tmp].y == y)
                return;
        }
    }

    if (aroom->doorct == 0)
        aroom->fdoor = gd.doorindex;

    aroom->doorct++;

    for (tmp = gd.doorindex; tmp > aroom->fdoor; tmp--)
        svd.doors[tmp] = svd.doors[tmp - 1];

    for (i = 0; i < svn.nroom; i++) {
        broom = &svr.rooms[i];
        if (broom != aroom && broom->doorct && broom->fdoor >= aroom->fdoor)
            broom->fdoor++;
    }
    for (i = 0; i < gn.nsubroom; i++) {
        broom = &gs.subrooms[i];
        if (broom != aroom && broom->doorct && broom->fdoor >= aroom->fdoor)
            broom->fdoor++;
    }

    gd.doorindex++;
    svd.doors[aroom->fdoor].x = x;
    svd.doors[aroom->fdoor].y = y;
}

void
maybe_add_door(int x, int y, struct mkroom *droom)
{
    if (droom->hx >= 0
        && ((!droom->irregular && inside_room(droom, x, y))
            || (int) levl[x][y].roomno == (droom - svr.rooms) + ROOMOFFSET
            || shared_with_room(x, y, droom))) {
        add_door(x, y, droom);
    }
}

void
add_doors_to_room(struct mkroom *croom)
{
    coordxy x, y;
    int i;

    for (x = croom->lx - 1; x <= croom->hx + 1; x++)
        for (y = croom->ly - 1; y <= croom->hy + 1; y++)
            if (IS_DOOR(levl[x][y].typ) || levl[x][y].typ == SDOOR)
                maybe_add_door(x, y, croom);
    for (i = 0; i < croom->nsubrooms; i++)
        add_doors_to_room(croom->sbrooms[i]);
}
int main(void){int count;assert(scanf("%d",&count)==1);svn.nroom=3;gn.nsubroom=1;
int bounds[4][4]={{2,28,3,17},{34,46,3,15},{52,68,4,16},{8,14,7,11}};
struct mkroom*rr[4]={&svr.rooms[0],&svr.rooms[1],&svr.rooms[2],&gs.subrooms[0]};
for(int i=0;i<4;i++){rr[i]->lx=bounds[i][0];rr[i]->hx=bounds[i][1];rr[i]->ly=bounds[i][2];rr[i]->hy=bounds[i][3];}rr[0]->nsubrooms=1;rr[0]->sbrooms[0]=rr[3];
for(int i=0;i<count;i++){int x,y,t;assert(scanf("%d %d %d",&x,&y,&t)==3);assert(x>0&&x<80&&y>=0&&y<21);levl[x][y].typ=t;}
int steps;assert(scanf("%d",&steps)==1);for(int s=0;s<steps;s++){int idx;assert(scanf("%d",&idx)==1&&idx>=0&&idx<4);add_doors_to_room(rr[idx]);printf("{\"index\":%d,\"rooms\":[",gd.doorindex);for(int i=0;i<4;i++)printf("%s[%d,%d]",i?",":"",rr[i]->fdoor,rr[i]->doorct);printf("],\"doors\":[");for(int i=0;i<gd.doorindex;i++)printf("%s[%d,%d]",i?",":"",svd.doors[i].x,svd.doors[i].y);printf("],\"allocations\":%d,\"capacity\":%d}\n",allocations,svd.doors_alloc);}free(svd.doors);return 0;}
