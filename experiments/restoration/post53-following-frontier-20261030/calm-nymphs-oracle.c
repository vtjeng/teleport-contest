/* Extracted unchanged music.c calm_nymphs body. Minimal monster/list/distance
   adapters and captured pline count; not a C-engine recording. */
#include <assert.h>
#include <stdio.h>
#define S_NYMPH 1
#define STRAT_WAITMASK 0x30
struct permonst {int mlet;};
struct monst {struct monst *nmon; struct permonst *data; int mhp,mcanmove,mx,my,msleeping,mpeaceful,mavenge,mstrategy,following,isshk;};
static struct monst *fmon;
static int message_count;
#define DEADMONSTER(m) ((m)->mhp < 1)
#define mdistu(m) (((m)->mx-10)*((m)->mx-10)+((m)->my-8)*((m)->my-8))
#define canseemon(m) ((m)->mhp > 0)
#define pline(...) (++message_count)
static void
calm_nymphs(int distance)
{
    struct monst *mtmp;

    for (mtmp = fmon; mtmp; mtmp = mtmp->nmon) {
        if (DEADMONSTER(mtmp))
            continue;
        if (mtmp->data->mlet == S_NYMPH && mtmp->mcanmove
            && mdistu(mtmp) < distance) {
            mtmp->msleeping = 0;
            mtmp->mpeaceful = 1;
            mtmp->mavenge = 0;
            mtmp->mstrategy &= ~STRAT_WAITMASK;
            if (canseemon(mtmp))
                pline(
                    "%s listens cheerfully to the music, then seems quieter.",
                      Monnam(mtmp));
        }
    }
}
int main(void) {
 struct permonst nymph={S_NYMPH}, other={2};
 struct monst m={.data=&nymph,.mhp=20,.mcanmove=1,.mx=9,.my=8,.mavenge=1,.mstrategy=STRAT_WAITMASK,.following=1,.isshk=1};
 fmon=&m;calm_nymphs(78);assert(m.mpeaceful && m.following && m.isshk && !m.mavenge && !m.mstrategy && message_count==1);
 m.mpeaceful=0;m.mx=3;m.my=3;message_count=0;calm_nymphs(72);assert(!m.mpeaceful && m.following && !message_count);
 m.mx=9;m.my=8;m.data=&other;calm_nymphs(78);assert(!m.mpeaceful && m.following && !message_count);
 puts("PASS extracted calm_nymphs: native-state-shaped target, range control, class control; following remains unchanged");
}
