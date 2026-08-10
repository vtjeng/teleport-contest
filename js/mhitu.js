// mhitu.js -- Monsters attacking the hero.
// C ref: mhitu.c -- mattacku(), its preamble and its u.usteed arm.

import { game } from './gstate.js';
import { nomul } from './hack.js';
import { dist2 } from './hacklib.js';
import { is_orc } from './mondata.js';

// C ref: hack.h distu() and mdistu(). mdistu() is distu() applied to a
// monster's own square, with no long-worm handling of its own.
function mdistu(monster, state) {
    return dist2(monster.mx, monster.my, state.u.ux, state.u.uy);
}

// C ref: you.h m_next2u(), `distu((m)->mx, (m)->my) <= 2`. dist2() is a
// squared distance, so it never equals 3 and this is the same set of squares
// as mattacku()'s `!ranged`.
function m_next2u(monster, state) {
    return mdistu(monster, state) <= 2;
}

// C ref: mhitu.c mattacku(), from its preamble down to the end of the
// `else if (u.usteed)` arm. Everything below that arm -- the u.uundetected
// block, the melee attacks, and the ranged attacks -- is refused elsewhere.
// Four seams stand in for mattacku(). Two route through this module and then
// apply their own stops: js/unported_monster_actions.js:809 and :850, which
// are monmove.c:971 and the folded :954/:971 post-move path. Two do not, and
// are fail-closed today: js/unported_monster_actions.js:732 (dogmove.c:1286)
// and js/dogmove.js:891 (dogmove.c:911). Each of those owes the steed draw
// before it stops, and must call this function when it is ported.
//
// The result is TRUE where C's mattacku() has already returned, so the caller
// must run none of the arms below. C distinguishes its 1 from its 0 to tell
// dochug() the monster died; nothing here can kill the attacker, so the
// callers need only the "stop" bit.
//
// The steed arm's draw is what makes this function exist. Every monster that
// reaches mattacku() while the hero is mounted spends one rn2() deciding
// whether to go for the steed instead, whether or not it is close enough to
// follow through -- an orc, which likes horseflesh, on rn2(2) and everything
// else on rn2(4).
//
// Three lines of the preamble are deliberately absent:
//   calc_mattacku_vars() also writes gb.bhitpos and gn.notonhead, which no
//     ported reader has;
//   DEADMONSTER(mtmp) cannot answer TRUE, because mon.c movemon() drops a
//     monster with mhp < 1 before dochug() runs and nothing between there and
//     here damages it;
//   Underwater needs u.uinwater, whose sole writer is hack.c set_uinwater()
//     and whose only ported callers, in js/do.js, both pass FALSE.
// C's `if (u.uswallow)` arm is absent for the same kind of reason: js/mon.js
// clears u.uswallow and no ported path sets it, so only the steed arm of that
// if/else chain can be taken.
export function mattacku(monster, { state = game, random, unsupported }) {
    const u = state.u;
    const ranged = mdistu(monster, state) > 3;

    if (!ranged)
        nomul(0, state);

    if (u.usteed) {
        if (monster === u.usteed)
            /* Your steed won't attack you */
            return true;
        /* Orcs like to steal and eat horses and the like */
        if (!random.rn2(is_orc(monster.data) ? 2 : 4)
            && m_next2u(monster, state)) {
            // C hands the attack to mattackm(mtmp, u.usteed) and, if the steed
            // survives, lets it strike back through a second mattackm(). No
            // monster-versus-monster combat is ported.
            unsupported("a monster attacking the hero's steed");
        }
    }
    return false;
}
