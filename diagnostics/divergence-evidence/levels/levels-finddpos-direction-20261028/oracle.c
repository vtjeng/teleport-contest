#include <stdio.h>
#include <assert.h>
#include <string.h>
typedef int boolean;typedef int coordxy;typedef struct{int x,y;}coord;
struct mkroom{int lx,hx,ly,hy;};
#define TRUE 1
#define FALSE 0
enum movementdirs {
    DIR_ERR = -1,
    DIR_W,
    DIR_NW,
    DIR_N,
    DIR_NE,
    DIR_E,
    DIR_SE,
    DIR_S,
    DIR_SW,
    DIR_DOWN,
    DIR_UP,

    N_DIRS_Z
};
static int messages,draws,shifts;
static void impossible(const char*s){assert(!strcmp(s,"finddpos: illegal dir"));messages++;}
static int rn1(int n,int base){assert(n>0);draws++;return base;}
static int finddpos_shift(int*x,int*y,int dir,struct mkroom*r){(void)x;(void)y;(void)r;assert(dir==DIR_N||dir==DIR_E||dir==DIR_S||dir==DIR_W);shifts++;return 1;}
static boolean
finddpos(coord *cc, int dir, struct mkroom *aroom)
{
    coordxy x, y;
    coordxy x1, y1, x2, y2;
    int tryct = 0;

    switch (dir) {
    case DIR_N:
        x1 = aroom->lx;
        x2 = aroom->hx;
        y1 = aroom->ly - 1;
        y2 = aroom->ly - 1;
        break;
    case DIR_S:
        x1 = aroom->lx;
        x2 = aroom->hx;
        y1 = aroom->hy + 1;
        y2 = aroom->hy + 1;
        break;
    case DIR_W:
        x1 = aroom->lx - 1;
        x2 = aroom->lx - 1;
        y1 = aroom->ly;
        y2 = aroom->hy;
        break;
    case DIR_E:
        x1 = aroom->hx + 1;
        x2 = aroom->hx + 1;
        y1 = aroom->ly;
        y2 = aroom->hy;
        break;
    default:
        impossible("finddpos: illegal dir");
        return FALSE;
    }

    /* try random points */
    do {
        x = (x2 - x1) ? rn1(x2 - x1 + 1, x1) : x1;
        y = (y2 - y1) ? rn1(y2 - y1 + 1, y1) : y1;
        if (finddpos_shift(&x, &y, dir, aroom))
          goto gotit;
    } while (++tryct < 20);

    /* try all the points */
    for (x = x1; x <= x2; x++)
        for (y = y1; y <= y2; y++)
            if (finddpos_shift(&x, &y, dir, aroom))
                goto gotit;

    /* cannot find something reasonable -- strange */
    cc->x = x1;
    cc->y = y1;
    return FALSE;
 gotit:
    cc->x = x;
    cc->y = y;
    return TRUE;
}
int main(int argc,char**argv){assert(argc==2);int target=!strcmp(argv[1],"target");assert(target||!strcmp(argv[1],"control"));struct mkroom room={10,14,5,8};for(int dir=-1;dir<=10;dir++){int valid=dir==DIR_N||dir==DIR_E||dir==DIR_S||dir==DIR_W;if(valid!=target)continue;messages=draws=shifts=0;coord out={-99,-99};int result=finddpos(&out,dir,&room);if(target){assert(result&&messages==0&&draws==1&&shifts==1);}else{assert(!result&&messages==1&&draws==0&&shifts==0&&out.x==-99&&out.y==-99);}printf("%d %d %d %d %d %d %d\n",dir,result,messages,draws,shifts,out.x,out.y);}return 0;}
