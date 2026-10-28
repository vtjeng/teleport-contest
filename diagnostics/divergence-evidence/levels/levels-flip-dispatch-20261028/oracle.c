#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
typedef int boolean;
static int calls,mask;
static int rn2(int n){int bound,value;assert(scanf("%d %d",&bound,&value)==2);assert(bound==n&&value>=0&&value<n);calls++;return value;}
static void flip_level(int m,boolean extras){assert(m>=1&&m<=3&&!extras);mask=m;}
void
flip_level_rnd(int flp, boolean extras)
{
    int c = 0;

    /* TODO?
     *  Might change rn2(2) to !rn2(3) or (rn2(5) < 2) in order to bias
     *  the outcome towards the traditional orientation.
     */
    if ((flp & 1) && rn2(2))
        c |= 1;
    if ((flp & 2) && rn2(2))
        c |= 2;

    if (c)
        flip_level(c, extras);
}
int main(int argc,char**argv){assert(argc==2);flip_level_rnd(atoi(argv[1]),0);int extra;assert(scanf("%d",&extra)==EOF);printf("%d %d\n",mask,calls);return 0;}
