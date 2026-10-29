#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <stdint.h>
typedef int boolean;typedef int16_t coordxy;
#define TRUE 1
#define FALSE 0
#define ROOMOFFSET 3
#define OROOM 0
#define THEMEROOM 1
struct mkroom {coordxy lx,hx,ly,hy;int irregular,needjoining; signed char rtype;};
typedef struct stairway {coordxy sx,sy;int up;struct stairway*next;}stairway;
static struct {struct mkroom rooms[3];}svr;
static struct {int nroom;}svn;
static struct {stairway*stairs;}gs;
static struct {int roomno,edge;}levl[80][21];
static int choice,calls,bound,allocations;static void*alloc(size_t n){allocations++;void*p=malloc(n);assert(p);return p;}
static int rn2(int n){calls++;bound=n;assert(choice>=0&&choice<n);return choice;}

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
has_dnstairs(struct mkroom *sroom)
{
    stairway *stway = gs.stairs;

    while (stway) {
        if (!stway->up && inside_room(sroom, stway->sx, stway->sy))
            return TRUE;
        stway = stway->next;
    }
    return FALSE;
}

boolean
has_upstairs(struct mkroom *sroom)
{
    stairway *stway = gs.stairs;

    while (stway) {
        if (stway->up && inside_room(sroom, stway->sx, stway->sy))
            return TRUE;
        stway = stway->next;
    }
    return FALSE;
}

boolean
generate_stairs_room_good(struct mkroom *croom, int phase)
{
    /*
     * phase values, smaller allows for more relaxed criteria:
     *  2 == no relaxed criteria;
     *  1 == allow a themed room;
     *  0 == allow same room as existing up/downstairs;
     * -1 == allow an unjoined room.
     */
    return (croom && (croom->needjoining || (phase < 0))
            && ((!has_dnstairs(croom) && !has_upstairs(croom))
                || phase < 1)
            && (croom->rtype == OROOM
                || ((phase < 2) && croom->rtype == THEMEROOM)));
}

struct mkroom *
generate_stairs_find_room(void)
{
    struct mkroom *croom;
    int i, phase, ai;
    int *rmarr;

    if (!svn.nroom)
        return (struct mkroom *) 0;

    rmarr = (int *) alloc(sizeof(int) * svn.nroom);

    for (phase = 2; phase > -1; phase--) {
        ai = 0;
        for (i = 0; i < svn.nroom; i++)
            if (generate_stairs_room_good(&svr.rooms[i], phase))
                rmarr[ai++] = i;
        if (ai > 0) {
            i = rmarr[rn2(ai)];
            free(rmarr);
            return &svr.rooms[i];
        }
    }

    free(rmarr);
    croom = &svr.rooms[rn2(svn.nroom)];
    return croom;
}
int main(void){assert(scanf("%d %d",&svn.nroom,&choice)==2&&svn.nroom>=0&&svn.nroom<=3);stairway stairs[3];for(int i=0;i<svn.nroom;i++){int join,type,st;assert(scanf("%d %d %d",&join,&type,&st)==3);struct mkroom*r=&svr.rooms[i];r->lx=10+i*15;r->hx=r->lx+6;r->ly=5;r->hy=11;r->needjoining=join;r->rtype=type;if(st){stairs[i]=(stairway){.sx=r->lx+3,.sy=8,.up=(st==2),.next=gs.stairs};gs.stairs=&stairs[i];}}
struct mkroom*r=generate_stairs_find_room();printf("%d %d %d %d\n",r?(int)(r-svr.rooms):-1,calls,bound,allocations);return 0;}
