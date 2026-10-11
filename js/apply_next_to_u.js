// Whether the hero's companions are close enough to leave the level with her.
// C refs: apply.c mleashed_next2u() and next_to_u().

import { UnsupportedHeroMoveBoundaryError } from './hack.js';
import { game } from './gstate.js';
import { get_iter_mons } from './mon.js';
import { mon_has_amulet } from './wizard.js';

// C ref: apply.c mleashed_next2u() (896-913).
//
// Its whole body sits behind `mtmp->mleashed`; apply.c:use_leash() and
// newcham() can now establish and maintain that state. This companion-follow
// arm still refuses because apply.c:mleashed_next2u()'s consumed mnexto()
// result and "You feel the leash go slack." behavior are not ported.
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

    // C ref: apply.c:924-927. The steed may leave the level unless it
    // carries the Amulet; dog.c:keepdogs() and mon_arrive() preserve the mount.
    if (state.u.usteed && mon_has_amulet(state.u.usteed)) return false;
    return true;
}
