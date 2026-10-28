#include <stdio.h>
#include <stdlib.h>
typedef int coordxy;
struct selectionvar { int points[80][21]; };
/* Minimal point storage; tested coordinates all in range. */
void selection_setpoint(int x,int y,struct selectionvar *s,int v){if(x>=0&&x<80&&y>=0&&y<21)s->points[x][y]=v;}
void
selection_do_line(
    coordxy x1, coordxy y1,
    coordxy x2, coordxy y2,
    struct selectionvar *ov)
{
    int d0, dx, dy, ai, bi, xi, yi;

    if (x1 < x2) {
        xi = 1;
        dx = x2 - x1;
    } else {
        xi = -1;
        dx = x1 - x2;
    }
    if (y1 < y2) {
        yi = 1;
        dy = y2 - y1;
    } else {
        yi = -1;
        dy = y1 - y2;
    }

    selection_setpoint(x1, y1, ov, 1);

    if (!dx && !dy) {
        /* single point - already all done */
        ;
    } else if (dx > dy) {
        ai = (dy - dx) * 2;
        bi = dy * 2;
        d0 = bi - dx;
        do {
            if (d0 >= 0) {
                y1 += yi;
                d0 += ai;
            } else
                d0 += bi;
            x1 += xi;
            selection_setpoint(x1, y1, ov, 1);
        } while (x1 != x2);
    } else {
        ai = (dx - dy) * 2;
        bi = dx * 2;
        d0 = bi - dy;
        do {
            if (d0 >= 0) {
                x1 += xi;
                d0 += ai;
            } else
                d0 += bi;
            y1 += yi;
            selection_setpoint(x1, y1, ov, 1);
        } while (y1 != y2);
    }
}
int main(int argc,char **argv){
 struct selectionvar s={0};if(argc!=5)return 2;
 /* default C whole-level frame resolves relative x to x+1 */
 selection_do_line(atoi(argv[1])+1,atoi(argv[2]),atoi(argv[3])+1,atoi(argv[4]),&s);
 for(int x=0;x<80;x++)for(int y=0;y<21;y++)if(s.points[x][y])printf("%d,%d\n",x,y);
}
