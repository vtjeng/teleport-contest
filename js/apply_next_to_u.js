// Whether the hero's companions are close enough to leave the level with her.
// C refs: apply.c mleashed_next2u() and next_to_u().

import { UnsupportedHeroMoveBoundaryError } from './hack.js';
import { game } from './gstate.js';
import { get_iter_mons } from './mon.js';
import { mon_has_amulet } from './wizard.js';

// C ref: apply.c mleashed_next2u() (896-913).
//
// Its whole body sits behind `mtmp->mleashed`, and nothing in this port sets
// that flag: apply.c use_leash() is C's only writer and `#apply` is unported,
// which is the same reason js/steed.js:314 gives. The arm therefore refuses.
// Reproducing it would need mnexto(), get_mleash(), number_leashed() and the
// "You feel the leash go slack." line, and none of those is ported either.
function mleashed_next2u(monster) {
    if (monster.mleashed) {
        throw new UnsupportedHeroMoveBoundaryError(
            'next_to_u() with a leashed companion',
        );
    }
    return false;
}

// C ref: apply.c next_to_u() (918-926). Answers whether the hero may leave the
// level; goto_level()'s callers print "You are held back by your pet!" when it
// answers FALSE.
export function next_to_u(state = game) {
    if (get_iter_mons(mleashed_next2u, state)) return false;

    // C ref: apply.c:922-924, "no pack mules for the Amulet". A steed reaches
    // the rest of goto_level() through keepdogs()'s u.usteed arm, which is
    // unported, so this refuses the mount. Answering TRUE would carry a steed
    // into that arm.
    if (state.u.usteed) {
        if (mon_has_amulet(state.u.usteed)) return false;
        throw new UnsupportedHeroMoveBoundaryError(
            'next_to_u() with a steed',
        );
    }
    return true;
}
