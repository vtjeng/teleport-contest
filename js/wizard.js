// The Wizard of Yendor's harassment, and the Amulet test the rest of the game
// shares with it.
// C ref: wizard.c mon_has_amulet().

import { AMULET_OF_YENDOR } from './objects.js';

// C ref: wizard.c mon_has_amulet() (105-114). Pure; do.c goto_level() reaches
// it three times on the descent path, through apply.c next_to_u(), mondata.c
// levl_follower() and dog.c keepdogs().
//
// It answers FALSE for every monster this port can build: the Amulet is
// generated only on the Sanctum level and by the Wizard's own resurrection,
// neither of which the port reaches. It is ported because all three callers
// would otherwise need the same hand-waved guard.
export function mon_has_amulet(monster) {
    for (let otmp = monster.minvent; otmp; otmp = otmp.nobj)
        if (otmp.otyp === AMULET_OF_YENDOR) return true;
    return false;
}
