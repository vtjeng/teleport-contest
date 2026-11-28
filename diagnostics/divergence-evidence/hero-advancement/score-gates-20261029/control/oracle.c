#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <limits.h>
#define TRUE 1
#define FALSE 0
#define STATUS_HILITES 1
#define BL_XP 0
#define PM_WIZARD 1
#define Role_if(x) (role == (x))
typedef int boolean;
typedef void *genericptr_t;
typedef union {int a_int;} anything;
struct hilite_s {int unused;};
struct istat_s {int percent_matters,percent_value;struct hilite_s *thresholds,*hilite_rule;};
struct {struct istat_s blstats[1][1];} gb;
struct {int now_or_before_idx;} gn;
struct {anything zeroany;} cg;
struct {long uexp,urexp;int ulevel;} u;
struct {int showexp,beginner;} flags;
struct {int botl;} disp;
static int role;
/* No thresholds is an explicit precondition; these dependencies must not run. */
static int exp_percentage(void){abort();}
static struct hilite_s *get_hilite(int a,int b,genericptr_t c,int d,int e,int *f){(void)a;(void)b;(void)c;(void)d;(void)e;(void)f;abort();}
boolean
exp_percent_changing(void)
{
    int pc;
    anything a;
#ifdef STATUS_HILITES
    int color_dummy;
    struct hilite_s *rule;
#endif
    struct istat_s *curr;

    /* if status update is already requested, skip this processing */
    if (!disp.botl) {
        /*
         * Status update is warranted iff percent integer changes and the new
         * percentage results in a different highlighting rule being selected.
         */
        curr = &gb.blstats[gn.now_or_before_idx][BL_XP];
        /* TODO: [see eval_notify_windowport_field() about percent_matters
           and the check against 'thresholds'] */
        if (curr->percent_matters
#ifdef STATUS_HILITES
            && curr->thresholds
#endif
            && (pc = exp_percentage()) != curr->percent_value) {
            a = cg.zeroany;
            a.a_int = (int) u.ulevel;
#ifdef STATUS_HILITES
            rule = get_hilite(gn.now_or_before_idx, BL_XP,
                              (genericptr_t) &a, 0, pc, &color_dummy);
            if (rule != curr->hilite_rule)
                return TRUE; /* caller should set 'disp.botl' to True */
#endif
        }
    }
    return FALSE;
}

void
more_experienced(int exper, int rexp)
{
    long oldexp = u.uexp,
         oldrexp = u.urexp,
         newexp = oldexp + exper,
         rexpincr = 4 * exper + rexp,
         newrexp = oldrexp + rexpincr;

    /* cap experience and score on wraparound */
    if (newexp < 0 && exper > 0)
        newexp = LONG_MAX;
    if (newrexp < 0 && rexpincr > 0)
        newrexp = LONG_MAX;

    if (newexp != oldexp) {
        u.uexp = newexp;
        if (flags.showexp)
            disp.botl = TRUE;
        /* even when experience points aren't being shown, experience level
           might be highlighted with a percentage highlight rule and that
           percentage depends upon experience points */
        if (!disp.botl && exp_percent_changing())
            disp.botl = TRUE;
    }
    /* newrexp will always differ from oldrexp unless they're LONG_MAX */
    if (newrexp != oldrexp) {
        u.urexp = newrexp;
#ifdef SCORE_ON_BOTL
        if (flags.showscore)
            disp.botl = TRUE;
#endif
    }
    if (u.urexp >= (Role_if(PM_WIZARD) ? 1000 : 2000))
        flags.beginner = FALSE;
}

int main(int argc,char **argv){
 if(argc!=2)return 2;
 FILE*f=fopen(argv[1],"r");if(!f)return 2;
 int id,exper,rexp,beginner;
 while(fscanf(f,"%d %d %ld %ld %d %d %d %d %d",&id,&role,&u.uexp,&u.urexp,&exper,&rexp,&flags.showexp,&disp.botl,&beginner)==9){
  assert(role==0||role==1);assert(u.uexp>=0&&u.uexp<10000&&u.urexp>=0&&u.urexp<10000);assert(exper>=0&&exper<=2&&rexp>=0&&rexp<=10);
  u.ulevel=1;flags.beginner=beginner;gb.blstats[0][0].percent_matters=1;
  more_experienced(exper,rexp);
  printf("{\"id\":%d,\"xp\":%ld,\"score\":%ld,\"beginner\":%s,\"redraw\":%s}\n",id,u.uexp,u.urexp,flags.beginner?"true":"false",disp.botl?"true":"false");
 }
 int result=feof(f)?0:2;fclose(f);return result;
}
