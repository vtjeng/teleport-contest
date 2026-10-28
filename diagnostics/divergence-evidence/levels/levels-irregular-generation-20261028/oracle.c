/* Exact mkmap.c flood_fill_rm extraction; wrapper provides map/global fields. */
#include <stdio.h>
#include <string.h>
typedef int coordxy;typedef signed char schar;typedef int boolean;
#define WIDTH 78
#define ROOM 25
#define SDOOR 14
#define DOOR 23
#define NO_ROOM 0
#define SHARED 1
#define IS_ROOM(t) ((t)>=ROOM)
#define IS_WALL(t) ((t)&&(t)<=12)
#define IS_DOOR(t) ((t)==DOOR)
struct {int typ,roomno,lit,edge;}levl[80][21];
struct {int min_rx,min_ry,max_rx,max_ry;}gm;
struct {int n_loc_filled;}gn;
static int isok(int x,int y){return x>=1&&x<80&&y>=0&&y<21;}
void
flood_fill_rm(
    coordxy sx,
    coordxy sy,
    int rmno,
    boolean lit,
    boolean anyroom)
{
    coordxy i, nx;
    schar fg_typ = levl[sx][sy].typ;

    /* back up to find leftmost uninitialized location */
    while (sx > 0 && (anyroom ? IS_ROOM(levl[sx][sy].typ)
                              : levl[sx][sy].typ == fg_typ)
           && (int) levl[sx][sy].roomno != rmno)
        sx--;
    sx++; /* compensate for extra decrement */

    /* assume sx,sy is valid */
    if (sx < gm.min_rx)
        gm.min_rx = sx;
    if (sy < gm.min_ry)
        gm.min_ry = sy;

    for (i = sx; i <= WIDTH && levl[i][sy].typ == fg_typ; i++) {
        levl[i][sy].roomno = rmno;
        levl[i][sy].lit = lit;
        if (anyroom) {
            /* add walls to room as well */
            coordxy ii, jj;
            for (ii = (i == sx ? i - 1 : i); ii <= i + 1; ii++)
                for (jj = sy - 1; jj <= sy + 1; jj++)
                    if (isok(ii, jj) && (IS_WALL(levl[ii][jj].typ)
                                         || IS_DOOR(levl[ii][jj].typ)
                                         || levl[ii][jj].typ == SDOOR)) {
                        levl[ii][jj].edge = 1;
                        if (lit)
                            levl[ii][jj].lit = lit;

                        if (levl[ii][jj].roomno == NO_ROOM)
                            levl[ii][jj].roomno = rmno;
                        else if ((int) levl[ii][jj].roomno != rmno)
                            levl[ii][jj].roomno = SHARED;
                    }
        }
        gn.n_loc_filled++;
    }
    nx = i;

    if (isok(sx, sy - 1)) {
        for (i = sx; i < nx; i++)
            if (levl[i][sy - 1].typ == fg_typ) {
                if ((int) levl[i][sy - 1].roomno != rmno)
                    flood_fill_rm(i, sy - 1, rmno, lit, anyroom);
            } else {
                if ((i > sx || isok(i - 1, sy - 1))
                    && levl[i - 1][sy - 1].typ == fg_typ) {
                    if ((int) levl[i - 1][sy - 1].roomno != rmno)
                        flood_fill_rm(i - 1, sy - 1, rmno, lit, anyroom);
                }
                if ((i < nx - 1 || isok(i + 1, sy - 1))
                    && levl[i + 1][sy - 1].typ == fg_typ) {
                    if ((int) levl[i + 1][sy - 1].roomno != rmno)
                        flood_fill_rm(i + 1, sy - 1, rmno, lit, anyroom);
                }
            }
    }
    if (isok(sx, sy + 1)) {
        for (i = sx; i < nx; i++)
            if (levl[i][sy + 1].typ == fg_typ) {
                if ((int) levl[i][sy + 1].roomno != rmno)
                    flood_fill_rm(i, sy + 1, rmno, lit, anyroom);
            } else {
                if ((i > sx || isok(i - 1, sy + 1))
                    && levl[i - 1][sy + 1].typ == fg_typ) {
                    if ((int) levl[i - 1][sy + 1].roomno != rmno)
                        flood_fill_rm(i - 1, sy + 1, rmno, lit, anyroom);
                }
                if ((i < nx - 1 || isok(i + 1, sy + 1))
                    && levl[i + 1][sy + 1].typ == fg_typ) {
                    if ((int) levl[i + 1][sy + 1].roomno != rmno)
                        flood_fill_rm(i + 1, sy + 1, rmno, lit, anyroom);
                }
            }
    }

    if (nx > gm.max_rx)
        gm.max_rx = nx - 1; /* nx is just past valid region */
    if (sy > gm.max_ry)
        gm.max_ry = sy;
}

int main(void){int sx,sy,lit,x,y;while(scanf("%d%d%d",&sx,&sy,&lit)==3){
 memset(levl,0,sizeof levl);gn.n_loc_filled=0;gm.min_rx=gm.max_rx=sx;gm.min_ry=gm.max_ry=sy;
 for(y=0;y<21;y++)for(x=0;x<80;x++)if(scanf("%d",&levl[x][y].typ)!=1)return 2;
 flood_fill_rm(sx,sy,3,lit,1);
 printf("%d %d %d %d %d",gm.min_rx,gm.min_ry,gm.max_rx,gm.max_ry,gn.n_loc_filled);
 for(y=0;y<21;y++)for(x=0;x<80;x++)printf(" %d",levl[x][y].roomno*4+levl[x][y].lit*2+levl[x][y].edge);
 putchar('\n');}return 0;}
