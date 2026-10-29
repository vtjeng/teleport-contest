#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <limits.h>
#include <assert.h>
typedef void *genericptr_t;
typedef signed char schar;
typedef unsigned char uchar;
typedef int boolean;
typedef int16_t xint16;
typedef int8_t xint8;
typedef int16_t coordxy;
typedef int64_t int64;
typedef uint64_t uint64;
typedef uint32_t uint32;
typedef uint16_t uint16;
typedef uint8_t uint8;
#define STATUS_HILITES 1
#define TRUE 1
#define FALSE 0
#define staticfn static
#define LARGEST_INT 32767
#define Upolyd 0
#define PM_WIZARD 1
#define Role_if(x) 0
#include "nethack-c/upstream/include/color.h"
enum optchoice { opt_in, opt_out };
#include "nethack-c/upstream/include/wintype.h"
#include "nethack-c/upstream/include/botl.h"
struct {struct istat_s blstats[2][MAXBLSTATS];} gb;
static struct istat_s initblstats[MAXBLSTATS];
struct {int now_or_before_idx;} gn;
struct {anything zeroany;} cg;
struct {char plname[32];} svp;
struct {long uexp,urexp;int ulevel;} u;
struct {int showexp,beginner;} flags;
struct {int botl;} disp;
#define has_hilite(i) (gb.blstats[0][(i)].thresholds)
/* Only BL_XP numerical rules are admitted. Other dependencies must not run. */
static void impossible(const char *s,...){(void)s;abort();}
static const char *fmt_ptr(genericptr_t p){(void)p;abort();}
static int fuzzymatch(const char*a,const char*b,const char*c,int d){(void)a;(void)b;(void)c;(void)d;abort();}
static int noneoftheabove(const char*a){(void)a;abort();}
static int critically_low_hp(int a){(void)a;abort();}
long
newuexp(int lev)
{
    if (lev < 1) /* for newuexp(u.ulevel - 1) when u.ulevel is 1 */
        return 0L;
    if (lev < 10)
        return (10L * (1L << lev));
    if (lev < 20)
        return (10000L * (1L << (lev - 10)));
    return (10000000L * ((long) (lev - 19)));
}

staticfn int
percentage(struct istat_s *bl, struct istat_s *maxbl)
{
    int result = 0;
    int anytype;
    int ival, mval;
    long lval;
    unsigned uval;
    unsigned long ulval;
    int fld;
    boolean use_rawval;

    if (!bl || !maxbl) {
        impossible("percentage: bad istat pointer %s, %s",
                   fmt_ptr((genericptr_t) bl), fmt_ptr((genericptr_t) maxbl));
        return 0;
    }

    fld = bl->fld;
    use_rawval = (fld == BL_HP || fld == BL_ENE);
    ival = 0, lval = 0L, uval = 0U, ulval = 0UL;
    anytype = bl->anytype;
    if (maxbl->a.a_void) {
        switch (anytype) {
        case ANY_INT:
            /* HP and energy are int so this is the only case that cares
               about 'rawval'; for them, we use that rather than their
               potentially truncated (to 9999) display value */
            ival = use_rawval ? bl->rawval.a_int : bl->a.a_int;
            mval = use_rawval ? maxbl->rawval.a_int : maxbl->a.a_int;
            result = ((100 * ival) / mval);
            break;
        case ANY_LONG:
            lval  = bl->a.a_long;
            result = (int) ((100L * lval) / maxbl->a.a_long);
            break;
        case ANY_UINT:
            uval = bl->a.a_uint;
            result = (int) ((100U * uval) / maxbl->a.a_uint);
            break;
        case ANY_ULONG:
            ulval = bl->a.a_ulong;
            result = (int) ((100UL * ulval) / maxbl->a.a_ulong);
            break;
        case ANY_IPTR:
            ival = *bl->a.a_iptr;
            result = ((100 * ival) / (*maxbl->a.a_iptr));
            break;
        case ANY_LPTR:
            lval = *bl->a.a_lptr;
            result = (int) ((100L * lval) / (*maxbl->a.a_lptr));
            break;
        case ANY_UPTR:
            uval = *bl->a.a_uptr;
            result = (int) ((100U * uval) / (*maxbl->a.a_uptr));
            break;
        case ANY_ULPTR:
            ulval = *bl->a.a_ulptr;
            result = (int) ((100UL * ulval) / (*maxbl->a.a_ulptr));
            break;
        }
    }
    /* don't let truncation from integer division produce a zero result
       from a non-zero input; note: if we ever change to something like
       ((((1000 * val) / max) + 5) / 10) for a rounded result, we'll
       also need to check for and convert false 100 to 99 */
    if (result == 0
        && (ival != 0 || lval != 0L || uval != 0U || ulval != 0UL))
        result = 1;

    return result;
}

staticfn int
exp_percentage(void)
{
    int res = 0;

    if (u.ulevel < 30) {
        long exp_val, nxt_exp_val, curlvlstart;

        curlvlstart = newuexp(u.ulevel - 1);
        exp_val = u.uexp - curlvlstart;
        nxt_exp_val = newuexp(u.ulevel) - curlvlstart;
        if (exp_val == nxt_exp_val - 1L) {
            /*
             * Full 100% is unattainable since hero gains a level
             * and the threshold for next level increases, but treat
             * (next_level_start - 1 point) as a special case.  It's a
             * key value after being level drained so is something that
             * some players would like to be able to highlight distinctly.
             */
            res = 100;
        } else {
            struct istat_s curval, maxval;

            curval.anytype = maxval.anytype = ANY_LONG;
            curval.a = maxval.a = cg.zeroany;
            curval.a.a_long = exp_val;
            maxval.a.a_long = nxt_exp_val;
            curval.fld = maxval.fld = BL_EXP; /* (neither BL_HP nor BL_ENE) */
            /* maximum delta between levels is 10000000; calculation of
               100 * (10000000 - N) / 10000000 fits within 32-bit long */
            res = percentage(&curval, &maxval);
        }
    }
    return res;
}

staticfn struct hilite_s *
get_hilite(
    int idx, int fldidx,
    genericptr_t vp,
    int chg, int pc,
    int *colorptr)
{
    struct hilite_s *hl, *rule = 0;
    anything *value = (anything *) vp;
    char *txtstr;

    if (fldidx < 0 || fldidx >= MAXBLSTATS)
        return (struct hilite_s *) 0;

    if (has_hilite(fldidx)) {
        int dt;
        /* there are hilites set here */
        int max_pc = -1, min_pc = 101;
        /* LARGEST_INT isn't INT_MAX; it fits within 16 bits, but that
           value is big enough to handle all 'int' status fields */
        int max_ival = -LARGEST_INT, min_ival = LARGEST_INT;
        /* LONG_MAX comes from <limits.h> which might not be available for
           ancient configurations; we don't need LONG_MIN */
        long max_lval = -LONG_MAX, min_lval = LONG_MAX;
        boolean exactmatch = FALSE, updown = FALSE, changed = FALSE,
                perc_or_abs = FALSE, crit_hp = FALSE;

        /* min_/max_ are used to track best fit */
        for (hl = gb.blstats[0][fldidx].thresholds; hl; hl = hl->next) {
            dt = initblstats[fldidx].anytype; /* only needed for 'absolute' */
            /* for HP, if we already have a critical-hp rule then we ignore
               other HP rules unless we hit another critical-hp one (last
               one found wins); critical-hp takes precedence over temporary
               HP highlights, otherwise a hero with regeneration and an up
               or changed rule for HP would always show that up or changed
               highlight even when within the critical-hp threshold because
               the value will go up by at least one on every move */
            if (crit_hp && hl->behavior != BL_TH_CRITICALHP)
                continue;
            /* if we've already matched a temporary highlight, it takes
               precedence over all persistent ones; we still process
               updown rules to get the last one which qualifies */
            if ((updown || changed) && hl->behavior != BL_TH_UPDOWN)
                continue;
            /* among persistent highlights, if a 'percentage' or 'absolute'
               rule has been matched, it takes precedence over 'always' */
            if (perc_or_abs && hl->behavior == BL_TH_ALWAYS_HILITE)
                continue;

            switch (hl->behavior) {
            case BL_TH_VAL_PERCENTAGE: /* percent values are always ANY_INT */
                if (hl->rel == EQ_VALUE && pc == hl->value.a_int) {
                    rule = hl;
                    min_pc = max_pc = hl->value.a_int;
                    exactmatch = perc_or_abs = TRUE;
                } else if (exactmatch) {
                    ; /* already found best fit, skip lt,ge,&c */
                } else if (hl->rel == LT_VALUE
                           && (pc < hl->value.a_int)
                           && (hl->value.a_int <= min_pc)) {
                    rule = hl;
                    min_pc = hl->value.a_int;
                    perc_or_abs = TRUE;
                } else if (hl->rel == LE_VALUE
                           && (pc <= hl->value.a_int)
                           && (hl->value.a_int <= min_pc)) {
                    rule = hl;
                    min_pc = hl->value.a_int;
                    perc_or_abs = TRUE;
                } else if (hl->rel == GT_VALUE
                           && (pc > hl->value.a_int)
                           && (hl->value.a_int >= max_pc)) {
                    rule = hl;
                    max_pc = hl->value.a_int;
                    perc_or_abs = TRUE;
                } else if (hl->rel == GE_VALUE
                           && (pc >= hl->value.a_int)
                           && (hl->value.a_int >= max_pc)) {
                    rule = hl;
                    max_pc = hl->value.a_int;
                    perc_or_abs = TRUE;
                }
                break;
            case BL_TH_UPDOWN: /* uses 'chg' (set by caller), not 'dt' */
                /* specific 'up' or 'down' takes precedence over general
                   'changed' regardless of their order in the rule set */
                if (chg < 0 && hl->rel == LT_VALUE) {
                    rule = hl;
                    updown = TRUE;
                } else if (chg > 0 && hl->rel == GT_VALUE) {
                    rule = hl;
                    updown = TRUE;
                } else if (chg != 0 && hl->rel == EQ_VALUE && !updown) {
                    rule = hl;
                    changed = TRUE;
                }
                break;
            case BL_TH_VAL_ABSOLUTE: /* either ANY_INT or ANY_LONG */
                /*
                 * The int and long variations here are identical aside from
                 * union field and min_/max_ variable names.  If you change
                 * one, be sure to make a corresponding change in the other.
                 */
                if (dt == ANY_INT) {
                    if (hl->rel == EQ_VALUE
                        && hl->value.a_int == value->a_int) {
                        rule = hl;
                        min_ival = max_ival = hl->value.a_int;
                        exactmatch = perc_or_abs = TRUE;
                    } else if (exactmatch) {
                        ; /* already found best fit, skip lt,ge,&c */
                    } else if (hl->rel == LT_VALUE
                               && (value->a_int < hl->value.a_int)
                               && (hl->value.a_int <= min_ival)) {
                        rule = hl;
                        min_ival = hl->value.a_int;
                        perc_or_abs = TRUE;
                    } else if (hl->rel == LE_VALUE
                               && (value->a_int <= hl->value.a_int)
                               && (hl->value.a_int <= min_ival)) {
                        rule = hl;
                        min_ival = hl->value.a_int;
                        perc_or_abs = TRUE;
                    } else if (hl->rel == GT_VALUE
                               && (value->a_int > hl->value.a_int)
                               && (hl->value.a_int >= max_ival)) {
                        rule = hl;
                        max_ival = hl->value.a_int;
                        perc_or_abs = TRUE;
                    } else if (hl->rel == GE_VALUE
                               && (value->a_int >= hl->value.a_int)
                               && (hl->value.a_int >= max_ival)) {
                        rule = hl;
                        max_ival = hl->value.a_int;
                        perc_or_abs = TRUE;
                    }
                } else { /* ANY_LONG */
                    if (hl->rel == EQ_VALUE
                        && hl->value.a_long == value->a_long) {
                        rule = hl;
                        min_lval = max_lval = hl->value.a_long;
                        exactmatch = perc_or_abs = TRUE;
                    } else if (exactmatch) {
                        ; /* already found best fit, skip lt,ge,&c */
                    } else if (hl->rel == LT_VALUE
                               && (value->a_long < hl->value.a_long)
                               && (hl->value.a_long <= min_lval)) {
                        rule = hl;
                        min_lval = hl->value.a_long;
                        perc_or_abs = TRUE;
                    } else if (hl->rel == LE_VALUE
                               && (value->a_long <= hl->value.a_long)
                               && (hl->value.a_long <= min_lval)) {
                        rule = hl;
                        min_lval = hl->value.a_long;
                        perc_or_abs = TRUE;
                    } else if (hl->rel == GT_VALUE
                               && (value->a_long > hl->value.a_long)
                               && (hl->value.a_long >= max_lval)) {
                        rule = hl;
                        max_lval = hl->value.a_long;
                        perc_or_abs = TRUE;
                    } else if (hl->rel == GE_VALUE
                               && (value->a_long >= hl->value.a_long)
                               && (hl->value.a_long >= max_lval)) {
                        rule = hl;
                        max_lval = hl->value.a_long;
                        perc_or_abs = TRUE;
                    }
                }
                break;
            case BL_TH_TEXTMATCH: /* ANY_STR */
                txtstr = gb.blstats[idx][fldidx].val;
                if (fldidx == BL_TITLE)
                    /* "<name> the <rank-title>", skip past "<name> the " */
                    txtstr += strlen(svp.plname) + sizeof " the " - sizeof "";
                if (hl->rel == TXT_VALUE && hl->textmatch[0]) {
                    if (fuzzymatch(hl->textmatch, txtstr, "\" -_", TRUE)) {
                        rule = hl;
                        exactmatch = TRUE;
                    } else if (exactmatch) {
                        ; /* already found best fit, skip "noneoftheabove" */
                    } else if (fldidx == BL_TITLE
                               && Upolyd && noneoftheabove(hl->textmatch)) {
                        rule = hl;
                    }
                }
                break;
            case BL_TH_ALWAYS_HILITE:
                rule = hl;
                break;
            case BL_TH_CRITICALHP:
                if (fldidx == BL_HP && critically_low_hp(FALSE)) {
                    rule = hl;
                    crit_hp = TRUE;
                    updown = changed = perc_or_abs = FALSE;
                }
                break;
            case BL_TH_NONE:
                break;
            default:
                break;
            }
        }
    }
    *colorptr = rule ? rule->coloridx : NO_COLOR;
    return rule;
}

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
 int id,preset,pending;long oldxp,newxp;
 while(fscanf(f,"%d %d %ld %ld %d",&id,&preset,&oldxp,&newxp,&pending)==5){
  assert(preset>=0&&preset<=3&&oldxp>=0&&newxp>=oldxp&&newxp<20);
  memset(&gb,0,sizeof gb);memset(&u,0,sizeof u);u.ulevel=1;u.uexp=oldxp;flags.showexp=0;flags.beginner=1;disp.botl=pending;
  struct hilite_s rules[3];memset(rules,0,sizeof rules);
  if(preset==1||preset==3){
   rules[0].behavior=rules[1].behavior=BL_TH_VAL_PERCENTAGE;rules[0].rel=LT_VALUE;rules[1].rel=preset==1?GE_VALUE:EQ_VALUE;
   rules[0].value.a_int=rules[1].value.a_int=preset==1?50:100;rules[0].coloridx=1;rules[1].coloridx=2;rules[0].next=&rules[1];
  }else if(preset==2){
   rules[0].behavior=BL_TH_ALWAYS_HILITE;rules[0].coloridx=4;rules[0].next=&rules[1];
   rules[1].behavior=BL_TH_UPDOWN;rules[1].rel=GT_VALUE;rules[1].coloridx=2;rules[1].next=&rules[2];
   rules[2].behavior=BL_TH_VAL_PERCENTAGE;rules[2].rel=GE_VALUE;rules[2].value.a_int=50;rules[2].coloridx=1;
  }
  initblstats[BL_XP].anytype=ANY_INT;gb.blstats[0][BL_XP].percent_matters=1;gb.blstats[0][BL_XP].thresholds=preset?rules:NULL;
  gb.blstats[0][BL_XP].percent_value=exp_percentage();anything value=cg.zeroany;value.a_int=1;int color;
  gb.blstats[0][BL_XP].hilite_rule=get_hilite(0,BL_XP,&value,0,exp_percentage(),&color);
  u.uexp=newxp;int changed=exp_percent_changing();u.uexp=oldxp;more_experienced((int)(newxp-oldxp),0);
  printf("{\"id\":%d,\"changed\":%s,\"redraw\":%s,\"xp\":%ld,\"score\":%ld}\n",id,changed?"true":"false",disp.botl?"true":"false",u.uexp,u.urexp);
 }
 int result=feof(f)?0:2;fclose(f);return result;
}
