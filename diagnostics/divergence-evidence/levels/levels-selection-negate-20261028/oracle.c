#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>
typedef struct {int lx,ly,hx,hy;} NhRect;
struct {NhRect zeroNhRect;} cg;
struct selectionvar {int wid,hei;int points[80][21];};
static int selection_getpoint(int x,int y,struct selectionvar *s){return s->points[x][y];}
static void selection_setpoint(int x,int y,struct selectionvar *s,int v){s->points[x][y]=v;}
static void selection_getbounds(struct selectionvar *s,NhRect *r){
 *r=(NhRect){80,21,0,0};for(int x=0;x<80;x++)for(int y=0;y<21;y++)if(s->points[x][y]){if(x<r->lx)r->lx=x;if(x>r->hx)r->hx=x;if(y<r->ly)r->ly=y;if(y>r->hy)r->hy=y;}
}
struct selectionvar *
selection_not(struct selectionvar *s)
{
    int x, y;
    NhRect tmprect = cg.zeroNhRect;

    for (x = 0; x < s->wid; x++)
        for (y = 0; y < s->hei; y++)
            selection_setpoint(x, y, s, selection_getpoint(x, y, s) ? 0 : 1);
    selection_getbounds(s, &tmprect);
    return s;
}
typedef int coordxy;typedef void *genericptr_t;
typedef void (*select_iter_func)(coordxy,coordxy,genericptr_t);
static int isok(int x,int y){return x>=1&&x<80&&y>=0&&y<21;}
static int painted[80][21];
static void paint(coordxy x,coordxy y,genericptr_t arg){painted[x][y]=1;}
void
selection_iterate(
    struct selectionvar *ov,
    select_iter_func func,
    genericptr_t arg)
{
    coordxy x, y;
    NhRect rect = cg.zeroNhRect;

    if (!ov)
        return;

    selection_getbounds(ov, &rect);

    for (x = rect.lx; x <= rect.hx; x++)
        for (y = rect.ly; y <= rect.hy; y++)
            if (isok(x,y) && selection_getpoint(x, y, ov))
                (*func)(x, y, arg);
}
int main(int argc,char **argv){
 if(argc!=4)return 2;int x=atoi(argv[1]),y=atoi(argv[2]);assert(x>=1&&x<80&&y>=0&&y<21);
 struct selectionvar s={.wid=80,.hei=21};
 /* C constructors store absolute coordinates; verified independently by
  * JS operand consumption. Empty/no-argument negate has no seed point. */
 if(strcmp(argv[3],"empty"))selection_setpoint(x,y,&s,1);
 if(strcmp(argv[3],"single"))selection_not(&s);
 selection_iterate(&s,paint,NULL);
 /* Emit the exact iterator callback footprint. */
 for(int yy=0;yy<21;yy++){for(int xx=1;xx<80;xx++)putchar(painted[xx][yy]?'#':'.');putchar('\n');}
}
