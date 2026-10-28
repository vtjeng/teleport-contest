#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
typedef short xint16;
typedef struct {int lx,ly,hx,hy;} NhRect;
struct selectionvar {int points[80][21];};
static struct {NhRect zeroNhRect;} cg;
static struct {int typ;unsigned lit;} levl[80][21];
static int draws[8],bounds[8],count;
static int rn2(int n){int v=draws[count];assert(v>=0&&v<n);bounds[count++]=n;return v;}
static struct selectionvar *selection_new(void){return calloc(1,sizeof(struct selectionvar));}
static void selection_getbounds(struct selectionvar *s,NhRect *r){*r=(NhRect){0,0,79,20};}
static int selection_getpoint(int x,int y,struct selectionvar *s){return s->points[x][y];}
static void selection_setpoint(int x,int y,struct selectionvar *s,int v){s->points[x][y]=v;}
static int match_maptyps(int a,int b){return a==b;} /* finite ROOM-only domain */
struct selectionvar *
selection_filter_percent(
    struct selectionvar *ov,
    int percent)
{
    int x, y;
    struct selectionvar *ret;
    NhRect rect = cg.zeroNhRect;

    if (!ov)
        return NULL;

    ret = selection_new();

    selection_getbounds(ov, &rect);

    for (x = rect.lx; x <= rect.hx; x++)
        for (y = rect.ly; y <= rect.hy; y++)
            if (selection_getpoint(x, y, ov) && (rn2(100) < percent))
                selection_setpoint(x, y, ret, 1);

    return ret;
}

struct selectionvar *
selection_filter_mapchar(struct selectionvar *ov,  xint16 typ, int lit)
{
    int x, y;
    struct selectionvar *ret;
    NhRect rect = cg.zeroNhRect;

    if (!ov)
        return NULL;

    ret = selection_new();

    selection_getbounds(ov, &rect);

    for (x = rect.lx; x <= rect.hx; x++)
        for (y = rect.ly; y <= rect.hy; y++)
            if (selection_getpoint(x, y, ov)
                && match_maptyps(typ, levl[x][y].typ)) {
                switch (lit) {
                default:
                case -2:
                    selection_setpoint(x, y, ret, 1);
                    break;
                case -1:
                    selection_setpoint(x, y, ret, rn2(2));
                    break;
                case 0:
                case 1:
                    if (levl[x][y].lit == (unsigned int) lit)
                        selection_setpoint(x, y, ret, 1);
                    break;
                }
            }
    return ret;
}
int main(int argc,char **argv){
 if(argc!=4)return 2;int family=atoi(argv[1]),value=atoi(argv[2]),empty=atoi(argv[3]);
 struct selectionvar *sel=selection_new();
 for(int x=10;x<=11;x++)for(int y=10;y<=11;y++){
  if(!empty)selection_setpoint(x,y,sel,1);
  levl[x][y].typ=(x==11&&y==10)?2:25;
  levl[x][y].lit=(x==11&&y==11);
 }
 int lightdraws[]={1,0,1},percentdraws[]={49,50,0,99};
 for(int i=0;i<4;i++)draws[i]=family?percentdraws[i]:(i<3?lightdraws[i]:0);
 struct selectionvar *out=family?selection_filter_percent(sel,value):selection_filter_mapchar(sel,25,value);
 printf("calls");for(int i=0;i<count;i++)printf(" %d",bounds[i]);puts("");
 for(int x=0;x<80;x++)for(int y=0;y<21;y++)if(out->points[x][y])printf("%d,%d\n",x,y);
 free(out);free(sel);
}
