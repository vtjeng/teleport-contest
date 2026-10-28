#include <stdio.h>
#include <assert.h>
enum trap_types {
    ALL_TRAPS    = -1, /* mon_knows_traps(), mon_learns_traps() */
    NO_TRAP      =  0,
    ARROW_TRAP   =  1,
    DART_TRAP    =  2,
    ROCKTRAP     =  3,
    SQKY_BOARD   =  4,
    BEAR_TRAP    =  5,
    LANDMINE     =  6,
    ROLLING_BOULDER_TRAP = 7,
    SLP_GAS_TRAP =  8,
    RUST_TRAP    =  9,
    FIRE_TRAP    = 10,
    PIT          = 11,
    SPIKED_PIT   = 12,
    HOLE         = 13,
    TRAPDOOR     = 14,
    TELEP_TRAP   = 15,
    LEVEL_TELEP  = 16,
    MAGIC_PORTAL = 17,
    WEB          = 18,
    STATUE_TRAP  = 19,
    MAGIC_TRAP   = 20,
    ANTI_MAGIC   = 21,
    POLY_TRAP    = 22,
    VIBRATING_SQUARE = 23, /* not a trap but shown/remembered as if one
                            * once it has been discovered */

    /* trapped door and trapped chest aren't traps on the map, but they
       might be shown/remembered as such after trap detection until hero
       comes in view of them and sees the feature or object;
       key-using or door-busting monsters who survive a door trap learn
       to avoid other such doors [not implemented] */
    TRAPPED_DOOR = 24, /* part of door; not present on map as a trap */
    TRAPPED_CHEST = 25, /* part of object; not on map */

    TRAPNUM = 26
};
#define MKTRAP_NOSPIDERONWEB 0x4U
static int difficulty, hellish, single, chosen, extra, calls;
static struct {struct {struct {int noteleport;} flags;} level;} svl;
static struct {int uz;} u;
#define Inhell hellish
static unsigned level_difficulty(void){return difficulty;}
static int single_level_branch(int *p){(void)p;return single;}
static int rnd(int n){assert(calls++==0 && n==TRAPNUM-1 && chosen>=1 && chosen<=n);return chosen;}
static int rn2(int n){assert(n==7 && extra>=0 && extra<n);calls++;return extra;}
static int
traptype_rnd(unsigned mktrapflags)
{
    unsigned lvl = level_difficulty();
    int kind = rnd(TRAPNUM - 1);

    switch (kind) {
        /* these are controlled by the feature or object they guard,
           not by the map so mustn't be created on it */
    case TRAPPED_DOOR:
    case TRAPPED_CHEST:
        kind = NO_TRAP;
        break;
        /* these can have a random location but can't be generated
           randomly */
    case MAGIC_PORTAL:
    case VIBRATING_SQUARE:
        kind = NO_TRAP;
        break;
    case ROLLING_BOULDER_TRAP:
    case SLP_GAS_TRAP:
        if (lvl < 2)
            kind = NO_TRAP;
        break;
    case LEVEL_TELEP:
        if (lvl < 5 || svl.level.flags.noteleport
            || single_level_branch(&u.uz))
            kind = NO_TRAP;
        break;
    case SPIKED_PIT:
        if (lvl < 5)
            kind = NO_TRAP;
        break;
    case LANDMINE:
        if (lvl < 6)
            kind = NO_TRAP;
        break;
    case WEB:
        if (lvl < 7 && !(mktrapflags & MKTRAP_NOSPIDERONWEB))
            kind = NO_TRAP;
        break;
    case STATUE_TRAP:
    case POLY_TRAP:
        if (lvl < 8)
            kind = NO_TRAP;
        break;
    case FIRE_TRAP:
        if (!Inhell)
            kind = NO_TRAP;
        break;
    case TELEP_TRAP:
        if (svl.level.flags.noteleport)
            kind = NO_TRAP;
        break;
    case HOLE:
        /* make these much less often than other traps */
        if (rn2(7))
            kind = NO_TRAP;
        break;
    }
    return kind;
}
static int
traptype_roguelvl(void)
{
    int kind;

    switch (rn2(7)) {
    default:
        kind = BEAR_TRAP;
        break; /* 0 */
    case 1:
        kind = ARROW_TRAP;
        break;
    case 2:
        kind = DART_TRAP;
        break;
    case 3:
        kind = TRAPDOOR;
        break;
    case 4:
        kind = PIT;
        break;
    case 5:
        kind = SLP_GAS_TRAP;
        break;
    case 6:
        kind = RUST_TRAP;
        break;
    }
    return kind;
}
int main(void){int mode,flags,note;while(scanf("%d%d%d%d%d%d%d%d",&mode,&difficulty,&hellish,&single,&note,&flags,&chosen,&extra)==8){svl.level.flags.noteleport=note;calls=0;int result=mode?traptype_roguelvl():traptype_rnd(flags);printf("%d %d\n",result,calls);}return 0;}
