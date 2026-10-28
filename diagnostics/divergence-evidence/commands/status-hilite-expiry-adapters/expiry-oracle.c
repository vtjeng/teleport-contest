/* Exercise the real C expiry function over boundary partitions, not a copy. */
#include "hack.h"
__typeof__(gb) gb;
__typeof__(gm) gm;
__typeof__(svm) svm;
__typeof__(disp) disp;
__typeof__(iflags) iflags;
int main(void) {
    const long times[] = { 0, 9, 10, 11 };
    const int fields[] = { BL_AC, BL_HP };
    int a, b, rules, changes, multi, dirty, j, bank;
    struct hilite_s temporary = { 0 }, persistent = { 0 };
    temporary.behavior = BL_TH_UPDOWN;
    persistent.behavior = BL_TH_ALWAYS_HILITE;
    for (a=0; a<4; ++a) for (b=0; b<4; ++b)
    for (rules=0; rules<4; ++rules) for (changes=0; changes<4; ++changes)
    for (multi=-1; multi<=1; ++multi) for (dirty=0; dirty<=1; ++dirty) {
        memset(&gb, 0, sizeof gb); memset(&disp, 0, sizeof disp);
        svm.moves=10; gm.multi=multi; iflags.hilite_delta=3; disp.botl=dirty;
        for (j=0; j<2; ++j) for (bank=0; bank<2; ++bank) {
            struct istat_s *field = &gb.blstats[bank][fields[j]];
            field->time = times[j ? b : a];
            field->chg = !!(changes & (1 << j));
            field->hilite_rule = (rules & (1 << j)) ? &temporary : &persistent;
        }
        status_eval_next_unhilite();
        printf("[%ld,%ld,%d,%d,%d,%d,%d",times[a],times[b],rules,changes,multi,dirty,!!disp.botl);
        for (j=0; j<2; ++j) for (bank=0; bank<2; ++bank)
            printf(",%ld,%d",gb.blstats[bank][fields[j]].time,!!gb.blstats[bank][fields[j]].chg);
        puts("]");
    }
    return 0;
}
