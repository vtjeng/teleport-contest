#include <stdio.h>
static struct {struct {int udemigod;} uevent; int uinvulnerable, udg_cnt;} u;
static int interventions, renewals;
static void intervene(void){interventions++;}
static int rn1(int n,int b){if(n!=200||b!=50)return -1000;renewals++;return 123;}
static void tick(void){
                if (u.uevent.udemigod && !u.uinvulnerable) {
                    if (u.udg_cnt)
                        u.udg_cnt--;
                    if (!u.udg_cnt) {
                        intervene();
                        u.udg_cnt = rn1(200, 50);
                    }
                }
}
int main(void){
 u.uevent.udemigod=1;u.udg_cnt=50;
 for(int i=0;i<50;i++)tick();
 printf("demigod count=%d interventions=%d renewals=%d\n",u.udg_cnt,interventions,renewals);
 if(u.udg_cnt!=123||interventions!=1||renewals!=1)return 1;
 u.uevent.udemigod=0;u.udg_cnt=50;interventions=renewals=0;for(int i=0;i<50;i++)tick();
 printf("ordinary count=%d interventions=%d\n",u.udg_cnt,interventions);
 if(u.udg_cnt!=50||interventions)return 1;
 u.uevent.udemigod=1;u.uinvulnerable=1;u.udg_cnt=1;tick();
 printf("invulnerable count=%d interventions=%d\n",u.udg_cnt,interventions);
 return u.udg_cnt!=1||interventions;
}
