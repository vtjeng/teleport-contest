// Food helpers shared by object creation and eating.
// C ref: src/eat.c nonrotting_corpse(), tin_variety(), set_tin_variety().

import {
    CONFLICT,
    FAINTED,
    FAINTING,
    FROMFORM,
    HEALTHY_TIN,
    HOMEMADE_TIN,
    HUNGER,
    HUNGRY,
    NOT_HUNGRY,
    PROTECTION,
    RANDOM_TIN,
    REGENERATION,
    ROTTEN_TIN,
    SATIATED,
    SLOW_DIGESTION,
    SLT_ENCUMBER,
    SPINACH_TIN,
    WEAK,
    W_ARTI,
    W_RINGL,
    W_RINGR,
    W_WEP,
} from './const.js';
import { game } from './gstate.js';
import { is_rider } from './mondata.js';
import {
    M1_CARNIVORE,
    M1_HERBIVORE,
    M1_METALLIVORE,
    NON_PM,
    NUMMONS,
    PM_ACID_BLOB,
    PM_BLACK_PUDDING,
    PM_FLESH_GOLEM,
    PM_LEATHER_GOLEM,
    PM_LICHEN,
    PM_LIZARD,
    PM_STALKER,
    S_BLOB,
    S_ELEMENTAL,
    S_FUNGUS,
    S_GHOST,
    S_GOLEM,
    S_JELLY,
    S_LIGHT,
    S_PUDDING,
    S_VORTEX,
} from './monsters.js';
import {
    FAKE_AMULET_OF_YENDOR,
    MEAT_RING,
    RIN_PROTECTION,
    RIN_SLOW_DIGESTION,
} from './objects.js';
import { rn2 } from './rng.js';

// C ref: eat.c tintxts[]. obj.spe stores the index (negated and offset), so
// table order is part of the object representation.
export const TIN_VARIETIES = Object.freeze([
    Object.freeze({ name: 'rotten', healthFood: false }),
    Object.freeze({ name: 'homemade', healthFood: true }),
    Object.freeze({ name: 'soup made from', healthFood: true }),
    Object.freeze({ name: 'french fried', healthFood: false }),
    Object.freeze({ name: 'pickled', healthFood: true }),
    Object.freeze({ name: 'boiled', healthFood: true }),
    Object.freeze({ name: 'smoked', healthFood: true }),
    Object.freeze({ name: 'dried', healthFood: true }),
    Object.freeze({ name: 'deep fried', healthFood: false }),
    Object.freeze({ name: 'szechuan', healthFood: true }),
    Object.freeze({ name: 'broiled', healthFood: false }),
    Object.freeze({ name: 'stir fried', healthFood: false }),
    Object.freeze({ name: 'sauteed', healthFood: false }),
    Object.freeze({ name: 'candied', healthFood: true }),
    Object.freeze({ name: 'pureed', healthFood: true }),
]);
const TIN_VARIETY_COUNT = TIN_VARIETIES.length;
function tinEnv(env = {}) {
    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('tin variety random injection requires rn2');
    return { state: env.state ?? game, random };
}

function ismnum(index) {
    return Number.isInteger(index) && index >= 0 && index < NUMMONS;
}

function hungerProperty(state, index) {
    return state.u?.uprops?.[index] ?? {};
}

function hungerPropertyActive(state, index) {
    const property = hungerProperty(state, index);
    return Boolean(property.intrinsic || property.extrinsic);
}

function hungerStatus(nutrition) {
    return nutrition > 1000 ? SATIATED
        : nutrition > 150 ? NOT_HUNGRY
            : nutrition > 50 ? HUNGRY
                : nutrition > 0 ? WEAK : FAINTING;
}

function ringConsumesNutrition(ring, side, state) {
    if (!ring || ring.otyp === MEAT_RING) return false;
    const definition = state.objects?.[ring.otyp];
    if (!definition) {
        throw new Error(
            `gethungry requires object data for ring ${ring.otyp}`,
        );
    }
    if (ring.spe || !definition.oc_charged) return true;
    if (ring.otyp !== RIN_PROTECTION) return false;

    const extrinsic = Math.trunc(
        hungerProperty(state, PROTECTION).extrinsic ?? 0,
    );
    if (side === W_RINGL) {
        const otherSources = extrinsic & ~W_RINGL;
        return otherSources === 0
            || (otherSources === W_RINGR
                && state.uright?.otyp === RIN_PROTECTION
                && !state.uright.spe);
    }
    return (extrinsic & ~W_RINGR) === 0;
}

function preflightNutritionRing(ring, state) {
    if (!ring || ring.otyp === MEAT_RING) return;
    if (!state.objects?.[ring.otyp]) {
        throw new Error(
            `gethungry requires object data for ring ${ring.otyp}`,
        );
    }
}

// C ref: eat.c gethungry(). This owns the complete nutrition-consumption
// decision for an alert hero. Hunger-status transitions still require their
// message, occupation, fainting, and death owners, so this first-command slice
// fails before changing nutrition when a tick would cross one of them.
export function gethungry(state = game, env = {}) {
    const u = state.u;
    if (!u || !Number.isSafeInteger(u.uhunger)) {
        throw new Error('gethungry requires initialized hero nutrition');
    }
    if (u.uinvulnerable || state.iflags?.debug_hunger) return 0;
    if (Math.trunc(state.multi ?? 0) < 0) {
        throw new Error(
            'gethungry reached unported unconscious or immobile state',
        );
    }

    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function') {
        throw new TypeError('gethungry random injection requires rn2');
    }
    if (typeof env.nearCapacity !== 'function') {
        throw new Error('gethungry requires nearCapacity');
    }
    const species = state.youmonst?.data;
    if (!species || !Number.isInteger(species.mflags1)) {
        throw new Error('gethungry requires initialized hero form');
    }

    if (u.uhs === FAINTED || hungerStatus(u.uhunger) !== u.uhs) {
        throw new Error(
            'gethungry reached unported hunger-status transition',
        );
    }
    // Either ring can be selected by rn2(20). Validate both definitions
    // before that draw so malformed admitted state cannot consume RNG.
    preflightNutritionRing(state.uleft, state);
    preflightNutritionRing(state.uright, state);

    const eatsNormally = Boolean(species.mflags1
        & (M1_CARNIVORE | M1_HERBIVORE | M1_METALLIVORE));
    const slowDigestion = hungerPropertyActive(state, SLOW_DIGESTION);
    const ordinaryLoss = eatsNormally && !slowDigestion ? 1 : 0;
    const regeneration = hungerProperty(state, REGENERATION);
    const regenerationLoss = (Math.trunc(regeneration.intrinsic ?? 0)
            & ~FROMFORM)
        || (Math.trunc(regeneration.extrinsic ?? 0) & ~(W_ARTI | W_WEP))
        ? 1 : 0;
    const capacity = env.nearCapacity(state);
    const oddLoss = ordinaryLoss + regenerationLoss
        + (capacity > SLT_ENCUMBER ? 1 : 0);
    const hungerLoss = hungerPropertyActive(state, HUNGER) ? 1 : 0;
    const conflict = hungerProperty(state, CONFLICT);
    const conflictLoss = conflict.intrinsic
        || (Math.trunc(conflict.extrinsic ?? 0) & ~W_ARTI) ? 1 : 0;
    const accessoryLoss = Math.max(
        slowDigestion
            && state.uright?.otyp !== RIN_SLOW_DIGESTION
            && state.uleft?.otyp !== RIN_SLOW_DIGESTION ? 1 : 0,
        ringConsumesNutrition(state.uleft, W_RINGL, state) ? 1 : 0,
        state.uamul && state.uamul.otyp !== FAKE_AMULET_OF_YENDOR ? 1 : 0,
        ringConsumesNutrition(state.uright, W_RINGR, state) ? 1 : 0,
        u.uhave?.amulet ? 1 : 0,
    );
    const evenLoss = ordinaryLoss + hungerLoss + conflictLoss + accessoryLoss;
    const maximumReachableLoss = Math.max(oddLoss, evenLoss);

    // The admitted alert-hero slice must remain within one hunger status for
    // every possible rn2(20) branch. Use only costs reachable from the current
    // form, properties, burden, and equipment so harmless low-loss ticks are
    // not rejected before their source draw.
    if (hungerStatus(u.uhunger - maximumReachableLoss) !== u.uhs) {
        throw new Error(
            'gethungry reached unported hunger-status transition',
        );
    }

    let nutritionLoss = ordinaryLoss;

    const accessoryTime = random.rn2(20);
    if (accessoryTime % 2) {
        nutritionLoss += regenerationLoss;
        if (capacity > SLT_ENCUMBER) nutritionLoss++;
    } else {
        nutritionLoss += hungerLoss + conflictLoss;
        switch (accessoryTime) {
        case 0:
            if (slowDigestion
                && state.uright?.otyp !== RIN_SLOW_DIGESTION
                && state.uleft?.otyp !== RIN_SLOW_DIGESTION) {
                nutritionLoss++;
            }
            break;
        case 4:
            if (ringConsumesNutrition(state.uleft, W_RINGL, state))
                nutritionLoss++;
            break;
        case 8:
            if (state.uamul
                && state.uamul.otyp !== FAKE_AMULET_OF_YENDOR) {
                nutritionLoss++;
            }
            break;
        case 12:
            if (ringConsumesNutrition(state.uright, W_RINGR, state))
                nutritionLoss++;
            break;
        case 16:
            if (u.uhave?.amulet) nutritionLoss++;
            break;
        default:
            break;
        }
    }

    const nextNutrition = u.uhunger - nutritionLoss;
    const nextStatus = hungerStatus(nextNutrition);
    if (nextStatus !== u.uhs) {
        throw new Error(
            'gethungry reached unported hunger-status transition',
        );
    }
    u.uhunger = nextNutrition;
    return nutritionLoss;
}

export function nonrotting_corpse(mnum, state = game) {
    if (!ismnum(mnum)) return false;
    return mnum === PM_LIZARD
        || mnum === PM_LICHEN
        || mnum === PM_ACID_BLOB
        || is_rider(state.mons?.[mnum]);
}

function vegan(monster) {
    return monster.mlet === S_BLOB
        || monster.mlet === S_JELLY
        || monster.mlet === S_FUNGUS
        || monster.mlet === S_VORTEX
        || monster.mlet === S_LIGHT
        || (monster.mlet === S_ELEMENTAL && monster.pmidx !== PM_STALKER)
        || (monster.mlet === S_GOLEM
            && monster.pmidx !== PM_FLESH_GOLEM
            && monster.pmidx !== PM_LEATHER_GOLEM)
        || monster.mlet === S_GHOST;
}

export function vegetarian(monster) {
    return vegan(monster)
        || (monster.mlet === S_PUDDING
            && monster.pmidx !== PM_BLACK_PUDDING);
}

function tin_variety(obj, env) {
    const { random, state } = env;
    let variety;
    if (obj.spe === 1) variety = SPINACH_TIN;
    else if (obj.cursed) variety = ROTTEN_TIN;
    else if (obj.spe < 0) variety = -obj.spe - 1;
    else variety = random.rn2(TIN_VARIETY_COUNT);

    if (variety === HOMEMADE_TIN && !obj.blessed && !random.rn2(7))
        variety = ROTTEN_TIN;
    if (variety === ROTTEN_TIN
        && nonrotting_corpse(obj.corpsenm, state)) {
        variety = HOMEMADE_TIN;
    }
    return variety;
}

export function set_tin_variety(obj, forcetype, env = {}) {
    const normalized = tinEnv(env);
    const { random, state } = normalized;
    const mnum = obj.corpsenm;
    const monster = ismnum(mnum) ? state.mons?.[mnum] : null;

    if (forcetype === SPINACH_TIN
        || (forcetype === HEALTHY_TIN
            && (mnum === NON_PM || !monster || !vegetarian(monster)))) {
        obj.corpsenm = NON_PM;
        obj.spe = 1;
        return;
    }

    let variety;
    if (forcetype === HEALTHY_TIN) {
        variety = tin_variety(obj, normalized);
        if (variety < 0 || variety >= TIN_VARIETY_COUNT)
            variety = ROTTEN_TIN;
        while ((variety === ROTTEN_TIN && !obj.cursed)
               || !TIN_VARIETIES[variety].healthFood) {
            variety = random.rn2(TIN_VARIETY_COUNT);
        }
    } else if (forcetype >= 0 && forcetype < TIN_VARIETY_COUNT) {
        variety = forcetype;
    } else if (forcetype === RANDOM_TIN) {
        variety = random.rn2(TIN_VARIETY_COUNT);
        if (variety === ROTTEN_TIN
            && nonrotting_corpse(mnum, state)) {
            variety = HOMEMADE_TIN;
        }
    } else {
        throw new RangeError(`unsupported tin variety ${forcetype}`);
    }
    obj.spe = -(variety + 1);
}
