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
} from './const.js';
import { depth, on_level } from './dungeon.js';
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
import { rn1, rn2, rnd, rne, rnz } from './rng.js';

const SOURCE_RANDOM = Object.freeze({ rn1, rn2, rnd, rne, rnz });

export class UnsupportedMineralizeContextError extends Error {
    constructor(detail) {
        super(`mineralize requires ${detail}`);
        this.name = 'UnsupportedMineralizeContextError';
        this.detail = detail;
    }
}

function requireInteger(value, detail) {
    if (!Number.isInteger(value))
        throw new UnsupportedMineralizeContextError(detail);
    return value;
}

function currentLevel(state) {
    const level = state.u?.uz;
    requireInteger(level?.dnum, 'an initialized current dungeon number');
    requireInteger(level?.dlevel, 'an initialized current level number');
    return level;
}

function topologyLevel(state, name) {
    const level = state[name];
    requireInteger(level?.dnum, `initialized ${name}`);
    requireInteger(level?.dlevel, `initialized ${name}`);
    return level;
}

function dungeonNumber(state, name) {
    return requireInteger(state[name], `initialized ${name}`);
}

function locationAt(state, x, y) {
    const location = state.level?.at?.(x, y);
    if (!location)
        throw new UnsupportedMineralizeContextError('an initialized level map');
    return location;
}

function levelAssigned(level) {
    return Boolean(level.dnum || level.dlevel);
}

function isTopologyLevel(state, name) {
    const target = topologyLevel(state, name);
    return levelAssigned(target) && on_level(currentLevel(state), target);
}

function inEndgame(state) {
    // In_endgame() compares dungeon numbers rather than a full d_level.
    return currentLevel(state).dnum
        === topologyLevel(state, 'astral_level').dnum;
}

function inHell(state) {
    const current = currentLevel(state);
    const dungeon = state.dungeons?.[current.dnum];
    if (!dungeon?.flags
        || typeof dungeon.flags.hellish !== 'boolean') {
        throw new UnsupportedMineralizeContextError(
            'the current dungeon hellish flag',
        );
    }
    return dungeon.flags.hellish;
}

function arborealLevel(state) {
    const value = state.level?.flags?.arboreal;
    if (typeof value !== 'boolean') {
        throw new UnsupportedMineralizeContextError(
            'the current level arboreal flag',
        );
    }
    return value;
}

function currentSpecialLevel(state) {
    if (!Array.isArray(state.specialLevels)) {
        throw new UnsupportedMineralizeContextError(
            'the initialized special-level chain',
        );
    }
    const current = currentLevel(state);
    return state.specialLevels.find(
        (candidate) => on_level(current, candidate?.dlevel),
    ) ?? null;
}

function excludedSpecialLevel(state) {
    const special = currentSpecialLevel(state);
    if (!special || isTopologyLevel(state, 'oracle_level')) return false;
    if (typeof special.flags?.town !== 'boolean') {
        throw new UnsupportedMineralizeContextError(
            'the current special level town flag',
        );
    }
    return currentLevel(state).dnum !== dungeonNumber(state, 'mines_dnum')
        || special.flags.town;
}

function mineralizeEnv(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? SOURCE_RANDOM;
    for (const name of ['rn2', 'rnd', 'rn1', 'rne']) {
        if (typeof random[name] !== 'function') {
            throw new TypeError(
                `mineralize random injection requires ${name}()`,
            );
        }
    }
    currentLevel(state);
    return objectGenerationEnv({ ...rawEnv, state, random });
}

function waterHasKelp(x, y, kelpPool, kelpMoat, env) {
    const location = locationAt(env.state, x, y);
    return Boolean(
        (kelpPool
            && (location.typ === POOL
                || (location.typ === WATER
                    && !isTopologyLevel(env.state, 'water_level')))
            && !env.random.rn2(kelpPool))
        || (kelpMoat
            && location.typ === MOAT
            && !env.random.rn2(kelpMoat)),
    );
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
    const random = rawEnv.random ?? SOURCE_RANDOM;
    if (typeof random.rn2 !== 'function') {
        throw new TypeError(
            'water_has_kelp random injection requires rn2()',
        );
    }
    currentLevel(state);
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
    const current = currentLevel(state);

    if (kelpPool < 0) kelpPool = 10;
    if (kelpMoat < 0) kelpMoat = 30;

    if (!skipLevelChecks && inEndgame(state)) return;
    for (let x = 2; x < COLNO - 2; ++x) {
        for (let y = 1; y < ROWNO - 1; ++y) {
            if (waterHasKelp(x, y, kelpPool, kelpMoat, env)) {
                mksobj_at(KELP_FROND, x, y, true, false, env);
            }
        }
    }

    if (!skipLevelChecks
        && (inHell(state)
            || current.dnum === dungeonNumber(state, 'tower_dnum')
            || isTopologyLevel(state, 'rogue_level')
            || arborealLevel(state)
            || excludedSpecialLevel(state))) {
        return;
    }

    if (goldprob < 0)
        goldprob = 20 + Math.trunc(depth(current, state) / 3);
    if (gemprob < 0)
        gemprob = Math.trunc(goldprob / 4);

    if (!skipLevelChecks) {
        if (current.dnum === dungeonNumber(state, 'mines_dnum')) {
            goldprob *= 2;
            gemprob *= 3;
        } else if (current.dnum === dungeonNumber(state, 'quest_dnum')) {
            goldprob = Math.trunc(goldprob / 4);
            gemprob = Math.trunc(gemprob / 6);
        }
    }

    for (let x = 2; x < COLNO - 2; ++x) {
        for (let y = 1; y < ROWNO - 1; ++y) {
            if (locationAt(state, x, y + 1).typ !== STONE) {
                y += 2;
            } else if (locationAt(state, x, y).typ !== STONE) {
                y += 1;
            } else if (!(locationAt(state, x, y).wall_info & W_NONDIGGABLE)
                       && locationAt(state, x, y - 1).typ === STONE
                       && locationAt(state, x + 1, y - 1).typ === STONE
                       && locationAt(state, x - 1, y - 1).typ === STONE
                       && locationAt(state, x + 1, y).typ === STONE
                       && locationAt(state, x - 1, y).typ === STONE
                       && locationAt(state, x + 1, y + 1).typ === STONE
                       && locationAt(state, x - 1, y + 1).typ === STONE) {
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
