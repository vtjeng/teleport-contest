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
