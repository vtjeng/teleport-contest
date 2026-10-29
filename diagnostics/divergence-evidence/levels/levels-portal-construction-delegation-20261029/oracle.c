#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
typedef int16_t coordxy;typedef int16_t xint16;
#define MAGIC_PORTAL 17
#define debugpline4(...) ((void)0)
struct trap {int tx,ty,ttyp;struct{int dnum,dlevel;}dst;};
static struct trap portal;static int calls,diagnostics,blocked;
/* Successful/null factory interface adapter, not a C trap.c reimplementation. */
static struct trap*maketrap(coordxy x,coordxy y,int type){calls++;assert(type==MAGIC_PORTAL);if(blocked)return NULL;portal=(struct trap){.tx=x,.ty=y,.ttyp=type,.dst={-1,-1}};return &portal;}
static void impossible(const char*s){assert(s);diagnostics++;}
void
mkportal(coordxy x, coordxy y, xint16 todnum, xint16 todlevel)
{
    /* a portal "trap" must be matched by a
       portal in the destination dungeon/dlevel */
    struct trap *ttmp = maketrap(x, y, MAGIC_PORTAL);

    if (!ttmp) {
        impossible("portal on top of portal?");
        return;
    }
    debugpline4("mkportal: at <%d,%d>, to %s, level %d", x, y,
                svd.dungeons[todnum].dname, todlevel);
    ttmp->dst.dnum = todnum;
    ttmp->dst.dlevel = todlevel;
    return;
}
int main(int argc,char**argv){assert(argc==6);int x=atoi(argv[1]),y=atoi(argv[2]),dest=atoi(argv[3]),old=atoi(argv[4]);blocked=atoi(argv[5]);assert(x>0&&x<80&&y>=0&&y<21&&dest>=1&&dest<=3&&old>=1&&old<=3);portal=(struct trap){.tx=x,.ty=y,.ttyp=MAGIC_PORTAL,.dst={0,old}};mkportal(x,y,0,dest);assert(calls==1&&diagnostics==blocked);printf("%d %d %d %d %d %d\n",portal.tx,portal.ty,portal.ttyp,portal.dst.dnum,portal.dst.dlevel,blocked);return 0;}
