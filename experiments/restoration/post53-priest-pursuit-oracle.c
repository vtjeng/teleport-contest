#include <stdio.h>
#include <string.h>
#include <stdlib.h>
typedef int coordxy; typedef signed char schar; typedef int boolean;
#define TRUE 1
#define FALSE 0
#define Conflict 0
#define Displaced 0
#define Invis 0
#define Your(...) ((void)0)
struct extra { schar shroom; struct {int x,y;} shrpos; };
struct monst { int mx,my,mpeaceful,mcansee; struct extra *epri; };
#define EPRI(m) ((m)->epri)
static struct {int ux,uy; char urooms[5];} u;
static int visible=1, goalx,goaly,avoids;
static int histemple_at(struct monst *m,int x,int y){(void)m;return x>=3&&x<=13&&y>=3&&y<=10;}
static int rn1(int n,int base){(void)n;return base;}
static int resist_conflict(struct monst *m){(void)m;return 0;}
static int monnear(struct monst *m,int x,int y){return abs(m->mx-x)<=1&&abs(m->my-y)<=1;}
static int mattacku(struct monst *m){(void)m;return 0;}
static int m_canseeu(struct monst *m){(void)m;return visible;}
static int move_special(struct monst *m,int a,int b,int c,int avoid,int x,int y,int gx,int gy){(void)m;(void)a;(void)b;(void)c;(void)x;(void)y;goalx=gx;goaly=gy;avoids=avoid;return 1;}
int
pri_move(struct monst *priest)
{
    coordxy ggx, ggy, omx, omy;
    schar temple;
    boolean avoid = TRUE;

    omx = priest->mx;
    omy = priest->my;

    if (!histemple_at(priest, omx, omy))
        return -1;

    temple = EPRI(priest)->shroom;

    ggx = EPRI(priest)->shrpos.x;
    ggy = EPRI(priest)->shrpos.y;

    ggx += rn1(3, -1); /* mill around the altar */
    ggy += rn1(3, -1);

    if (!priest->mpeaceful
        || (Conflict && !resist_conflict(priest))) {
        if (monnear(priest, u.ux, u.uy)) {
            if (Displaced)
                Your("displaced image doesn't fool %s!", mon_nam(priest));
            (void) mattacku(priest);
            return 0;
        } else if (strchr(u.urooms, temple)) {
            /* chase player if inside temple & can see him */
            if (priest->mcansee && m_canseeu(priest)) {
                ggx = u.ux;
                ggy = u.uy;
            }
            avoid = FALSE;
        }
    } else if (Invis)
        avoid = FALSE;

    return move_special(priest, FALSE, TRUE, FALSE, avoid, omx, omy, ggx, ggy);
}

int main(void){
 struct extra e={3,{8,6}};struct monst m={9,6,0,1,&e};u.ux=12;u.uy=6;
 const char *names[]={"hostile-visible-inside","peaceful","hostile-obscured","hostile-outside"};
 const int expected[][3]={{12,6,0},{7,5,1},{7,5,0},{7,5,1}};
 for(int i=0;i<4;i++){m.mpeaceful=(i==1);visible=(i!=2);u.urooms[0]=(i==3?0:3);int r=pri_move(&m);printf("%s result=%d goal=%d,%d avoid=%d\n",names[i],r,goalx,goaly,avoids);if(r!=1||goalx!=expected[i][0]||goaly!=expected[i][1]||avoids!=expected[i][2])return 1;}
 return 0;
}
