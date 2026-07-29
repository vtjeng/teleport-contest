// Food helpers shared by object creation and eating.
// C ref: src/eat.c nonrotting_corpse(), tin_variety(), set_tin_variety().

import {
    A_STR,
    CONFLICT,
    FAINTED,
    FAINTING,
    FROMFORM,
    HEALTHY_TIN,
    HOMEMADE_TIN,
    HUNGER,
    HUNGRY,
    HALLUC,
    HALLUC_RES,
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
    NEUTRAL,
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
    PM_ELF,
    PM_LEATHER_GOLEM,
    PM_LICHEN,
    PM_LIZARD,
    PM_STALKER,
    PM_VALKYRIE,
    PM_WIZARD,
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

// C ref: eat.c hu_stat[], indexed by u.uhs and shared with botl.c and
// insight.c. Every entry is eight columns wide, so a reader that wants the
// bare word runs mungspaces() over it as insight.c does.
export const hu_stat = Object.freeze([
    'Satiated', '        ', 'Hungry  ', 'Weak    ',
    'Fainting', 'Fainted ', 'Starved ',
]);

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

function supportedIncreasingHungerTransition(oldStatus, newStatus) {
    return (oldStatus === NOT_HUNGRY && newStatus === HUNGRY)
        || (oldStatus === HUNGRY && newStatus === WEAK);
}

function requireHungerTransitionOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`gethungry transition requires ${name}`);
    return operation;
}

export class UnsupportedHungerTransitionError extends Error {
    constructor(reason) {
        super(`gethungry reached ${reason}`);
        this.name = 'UnsupportedHungerTransitionError';
        this.reason = reason;
    }
}

// Pure admission for eat.c:gethungry(). allmain.c uses this before changing
// any elapsed-turn state; gethungry() reuses the returned source inputs at its
// actual source-ordered call site.
export function preflightGetHungry(state = game, env = {}) {
    const u = state.u;
    if (!u || !Number.isSafeInteger(u.uhunger)) {
        throw new Error('gethungry requires initialized hero nutrition');
    }
    if (u.uinvulnerable || state.iflags?.debug_hunger)
        return { skipped: true };
    if (Math.trunc(state.multi ?? 0) < 0) {
        throw new UnsupportedHungerTransitionError(
            'unported unconscious or immobile state',
        );
    }

    if (typeof env.nearCapacity !== 'function') {
        throw new Error('gethungry requires nearCapacity');
    }
    const species = state.youmonst?.data;
    if (!species || !Number.isInteger(species.mflags1)) {
        throw new Error('gethungry requires initialized hero form');
    }

    if (u.uhs === FAINTED || hungerStatus(u.uhunger) !== u.uhs) {
        throw new UnsupportedHungerTransitionError(
            'unported hunger-status transition',
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
    const earliestStatus = hungerStatus(
        u.uhunger - maximumReachableLoss,
    );
    const mayReachSupportedTransition =
        supportedIncreasingHungerTransition(u.uhs, earliestStatus);
    if (u.uhs === HUNGRY && earliestStatus === WEAK
        && (!Array.isArray(u.atemp)
            || !Number.isInteger(u.atemp[A_STR])
            || !Number.isInteger(state.urole?.mnum)
            || !Number.isInteger(state.urace?.mnum))) {
        throw new Error(
            'weakness transition requires hero attributes, role, and race',
        );
    }
    const message = mayReachSupportedTransition
        ? requireHungerTransitionOperation(env, 'message')
        : null;
    const stopRunning = mayReachSupportedTransition
        ? requireHungerTransitionOperation(env, 'endRunning')
        : null;
    const statusRefresh = mayReachSupportedTransition
        ? requireHungerTransitionOperation(env, 'statusRefresh')
        : null;

    // The admitted alert-hero slice must remain within one hunger status for
    // every possible rn2(20) branch. Use only costs reachable from the current
    // form, properties, burden, and equipment so harmless low-loss ticks are
    // not rejected before their source draw. The first increasing transition
    // is fully owned, so every parity outcome around that threshold is safe.
    if (earliestStatus !== u.uhs && !mayReachSupportedTransition) {
        throw new UnsupportedHungerTransitionError(
            'unported hunger-status transition',
        );
    }

    return {
        capacity,
        conflictLoss,
        hungerLoss,
        message,
        ordinaryLoss,
        regenerationLoss,
        skipped: false,
        slowDigestion,
        statusRefresh,
        stopRunning,
    };
}

// C ref: eat.c gethungry() and its live newuhs(TRUE) consumer. This owns the
// nutrition decision for an alert hero through the source-reachable HUNGRY
// and WEAK transitions. Fainting and death remain fail-closed before any
// elapsed-turn mutation.
export async function gethungry(state = game, env = {}) {
    const plan = preflightGetHungry(state, env);
    if (plan.skipped) return 0;

    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function') {
        throw new TypeError('gethungry random injection requires rn2');
    }
    const {
        capacity,
        conflictLoss,
        hungerLoss,
        message,
        ordinaryLoss,
        regenerationLoss,
        slowDigestion,
        statusRefresh,
        stopRunning,
    } = plan;
    const { u } = state;
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
    if (nextStatus !== u.uhs
        && !supportedIncreasingHungerTransition(u.uhs, nextStatus)) {
        throw new UnsupportedHungerTransitionError(
            'unported hunger-status transition',
        );
    }
    u.uhunger = nextNutrition;
    if (nextStatus !== u.uhs) {
        let transitionMessage;
        if (nextStatus === HUNGRY) {
            transitionMessage = u.uhunger < 145
                ? 'You feel hungry.'
                : 'You are beginning to feel hungry.';
        } else {
            u.atemp[A_STR] = -1;
            const hallucinating =
                hungerPropertyActive(state, HALLUC)
                && !hungerPropertyActive(state, HALLUC_RES);
            const specialRole = state.urole.mnum === PM_WIZARD
                || state.urole.mnum === PM_VALKYRIE;
            if (hallucinating) {
                transitionMessage =
                    'The munchies are interfering with your motor '
                    + 'capabilities.';
            } else if (specialRole || state.urace.mnum === PM_ELF) {
                transitionMessage = `${
                    specialRole ? state.urole.name.m : 'Elf'
                } needs food, badly!`;
            } else {
                transitionMessage = u.uhunger < 45
                    ? 'You feel weak.'
                    : 'You are beginning to feel weak.';
            }
        }
        await message(transitionMessage, state);
        stopRunning(state);
        u.uhs = nextStatus;
        state.disp ??= {};
        state.disp.botl = true;
        await statusRefresh(state);
    }
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

// C ref: eat.c tin_variety(). `displ` means the caller is only formatting a
// name, which skips the chance that a homemade tin has gone bad, and with it
// that branch's rn2() call.
function tin_variety(obj, env, displ = false) {
    const { random, state } = env;
    let variety;
    if (obj.spe === 1) variety = SPINACH_TIN;
    else if (obj.cursed) variety = ROTTEN_TIN;
    else if (obj.spe < 0) variety = -obj.spe - 1;
    else variety = random.rn2(TIN_VARIETY_COUNT);

    if (!displ && variety === HOMEMADE_TIN && !obj.blessed && !random.rn2(7))
        variety = ROTTEN_TIN;
    if (variety === ROTTEN_TIN
        && nonrotting_corpse(obj.corpsenm, state)) {
        variety = HOMEMADE_TIN;
    }
    return variety;
}

// C ref: eat.c tin_details(). Appends the contents to a tin's name; the
// caller supplies the name xname() built so far.
export function tin_details(obj, mnum, base, env = {}) {
    const normalized = tinEnv(env);
    const variety = tin_variety(obj, normalized, true);
    if (variety === SPINACH_TIN) return `${base} of spinach`;
    if (mnum === NON_PM) return 'empty tin';

    let text;
    if ((obj.cknown || normalized.state.iflags?.override_ID) && obj.spe < 0) {
        const word = TIN_VARIETIES[variety].name;
        // C puts these two before the word "tin" and the rest after it.
        text = (variety === ROTTEN_TIN || variety === HOMEMADE_TIN)
            ? `${word} ${base} of `
            : `${base} of ${word} `;
    } else {
        text = `${base} of `;
    }
    const monster = normalized.state.mons[mnum];
    const name = monster.pmnames[NEUTRAL];
    return text + (vegetarian(monster) ? name : `${name} meat`);
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
