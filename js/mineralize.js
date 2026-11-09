// Mineral deposits and aquatic vegetation created during level finalization.
// C ref: mklev.c water_has_kelp() and mineralize().

import {
    COLNO,
    MOAT,
    POOL,
    ROWNO,
    STONE,
    WATER,
    W_NONDIGGABLE,
    In_endgame,
    In_mines,
    In_quest,
    In_V_tower,
    Is_oracle_level,
    Is_rogue_level,
    Is_waterlevel,
} from './const.js';
import { depth, In_hell, Is_special } from './dungeon.js';
import { game } from './gstate.js';
import { add_to_buried } from './invent.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    dealloc_obj,
    mkobj,
    mksobj,
    mksobj_at,
    place_object,
    weight,
} from './obj.js';
import {
    GEM_CLASS,
    GOLD_PIECE,
    KELP_FROND,
    ROCK,
} from './objects.js';
import { coreRandom } from './rng.js';

// C reads the current level from u.uz and the topology globals that
// init_dungeons() sets; every caller runs after both, so these read them
// directly.
function waterHasKelp(x, y, kelpPool, kelpMoat, env) {
    const location = env.state.level.at(x, y);
    return Boolean(
        (kelpPool
            && (location.typ === POOL
                || (location.typ === WATER
                    && !Is_waterlevel(env.state.u.uz, env.state)))
            && !env.random.rn2(kelpPool))
        || (kelpMoat
            && location.typ === MOAT
            && !env.random.rn2(kelpMoat)),
    );
}

function mineralizeEnv(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? coreRandom;
    for (const name of ['rn2', 'rnd', 'rn1', 'rne']) {
        if (typeof random[name] !== 'function') {
            throw new TypeError(
                `mineralize random injection requires ${name}()`,
            );
        }
    }
    return objectGenerationEnv({ ...rawEnv, state, random });
}

// C ref: mklev.c water_has_kelp(). The exported form is useful to special
// level generation, which supplies explicit kelp divisors.
export function water_has_kelp(
    x,
    y,
    kelpPool,
    kelpMoat,
    rawEnv = {},
) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? coreRandom;
    if (typeof random.rn2 !== 'function') {
        throw new TypeError(
            'water_has_kelp random injection requires rn2()',
        );
    }
    return waterHasKelp(x, y, kelpPool, kelpMoat, { state, random });
}

// C ref: mklev.c mineralize(). x is the outer loop in both scans; the y
// increments inside the stone scan deliberately skip candidates which cannot
// have the required three-row stone neighborhood.
export function mineralize(
    kelpPool = -1,
    kelpMoat = -1,
    goldprob = -1,
    gemprob = -1,
    skipLevelChecks = false,
    rawEnv = {},
) {
    const env = mineralizeEnv(rawEnv);
    const { random, state } = env;
    const current = state.u.uz;
    let sp;

    if (kelpPool < 0) kelpPool = 10;
    if (kelpMoat < 0) kelpMoat = 30;

    if (!skipLevelChecks && In_endgame(current, state)) return;
    for (let x = 2; x < COLNO - 2; ++x) {
        for (let y = 1; y < ROWNO - 1; ++y) {
            if (waterHasKelp(x, y, kelpPool, kelpMoat, env)) {
                mksobj_at(KELP_FROND, x, y, true, false, env);
            }
        }
    }

    if (!skipLevelChecks
        && (In_hell(current, state) || In_V_tower(current, state)
            || Is_rogue_level(current, state)
            || state.level.flags.arboreal
            || ((sp = Is_special(current, state)) !== null
                && !Is_oracle_level(current, state)
                && (!In_mines(current, state) || sp.flags.town))))
        return;

    if (goldprob < 0)
        goldprob = 20 + Math.trunc(depth(current, state) / 3);
    if (gemprob < 0)
        gemprob = Math.trunc(goldprob / 4);

    if (!skipLevelChecks) {
        if (In_mines(current, state)) {
            goldprob *= 2;
            gemprob *= 3;
        } else if (In_quest(current, state)) {
            goldprob = Math.trunc(goldprob / 4);
            gemprob = Math.trunc(gemprob / 6);
        }
    }

    const at = (x, y) => state.level.at(x, y);
    for (let x = 2; x < COLNO - 2; ++x) {
        for (let y = 1; y < ROWNO - 1; ++y) {
            if (at(x, y + 1).typ !== STONE) {
                y += 2;
            } else if (at(x, y).typ !== STONE) {
                y += 1;
            } else if (!(at(x, y).flags & W_NONDIGGABLE)
                       && at(x, y - 1).typ === STONE
                       && at(x + 1, y - 1).typ === STONE
                       && at(x - 1, y - 1).typ === STONE
                       && at(x + 1, y).typ === STONE
                       && at(x - 1, y).typ === STONE
                       && at(x + 1, y + 1).typ === STONE
                       && at(x - 1, y + 1).typ === STONE) {
                if (random.rn2(1000) < goldprob) {
                    const gold = mksobj(GOLD_PIECE, false, false, env);
                    gold.ox = x;
                    gold.oy = y;
                    gold.quan = 1 + random.rnd(goldprob * 3);
                    gold.owt = weight(gold, env);
                    if (!random.rn2(3)) add_to_buried(gold, env);
                    else place_object(gold, x, y, env);
                }
                if (random.rn2(1000) < gemprob) {
                    for (let count = random.rnd(
                        2 + Math.trunc(current.dlevel / 3),
                    ); count > 0; --count) {
                        const gem = mkobj(GEM_CLASS, false, env);
                        if (gem.otyp === ROCK) {
                            dealloc_obj(gem, env);
                        } else {
                            gem.ox = x;
                            gem.oy = y;
                            if (!random.rn2(3)) add_to_buried(gem, env);
                            else place_object(gem, x, y, env);
                        }
                    }
                }
            }
        }
    }
}
