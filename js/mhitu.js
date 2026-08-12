// mhitu.js -- Monsters attacking the hero.
// C ref: mhitu.c -- mattacku(), its preamble and its u.usteed arm, and
// magic_negation().

import { PROTECTION, W_AMUL, W_ARMOR } from './const.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import { dist2 } from './hacklib.js';
import { is_minion, is_orc } from './mondata.js';
import { PM_ALIGNED_CLERIC } from './monsters.js';
import { AMULET_OF_GUARDING, getObjects } from './objects.js';

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

// C ref: mhitu.c magic_negation() (1088-1137). "armor that sufficiently covers
// the body might be able to block magic"; the answer is the magic-cancellation
// factor, 0 through 3.
//
// This covers the `mon == &gy.youmonst` half. insight.c:1800 is the only caller
// this port reaches and it passes the hero, and `is_you` is what makes C's
// `if (is_you || gotprot) continue;` end every loop iteration early. That
// leaves worn.c protects() and obj.c is_weptool() -- the whole apparatus the
// monster half needs -- unreached. uhitm.c:86 is the C caller that passes a
// monster; no ported path reaches it, so this throws instead of answering a
// cancellation factor it did not compute.
export function magic_negation(mon, state = game) {
    if (mon !== state.youmonst) {
        throw new TypeError('magic_negation() covers only the hero; the'
            + ' monster half needs worn.c protects()');
    }
    const { u } = state;
    const objects = getObjects(state);
    let mc = 0;
    let via_amul = false;
    const gotprot = Boolean(u.uprops?.[PROTECTION]?.extrinsic);

    for (let o = state.invent; o; o = o.nobj) {
        const wornmask = o.owornmask ?? 0;
        /* a_can field is only applicable for armor (which must be worn) */
        if ((wornmask & W_ARMOR) !== 0) {
            const armpro = objects[o.otyp].a_can;
            if (armpro > mc) mc = armpro;
        } else if ((wornmask & W_AMUL) !== 0) {
            // C assigns rather than accumulates, so a second worn amulet would
            // overwrite the first. Only one amulet slot exists, so the two
            // spellings cannot differ; ported as written.
            via_amul = (o.otyp === AMULET_OF_GUARDING);
        }
        /* if we've already confirmed Protection, skip additional checks */
        /* (is_you ends every iteration here, so the rest of C's loop body --
           the wearmask and protects() calls -- belongs to the monster half) */
    }

    if (gotprot) {
        /* extrinsic Protection increases mc by 1 (2 for amulet of guarding);
           multiple sources don't provide multiple increments */
        mc += via_amul ? 2 : 1;
        if (mc > 3)
            mc = 3;
    } else if (mc < 1) {
        /* intrinsic Protection is weaker (play balance; obtaining divine
           protection is too easy); it confers minimum mc 1 instead of 0 */
        if ((u.uprops?.[PROTECTION]?.intrinsic && u.ublessed > 0)
            || u.uspellprot
            /* aligned priests and angels have innate intrinsic Protection */
            // Indexed without a guard on purpose: an absent catalog would make
            // two undefineds compare equal and answer 1 where C answers 0.
            || mon.data === state.mons[PM_ALIGNED_CLERIC]
            || is_minion(mon.data))
            mc = 1;
    }
    return mc;
}
