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
