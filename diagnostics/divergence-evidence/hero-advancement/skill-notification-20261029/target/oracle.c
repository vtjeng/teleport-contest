#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdarg.h>
#include <string.h>
#include <assert.h>
typedef int16_t xint16;
typedef int boolean;
#define TRUE 1
#define FALSE 0
#define staticfn static
#include "nethack-c/upstream/include/skills.h"
struct {struct skills weapon_skills[P_NUM_SKILLS];int weapon_slots,skills_advanced;} u;
static int wizard=0;
#define TIP_ENHANCE 0
static char message[1024];
/* Ordinary awake hero; messages are observed before terminal formatting. */
static void You_feel(const char *fmt,...){char text[512];va_list ap;va_start(ap,fmt);vsnprintf(text,sizeof text,fmt,ap);va_end(ap);assert(!message[0]);snprintf(message,sizeof message,"You feel %s",text);}
/* flags.tips is FALSE: hack.c handle_tip returns immediately, without reads
 * or writes beyond that flag. Enabled tips and display prompting are excluded. */
static int handle_tip(int tip){assert(tip==TIP_ENHANCE);return FALSE;}

staticfn int
slots_required(int skill)
{
    int tmp = P_SKILL(skill);

    /* The more difficult the training, the more slots it takes.
     *  unskilled -> basic      1
     *  basic -> skilled        2
     *  skilled -> expert       3
     */
    if (skill <= P_LAST_WEAPON || skill == P_TWO_WEAPON_COMBAT)
        return tmp;

    /* Fewer slots used up for unarmed or martial.
     *  unskilled -> basic      1
     *  basic -> skilled        1
     *  skilled -> expert       2
     *  expert -> master        2
     *  master -> grand master  3
     */
    return (tmp + 1) / 2;
}

boolean
can_advance(int skill, boolean speedy)
{
    if (P_RESTRICTED(skill)
        || P_SKILL(skill) >= P_MAX_SKILL(skill)
        || u.skills_advanced >= P_SKILL_LIMIT)
        return FALSE;

    if (wizard && speedy)
        return TRUE;

    return (boolean) ((int) P_ADVANCE(skill)
                      >= practice_needed_to_advance(P_SKILL(skill))
                      && u.weapon_slots >= slots_required(skill));
}

staticfn void
give_may_advance_msg(int skill)
{
    You_feel("more confident in your %sskills.",
             (skill == P_NONE) ? ""
                 : (skill <= P_LAST_WEAPON) ? "weapon "
                     : (skill <= P_LAST_SPELL) ? "spell casting "
                         : "fighting ");
    (void) handle_tip(TIP_ENHANCE);
}

void
add_weapon_skill(int n) /* number of slots to gain; normally one */
{
    int i, before, after;

    for (i = 0, before = 0; i < P_NUM_SKILLS; i++)
        if (can_advance(i, FALSE))
            before++;
    u.weapon_slots += n;
    for (i = 0, after = 0; i < P_NUM_SKILLS; i++)
        if (can_advance(i, FALSE))
            after++;
    if (before < after)
        give_may_advance_msg(P_NONE);
}

int main(int argc,char **argv){
 if(argc!=2)return 2;
 FILE *f=fopen(argv[1],"r");if(!f)return 2;
 int index,skill,rank,maxrank,practice,slots,increment,advanced;
 while(fscanf(f,"%d %d %d %d %d %d %d %d",&index,&skill,&rank,&maxrank,&practice,&slots,&increment,&advanced)==8){
  assert(skill>0&&skill<P_NUM_SKILLS&&slots>=0&&practice>=0&&practice<=65535);
  memset(&u,0,sizeof u);message[0]=0;
  u.weapon_slots=slots;u.skills_advanced=advanced;
  P_SKILL(skill)=rank;P_MAX_SKILL(skill)=maxrank;P_ADVANCE(skill)=practice;
  int before=can_advance(skill,FALSE);
  add_weapon_skill(increment);
  int after=can_advance(skill,FALSE);
  printf("{\"index\":%d,\"before\":%s,\"after\":%s,\"slots\":%d,\"message\":\"%s\"}\n",index,before?"true":"false",after?"true":"false",u.weapon_slots,message);
 }
 if(!feof(f))return 2;
 fclose(f);return 0;
}
