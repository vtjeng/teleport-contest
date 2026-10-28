/* Fixed create_subroom boundary oracle; no save-state or finalization. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
typedef int coordxy;typedef int xint16;
#define FALSE 0
#define TRUE 1
#define OROOM 0
struct mkroom {int lx,hx,ly,hy;};
static int calls,added,bounds[4];
static int rnd(int n){int bound,value;assert(scanf("%d %d",&bound,&value)==2);assert(bound==n&&value>=1&&value<=n);calls++;return value;}
static int litstate_rnd(int lit){assert(lit==0);return lit;}
static void add_subroom(struct mkroom *p,int lx,int ly,int hx,int hy,int lit,int type,int special){assert(p&&lit==0&&type==4&&!special);added++;bounds[0]=lx;bounds[1]=ly;bounds[2]=hx;bounds[3]=hy;}
static int
create_subroom(
    struct mkroom *proom,
    coordxy x, coordxy y,
    coordxy w, coordxy h,
    xint16 rtype, xint16 rlit)
{
    coordxy width, height;

    width = proom->hx - proom->lx + 1;
    height = proom->hy - proom->ly + 1;

    /* There is a minimum size for the parent room */
    if (width < 4 || height < 4)
        return FALSE;

    /* Check for random position, size, etc... */

    if (w == -1)
        w = rnd(width - 3);
    if (h == -1)
        h = rnd(height - 3);
    if (x == -1)
        x = rnd(width - w);
    if (y == -1)
        y = rnd(height - h);
    if (x == 1)
        x = 0;
    if (y == 1)
        y = 0;
    if ((x + w + 1) == width)
        x++;
    if ((y + h + 1) == height)
        y++;
    if (rtype == -1)
        rtype = OROOM;
    rlit = litstate_rnd(rlit);
    add_subroom(proom, proom->lx + x, proom->ly + y, proom->lx + x + w - 1,
                proom->ly + y + h - 1, rlit, rtype, FALSE);
    return TRUE;
}
int main(int argc,char **argv){assert(argc==7);struct mkroom p={11,11+atoi(argv[1])-1,5,5+atoi(argv[2])-1};int ok=create_subroom(&p,atoi(argv[3]),atoi(argv[4]),atoi(argv[5]),atoi(argv[6]),4,0);int extra;assert(scanf("%d",&extra)==EOF);assert(ok==added);printf("%d %d %d %d %d %d\n",ok,calls,bounds[0],bounds[1],bounds[2],bounds[3]);}
