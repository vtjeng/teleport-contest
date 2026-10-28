#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
typedef int boolean;typedef int coordxy;typedef short xint16;
#define staticfn static
#define TRUE 1
#define FALSE 0
#define DOOR 23
#define SDOOR 14
#define IS_DOOR(t) ((t)==DOOR)
#define W_NORTH 1
#define W_SOUTH 2
#define W_EAST 4
#define W_WEST 8
struct mkroom {int lx,ly,hx,hy;};
struct {int typ;} levl[80][21];
static void panic(const char *s){abort();}
staticfn boolean
search_door(
    struct mkroom *croom,
    coordxy *x, coordxy *y,
    xint16 wall, int cnt)
{
    int dx, dy;
    int xx, yy;

    switch (wall) {
    case W_SOUTH:
        dy = 0;
        dx = 1;
        xx = croom->lx;
        yy = croom->hy + 1;
        break;
    case W_NORTH:
        dy = 0;
        dx = 1;
        xx = croom->lx;
        yy = croom->ly - 1;
        break;
    case W_EAST:
        dy = 1;
        dx = 0;
        xx = croom->hx + 1;
        yy = croom->ly;
        break;
    case W_WEST:
        dy = 1;
        dx = 0;
        xx = croom->lx - 1;
        yy = croom->ly;
        break;
    default:
        panic("search_door: Bad wall!");
        /*NOTREACHED*/
    }
    while (xx <= croom->hx + 1 && yy <= croom->hy + 1) {
        if (IS_DOOR(levl[xx][yy].typ) || levl[xx][yy].typ == SDOOR) {
            *x = xx;
            *y = yy;
            if (cnt-- <= 0)
                return TRUE;
        }
        xx += dx;
        yy += dy;
    }
    return FALSE;
}
int main(int argc,char **argv){
 if(argc!=4)return 2;
 int wall=atoi(argv[1]),cnt=atoi(argv[2]),mixed=atoi(argv[3]);
 struct mkroom r={11,5,17,11};
 for(int x=10;x<=18;x++)for(int y=4;y<=12;y++)levl[x][y].typ=(y==4||y==12)?2:(x==10||x==18)?1:25;
 for(int i=0;i<3;i++){
  int typ=mixed&&i==1?SDOOR:DOOR;
  levl[11+i*3][4].typ=typ;levl[11+i*3][12].typ=typ;
  levl[10][5+i*3].typ=typ;levl[18][5+i*3].typ=typ;
 }
 int x=-1,y=-1;int found=search_door(&r,&x,&y,wall,cnt);
 if(found)printf("%d,%d\n",x,y);else puts("none");
}
