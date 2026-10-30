#include <stdio.h>
#define staticfn static
#define TRUE 1
#define FALSE 0
typedef int boolean;
struct level_id { int dungeon, depth; };
struct extra { struct level_id shoplevel, shrlevel, gdlevel; };
struct monst { int iswiz, isshk, ispriest, isgd; struct extra *mextra; };
static struct { struct level_id uz; } u;
#define ESHK(m) ((m)->mextra)
#define EPRI(m) ((m)->mextra)
#define EGD(m) ((m)->mextra)
static int on_level(struct level_id *a, struct level_id *b) { return a->dungeon==b->dungeon && a->depth==b->depth; }
staticfn boolean
keep_mon_accessible(struct monst *mon)
{
    /* the Wizard is kept accessible so that his harassment can fetch
       him instead of creating a new instance but also so that he can
       be put back at his current location if hero returns to his level */
    if (mon->iswiz)
        return TRUE;
    /* monsters with special attachment to a particular level only need
       to be kept accessible when on some other level */
    if (mon->mextra
        && ((mon->isshk && !on_level(&u.uz, &ESHK(mon)->shoplevel))
            || (mon->ispriest && !on_level(&u.uz, &EPRI(mon)->shrlevel))
            || (mon->isgd && !on_level(&u.uz, &EGD(mon)->gdlevel))))
        return TRUE;
    /* normal monsters go into the level save file instead of being held
       on the migrating_mons list for off-level accessibility */
    return FALSE;
}

int main(void) {
 struct monst original = { .iswiz=1 }, transformed = { .iswiz=1 }, ordinary = {0};
 printf("original=%d transformed=%d ordinary=%d\n",keep_mon_accessible(&original),keep_mon_accessible(&transformed),keep_mon_accessible(&ordinary));
 return !(keep_mon_accessible(&original) && keep_mon_accessible(&transformed) && !keep_mon_accessible(&ordinary));
}
