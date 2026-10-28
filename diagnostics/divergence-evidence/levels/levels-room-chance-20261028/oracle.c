#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
typedef int boolean;typedef short xint16;
#define staticfn static
#define OROOM 0
struct mkroom {int rtype,needfill,needjoining;};
typedef struct {int chance,rtype,x,y,w,h,xalign,yalign,rlit,needfill,joined;} room;
static struct {struct mkroom rooms[82];} svr;
static struct {int nroom;} svn;
static struct {int nsubroom;} gn;
static struct {struct mkroom *subrooms;} gs={&svr.rooms[41]};
static int draw,calls;
static int rn2(int n){assert(n==100);calls++;return draw;}
/* Outcome-capture stubs: downstream geometry is not under comparison. */
static int create_subroom(struct mkroom *p,int x,int y,int w,int h,int typ,int lit){
 assert(x==3&&y==3&&w==3&&h==3&&lit==1);gs.subrooms[gn.nsubroom++].rtype=typ;return 1;
}
static int create_room(int x,int y,int w,int h,int xa,int ya,int typ,int lit){abort();}
static void topologize(struct mkroom *r){(void)r;}
staticfn struct mkroom *
build_room(room *r, struct mkroom *mkr)
{
    boolean okroom;
    struct mkroom *aroom;
    xint16 rtype = (!r->chance || rn2(100) < r->chance) ? r->rtype : OROOM;

    if (mkr) {
        aroom = &gs.subrooms[gn.nsubroom];
        okroom = create_subroom(mkr, r->x, r->y, r->w, r->h, rtype, r->rlit);
    } else {
        aroom = &svr.rooms[svn.nroom];
        okroom = create_room(r->x, r->y, r->w, r->h, r->xalign, r->yalign,
                             rtype, r->rlit);
    }

    if (okroom) {
#ifdef SPECIALIZATION
        topologize(aroom, FALSE); /* set roomno */
#else
        topologize(aroom); /* set roomno */
#endif
        aroom->needfill = r->needfill;
        aroom->needjoining = r->joined;
        return aroom;
    }
    return (struct mkroom *) 0;
}
int main(int argc,char **argv){
 if(argc!=3)return 2;draw=atoi(argv[2]);
 room r={.chance=atoi(argv[1]),.rtype=4,.x=3,.y=3,.w=3,.h=3,.rlit=1};
 struct mkroom parent={0},*child=build_room(&r,&parent);assert(child);
 printf("%d %d",child->rtype,calls);for(int i=0;i<calls;i++)printf(" 100");puts("");
}
