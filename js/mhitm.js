// Monster-versus-monster attacks.
// C ref: mhitm.c mattackm(). This port currently covers only the distant
// physical miss reached when an ordinary starting pet considers a target.

import {
    M_ATTK_MISS,
} from './const.js';
import { game } from './gstate.js';
import { distmin } from './hacklib.js';
import {
    AT_BITE,
    AT_KICK,
    AT_NONE,
    AD_PHYS,
    MS_GUARDIAN,
    MS_LEADER,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_PONY,
} from './monsters.js';
import { canSpotMonster } from './startup_a11y.js';
import { cansee } from './vision.js';
import { find_mac } from './worn.js';

const STARTING_PETS = new Set([PM_KITTEN, PM_LITTLE_DOG, PM_PONY]);
const STARTING_PET_ATTACK_TYPES = new Set([AT_NONE, AT_BITE, AT_KICK]);

function helpless(monster) {
    return Boolean(monster.msleeping) || !monster.mcanmove;
}

function refuse(rawEnv, reason) {
    if (typeof rawEnv.unsupported === 'function')
        return rawEnv.unsupported(reason);
    throw new RangeError(`mattackm requires ${reason}`);
}

function admitDistantStartingPetAttack(aggressor, defender, rawEnv) {
    if (!STARTING_PETS.has(aggressor.data?.pmidx)
        || !aggressor.mtame
        || !aggressor.mextra?.edog) {
        refuse(rawEnv, 'an ordinary starting pet aggressor');
    }
    if (aggressor.mconf)
        refuse(rawEnv, 'an unconfused starting pet aggressor');
    if (distmin(aggressor.mx, aggressor.my, defender.mx, defender.my) <= 1)
        refuse(rawEnv, 'a nonadjacent target');
    if (defender.mundetected
        || defender.minvis
        || defender.isminion
        || defender.ispriest
        || defender.isshk
        || defender.isgd
        || defender.data?.msound === MS_LEADER
        || defender.data?.msound === MS_GUARDIAN) {
        refuse(rawEnv, 'an ordinary monster target');
    }
    const attacks = aggressor.data?.mattk;
    const expectedFirst = aggressor.data.pmidx === PM_PONY
        ? AT_KICK : AT_BITE;
    if (!Array.isArray(attacks)
        || attacks.length !== 6
        || attacks[0]?.aatyp !== expectedFirst
        || attacks[0]?.adtyp !== AD_PHYS
        || attacks.some((attack) =>
            !STARTING_PET_ATTACK_TYPES.has(attack.aatyp)
                || attack.adtyp !== AD_PHYS)) {
        refuse(rawEnv, 'a distant physical miss attack array');
    }
}

// C ref: mhitm.c mattackm() (293-577). For starting kitten, little dog, and
// pony attack arrays at distance > 1, the first bite or kick continues without
// a to-hit draw. pet_ranged_attk() has aimed bhitpos at the aggressor, so every
// later slot fails mattackm()'s target-still-there check. Preserve the source
// setup writes which occur before that miss.
export function mattackm(aggressor, defender, rawEnv = {}) {
    if (!aggressor || !defender) return M_ATTK_MISS;
    if (helpless(aggressor)) return M_ATTK_MISS;

    admitDistantStartingPetAttack(aggressor, defender, rawEnv);
    const state = rawEnv.state ?? game;

    // C computes this before waking a helpless defender. It is not consumed
    // by this distant path, but retaining the read keeps the source order clear.
    find_mac(defender, state);
    if (defender.mconf || helpless(defender))
        defender.msleeping = false;

    state.gv ??= {};
    const aggressorVisible = cansee(aggressor.mx, aggressor.my, state)
        && canSpotMonster(aggressor, state);
    const defenderVisible = cansee(defender.mx, defender.my, state)
        && canSpotMonster(defender, state);
    state.gv.vis = aggressorVisible || defenderVisible;
    aggressor.mlstmv = state.moves;
    state.gs ??= {};
    state.gs.skipdrin = false;

    // Slot zero is the admitted bite or kick and reaches mhitm.c's distance
    // continue. For every later slot, m_at(bhitpos) is the aggressor rather
    // than the defender, so the source loop skips before getmattk().
    return M_ATTK_MISS;
}
