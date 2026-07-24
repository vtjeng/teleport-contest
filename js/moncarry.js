// Monster object-carrying capacity.
// C ref: mon.c can_carry().

import {
    LARGEST_INT,
} from './const.js';
import { game } from './gstate.js';
import { curr_mon_load, max_mon_load } from './mon.js';
import {
    nohands,
    notake,
    throws_rocks,
} from './mondata.js';
import {
    AT_ENGL,
    S_DRAGON,
    S_NYMPH,
} from './monsters.js';
import {
    BOULDER,
    COIN_CLASS,
    GEM_CLASS,
    ROCK_CLASS,
} from './objects.js';
import { rn2 } from './rng.js';
import { can_touch_safely } from './weapon.js';

// Return the maximum quantity from obj's stack that monster can pick up.
// Object weight already represents the complete stack, matching struct obj.
export function can_carry(monster, obj, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const canTouch = rawEnv.canTouchSafely ?? can_touch_safely;
    const species = monster.data;

    if (notake(species)) return 0;
    if (!canTouch(monster, obj, { ...rawEnv, state })) return 0;

    const quantity = Math.trunc(obj.quan ?? 0);
    const carriedQuantity = quantity > LARGEST_INT
        ? 20000 + random.rn2(LARGEST_INT - 20000 + 1)
        : quantity;

    if (carriedQuantity > 1) {
        let glomper = species?.mlet === S_DRAGON
            && (obj.oclass === COIN_CLASS || obj.oclass === GEM_CLASS);
        if (!glomper) {
            glomper = (species?.mattk ?? []).some(
                (attack) => attack.aatyp === AT_ENGL,
            );
        }
        if (nohands(species) && !glomper) return 1;
    }

    if (monster === state.u?.usteed) return 0;
    if (monster.isshk) return carriedQuantity;
    if (monster.mpeaceful && !monster.mtame) return 0;
    if (throws_rocks(species) && obj.otyp === BOULDER)
        return carriedQuantity;
    if (species?.mlet === S_NYMPH)
        return obj.oclass === ROCK_CLASS ? 0 : carriedQuantity;
    if (curr_mon_load(monster) + Math.trunc(obj.owt ?? 0)
        > max_mon_load(monster)) {
        return 0;
    }
    return carriedQuantity;
}
