/* Restricted adapter: ordinary unpolymorphed, unequipped, uninjured hero.
 * ACURR receives valid final attributes; acurr itself is not a C oracle here.
 * Inactive branches remain in extracted source but are not investigated. */
#include <stdio.h>
#include <stdlib.h>
#include "config.h"
#include "weight.h"
#include "obj.h"
#include "prop.h"
#include "skills.h"
#include "color.h"
#include "objclass.h"

#define max(a,b) ((a)>(b)?(a):(b))
#define min(a,b) ((a)<(b)?(a):(b))
#define STR18(x) (18+(x))
#define STR19(x) (100+(x))
#define A_STR 0
#define A_CON 1
static int attrs[2];
#define ACURR(x) attrs[x]
#define ACURRSTR acurrstr()
static long ELevitation, BLevitation;
#define Upolyd 0
#define Levitation 0
#define Flying 0
#define EWounded_legs 0
#define S_NYMPH 'n'
#define MZ_HUMAN 2


#define UNENCUMBERED 0
#define OVERLOADED 5
struct permonst { int mlet,cwt,msize; };
struct monst { struct permonst *data; };

static struct { void (*afternmv)(void); } ga;
static struct { struct monst youmonst; } gy;
static struct { int uz; struct monst *usteed; } u;
static struct { struct obj *invent; } gi;
static struct { int wc; } gw;
static void Boots_on(void) { abort(); }
static void float_vs_flight(void) { abort(); }
#define Is_airlevel(x) 0
#define strongmonst(x) 0
#define throws_rocks(x) 0
#define panic(x) abort()

extern void objects_globals_init(void);
static struct permonst mons[1];
#define ismnum(x) 0
#define impossible(...) abort()
#define simpleonames(x) ""
#define eaten_stat(w,o) (abort(),0)
