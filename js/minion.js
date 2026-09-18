// Minion extensions.
// C ref: minion.c newemin().

import { game } from './gstate.js';
import { canSpotMonster } from './startup_a11y.js';

// C ref: minion.c monster_census() (40-57).  The census walks the live level
// chain, ignoring dead monsters and guards parked at <0,0>. A spotted census
// uses the canonical sensing predicate by default; callers can inject a
// clone-local predicate so planning never consults live display state.
export function monster_census(spotted = false, env = {}) {
    const state = env?.state ?? (env?.level ? env : game);
    const canSpot = env?.canSpotMonster ?? env?.canspotmon ?? canSpotMonster;
    let count = 0;
    for (let monster = state.level?.monlist; monster; monster = monster.nmon) {
        if ((monster.mhp ?? 0) < 1) continue;
        if (monster.isgd && monster.mx === 0) continue;
        if (spotted && !canSpot(monster, state)) continue;
        ++count;
    }
    return count;
}

// C ref: minion.c newemin(). Allocates the minion extension on a monster.
// makemon() calls this when MM_EMIN is set; clone_mon() calls it for minion
// clones. Follows the same pattern as newedog() and newepri().
export function newemin(monster) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('newemin requires a monster instance');
    monster.mextra ??= {};
    monster.mextra.emin ??= {
        parentmid: monster.m_id,
        min_align: 0,
        renegade: false,
    };
}
