#include <stdio.h>
static int dig(void){return 0;}
static struct {int (*occupation)(void);} go;
static struct {char ushops[2];} u;
static struct {struct {struct {int effort;} digging;} context;} svc;
int
holetime(void)
{
    if (go.occupation != dig || !*u.ushops)
        return -1;
    return ((250 - svc.context.digging.effort) / 20);
}

int main(void){
 go.occupation=dig;u.ushops[0]=3;
 int efforts[]={13,133,230,250,251};int expected[]={11,5,1,0,0};
 for(int i=0;i<5;i++){svc.context.digging.effort=efforts[i];int n=holetime();printf("effort=%d time=%d\n",efforts[i],n);if(n!=expected[i])return 1;}
 go.occupation=0;if(holetime()!=-1)return 1;
 go.occupation=dig;u.ushops[0]=0;return holetime()!=-1;
}
