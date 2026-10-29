#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
typedef int aligntyp;
#define A_ORIGINAL 0
static struct {aligntyp ualignbase[1];} u;
static int calls;
static int rn2(int n){int bound,value;assert(scanf("%d %d",&bound,&value)==2);assert(bound==n&&value>=0&&value<n);calls++;return value;}
static unsigned induced_align(int n){(void)n;abort();}
#define A_NONE (-128) /* the value range of type */

#define A_CHAOTIC (-1)
#define A_NEUTRAL 0
#define A_LAWFUL 1

#define A_COALIGNED 1
#define A_OPALIGNED (-1)

/* align masks */
#define AM_NONE         0x00
#define AM_CHAOTIC      0x01
#define AM_NEUTRAL      0x02
#define AM_LAWFUL       0x04
#define AM_MASK         0x07 /* mask for "normal" alignment values */

/* Some altars are considered shrines, add a flag for that
   for the altarmask field of struct rm. */
#define AM_SHRINE       0x08
/* High altar on Astral plane or Moloch's sanctum */
#define AM_SANCTUM      0x10

/* special level flags, gone by the time the level has been loaded */
#define AM_SPLEV_CO     0x20 /* co-aligned: force alignment to match hero's  */
#define AM_SPLEV_NONCO  0x40 /* non-co-aligned: force alignment to not match */
#define AM_SPLEV_RANDOM 0x80

#define Amask2align(x) \
    ((aligntyp) ((((x) & AM_MASK) == 0) ? A_NONE                \
                 : (((x) & AM_MASK) == AM_LAWFUL) ? A_LAWFUL    \
                   : ((int) ((x) & AM_MASK)) - 2)) /* 2 => 0, 1 => -1 */
#define Align2amask(x) \
    ((unsigned) (((x) == A_NONE) ? AM_NONE                      \
                 : ((x) == A_LAWFUL) ? AM_LAWFUL                \
                   : ((x) + 2))) /* -1 => 1, 0 => 2 */

static int
noncoalignment(aligntyp alignment)
{
    int k;

    k = rn2(2);
    if (!alignment)
        return (k ? -1 : 1);
    return (k ? -alignment : 0);
}
static unsigned int
sp_amask_to_amask(unsigned int sp_amask)
{
    unsigned int amask;

    if (sp_amask == AM_SPLEV_CO)
        amask = Align2amask(u.ualignbase[A_ORIGINAL]);
    else if (sp_amask == AM_SPLEV_NONCO)
        amask = Align2amask(noncoalignment(u.ualignbase[A_ORIGINAL]));
    else if (sp_amask == AM_SPLEV_RANDOM)
        amask = induced_align(80);
    else
        amask = sp_amask & AM_MASK;

    return amask;
}
int main(int argc,char**argv){assert(argc==3);u.ualignbase[0]=atoi(argv[1]);unsigned mask=sp_amask_to_amask(atoi(argv[2])?AM_SPLEV_NONCO:AM_SPLEV_CO);int extra;assert(scanf("%d",&extra)==EOF);printf("%u %d\n",mask,calls);return 0;}
