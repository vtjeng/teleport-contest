// The #eat command, the hunger clock, and the food helpers that object
// creation and naming share.
// C refs: src/eat.c is_edible(), gethungry(), newuhs(), nonrotting_corpse(),
//         vegan(), vegetarian(), tin_variety(), set_tin_variety(),
//         tin_details(), eat_ok(), floorfood(), and doeat().

import {
    A_STR,
    CONFLICT,
    COST_BITE,
    ECMD_OK,
    ECMD_TIME,
    FAINTED,
    FAINTING,
    FROMFORM,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_NONINVENT,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    HEALTHY_TIN,
    HOMEMADE_TIN,
    HUNGER,
    HUNGRY,
    HALLUC,
    HALLUC_RES,
    NOT_HUNGRY,
    OBJ_INVENT,
    PROTECTION,
    RANDOM_TIN,
    REGENERATION,
    ROTTEN_TIN,
    SATIATED,
    SICK,
    SLEEP_RES,
    SLOW_DIGESTION,
    SLT_ENCUMBER,
    SPINACH_TIN,
    STRANGLED,
    Upolyd,
    VOMITING,
    WEAK,
    W_AMUL,
    W_ARMOR,
    W_ARTI,
    W_RINGL,
    W_RINGR,
    W_SADDLE,
    W_TOOL,
    W_WEP,
    NEUTRAL,
} from './const.js';
import { can_reach_floor } from './engrave.js';
import { game } from './gstate.js';
import { check_capacity, endRunning, inv_cnt, rounddiv } from './hack.js';
import {
    INVLET_BASIC,
    addinv_nomerge,
    freeinv,
    getobj,
    useup,
} from './invent.js';
import { is_rider, is_were, metallivorous } from './mondata.js';
import {
    M1_CARNIVORE,
    M1_HERBIVORE,
    M1_METALLIVORE,
    NON_PM,
    NUMMONS,
    PM_ACID_BLOB,
    PM_BLACK_PUDDING,
    PM_DWARF,
    PM_FLESH_GOLEM,
    PM_ELF,
    PM_LEATHER_GOLEM,
    PM_LICHEN,
    PM_LIZARD,
    PM_ORC,
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
import { costly_alteration, objectType, splitobj, weight } from './obj.js';
import { singular, xnameFresh } from './objnam.js';
import {
    APPLE,
    CANDY_BAR,
    CARROT,
    CLOVE_OF_GARLIC,
    COIN_CLASS,
    CORPSE,
    CRAM_RATION,
    CREAM_PIE,
    C_RATION,
    EGG,
    ENORMOUS_MEATBALL,
    EUCALYPTUS_LEAF,
    FAKE_AMULET_OF_YENDOR,
    FLESH,
    FOOD_CLASS,
    FOOD_RATION,
    FORTUNE_COOKIE,
    K_RATION,
    LEMBAS_WAFER,
    LUMP_OF_ROYAL_JELLY,
    MEATBALL,
    MEAT_RING,
    MEAT_STICK,
    PANCAKE,
    PEAR,
    RIN_PROTECTION,
    RIN_SLOW_DIGESTION,
    SLIME_MOLD,
    SPRIG_OF_WOLFSBANE,
    TIN,
    TRIPE_RATION,
} from './objects.js';
import { rn2 } from './rng.js';
import { is_pool_or_lava } from './trap.js';
import { ttyPline } from './tty_message.js';

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

// The `(HFoo || EFoo)` shape, and only that shape. youprop.h spells
// Sleep_resistance (36), Hunger (147), Slow_digestion (291) and
// Halluc_resistance (119) this way; the maladies at :108-113 and
// Hallucination's own positive term at :116 are the bare intrinsic, so they
// read hungerProperty().intrinsic instead.
//
// youprop.h:218 spells Conflict this way too, but gethungry() must not read it
// through this helper: eat.c:3202-3203 tests `HConflict || (EConflict &
// (~W_ARTI))` rather than the macro, so an artifact is the one conflict source
// that costs no nutrition. That masked test stays spelled out below.
function propertyActive(state, index) {
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

// Which statuses newuhs() can be asked to move to. It carries the whole of
// eat.c newuhs() (3361-3513) except the FAINTING arm, which needs
// is_fainted(), stop_occupation(), incr_itimeout(HDeaf), nomul() with
// afternmv, selftouch(), done(STARVING) and the rn2(20 - uhunger/10) draw that
// picks between fainting and starving. hungerStatus() answers only the five
// values below FAINTED, so FAINTED and STARVED cannot arrive here.
function supportedHungerTransition(newStatus) {
    return newStatus !== FAINTING;
}

function requireHungerTransitionOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`newuhs() transition requires ${name}`);
    return operation;
}

// Raised by gethungry()'s preflight and by newuhs() itself. newuhs() is shared:
// gethungry() calls it from the turn loop, and done_eating() and lesshungry()
// call it from doeat(), so this class reaches the caller down both paths and
// js/allmain.js and js/cmd.js each convert it at their own seam.
export class UnsupportedHungerTransitionError extends Error {
    constructor(reason) {
        super(`the hunger clock reached ${reason}`);
        this.name = 'UnsupportedHungerTransitionError';
        this.reason = reason;
    }
}

// Thrown where eat.c doeat() or floorfood() reaches an arm this port has not
// implemented. Every stop names the C function or hero state that is missing.
export class UnsupportedEatError extends Error {
    constructor(reason) {
        super(`eating requires ${reason}`);
        this.name = 'UnsupportedEatError';
        this.reason = reason;
    }
}

// C ref: eat.c is_edible() (88-121). Answers whether the possibly polymorphed
// hero can eat this object.
//
// Four of C's five tests read the hero's current form: the fire elemental's
// is_flammable() arm, the metallivore's is_metallic()/is_rustprone() arm, the
// ghoul's corpse-and-egg arm and the gelatinous cube's is_organic() arm. Only
// a polymorphed hero can take any of them -- u_init.c sets u.umonnum to the
// role's mnum and polyself.c, the one writer that changes it, is unported --
// so the port stops for a polymorphed hero rather than carry four arms and the
// four objclass.h material predicates they need, none of which any case can
// reach. oc_unique and the FOOD_CLASS answer apply to every hero and are here.
export function is_edible(obj, state = game) {
    /* protect invocation tools but not Rider corpses (handled elsewhere) */
    if (objectType(obj, state).oc_unique) return false;
    /* above also prevents the Amulet from being eaten, so we must never
       allow fake amulets to be eaten either [which is already the case] */

    if (Upolyd(state.u))
        throw new UnsupportedEatError('is_edible() for a polymorphed hero');

    return obj.oclass === FOOD_CLASS;
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
    const slowDigestion = propertyActive(state, SLOW_DIGESTION);
    const ordinaryLoss = eatsNormally && !slowDigestion ? 1 : 0;
    const regeneration = hungerProperty(state, REGENERATION);
    const regenerationLoss = (Math.trunc(regeneration.intrinsic ?? 0)
            & ~FROMFORM)
        || (Math.trunc(regeneration.extrinsic ?? 0) & ~(W_ARTI | W_WEP))
        ? 1 : 0;
    const capacity = env.nearCapacity(state);
    const oddLoss = ordinaryLoss + regenerationLoss
        + (capacity > SLT_ENCUMBER ? 1 : 0);
    const hungerLoss = propertyActive(state, HUNGER) ? 1 : 0;
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
    const mayChangeStatus = earliestStatus !== u.uhs;
    const supported = supportedHungerTransition(earliestStatus);
    // newuhs()'s `newhs >= WEAK && u.uhs < WEAK` arm writes ATEMP(A_STR), and
    // its WEAK message reads the role and the race. Widening `<` to `<=` here
    // is equivalent for every well-formed state: it only adds the case where
    // the status does not move, and this guard rejects malformed input rather
    // than deciding any game behavior.
    if (earliestStatus === WEAK && u.uhs < WEAK
        && (!Array.isArray(u.atemp)
            || !Number.isInteger(u.atemp[A_STR])
            || !Number.isInteger(state.urole?.mnum)
            || !Number.isInteger(state.urace?.mnum))) {
        throw new Error(
            'weakness transition requires hero attributes, role, and race',
        );
    }
    // newuhs() resolves these at its own call sites; resolving them here as
    // well rejects a caller that cannot supply them before the rn2(20) draw
    // that decides whether the transition happens. Every transition newuhs()
    // takes rewrites the status line; only its HUNGRY and WEAK arms print a
    // message and end a run.
    if (mayChangeStatus && supported) {
        requireHungerTransitionOperation(env, 'statusRefresh');
        if (earliestStatus === HUNGRY || earliestStatus === WEAK) {
            requireHungerTransitionOperation(env, 'message');
            requireHungerTransitionOperation(env, 'endRunning');
        }
    }

    // Use only costs reachable from the current form, properties, burden, and
    // equipment so harmless low-loss ticks are not rejected before their
    // source draw. gethungry() only spends nutrition, so every status the
    // rn2(20) branches can land on lies between u.uhs and earliestStatus, and
    // newuhs() owns all of them unless the worst case is FAINTING.
    if (mayChangeStatus && !supported) {
        throw new UnsupportedHungerTransitionError(
            'unported hunger-status transition',
        );
    }

    return {
        capacity,
        conflictLoss,
        hungerLoss,
        ordinaryLoss,
        regenerationLoss,
        skipped: false,
        slowDigestion,
    };
}

// C ref: eat.c gethungry() and its live newuhs(TRUE) consumer. This owns the
// nutrition decision for an alert hero down to the WEAK status. Fainting and
// death remain fail-closed before any elapsed-turn mutation.
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
        ordinaryLoss,
        regenerationLoss,
        slowDigestion,
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
    if (nextStatus !== u.uhs && !supportedHungerTransition(nextStatus)) {
        throw new UnsupportedHungerTransitionError(
            'unported hunger-status transition',
        );
    }
    u.uhunger = nextNutrition;
    await newuhs(true, state, env);
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

// ---------------------------------------------------------------------------
// The meal in progress.
// ---------------------------------------------------------------------------

// C ref: obj.h carried(). eat.c asks it four times to pick between the
// inventory and the floor half of an operation.
function carried(obj) {
    return obj.where === OBJ_INVENT;
}

// C ref: youprop.h Hallucination (120). Its positive term is HHallucination
// (116), the intrinsic alone -- "Hallucination is solely a timeout" (115) --
// while Halluc_resistance (119) is the intrinsic or the extrinsic.
function Hallucination(state) {
    return Boolean(hungerProperty(state, HALLUC).intrinsic)
        && !propertyActive(state, HALLUC_RES);
}

// C ref: eat.c nonrotting_food() (64-66). Fortune cookies are handled by the
// separate otyp test beside this macro's only call site.
export function nonrotting_food(otyp) {
    return otyp === LEMBAS_WAFER || otyp === CRAM_RATION;
}

// C ref: context.h struct victual_info (59-76) and eat.c's file-scope
// `zero_victual` (75). One meal's whole state lives here, at
// state.context.victual, beside the rest of the flattened svc.context:
//
//   * doeat() writes piece, o_id and usedtime when it has a food to eat, and
//     reqtime, nmod and canchoke once it knows how long the meal takes;
//   * start_eating() writes fullwarn, eating and doreset;
//   * bite() lowers reqtime through consume_oeaten() when the food runs out;
//   * done_eating() returns every field to zero after the last bite, and
//     food_disappears() does the same when the object is deleted from under
//     an unfinished meal.
//
// Nothing else writes it. C zeroes the whole of svc.context at startup; this
// port builds state.context field by field, as js/obj.js clear_splitobjs()
// already does for context.objsplit, so state.context.victual appears when
// doeat() first needs it. Until then there is no meal, and food_disappears()
// -- the one reader that can run before any meal -- reads the absent field as
// the zeroed struct it stands for rather than creating one.
export function zero_victual() {
    return {
        piece: null,
        o_id: 0,
        usedtime: 0,
        reqtime: 0,
        nmod: 0,
        canchoke: 0,
        fullwarn: 0,
        eating: 0,
        doreset: 0,
    };
}

function victual(state) {
    state.context ??= {};
    state.context.victual ??= zero_victual();
    return state.context.victual;
}

// C ref: eat.c obj_nutrition() (322-334).
export function obj_nutrition(otmp, state = game) {
    if (otmp.otyp === CORPSE)
        return Math.trunc(state.mons[otmp.corpsenm].cnutrit);
    if (otmp.globby) return Math.trunc(otmp.owt);
    return Math.trunc(objectType(otmp, state).oc_nutrition);
}

// C ref: eat.c eaten_stat() (3786-3805). Scales a whole food's weight or price
// down to the fraction that is left. mkobj.c weight() is the caller, and
// reaches it through the object env's eatenStat seam.
export function eaten_stat(base, obj, env = {}) {
    const state = env.state ?? game;
    const full_amount = obj_nutrition(obj, state);
    const uneaten_amt = Math.trunc(obj.oeaten);
    if (uneaten_amt > full_amount) {
        // C's impossible() clamps and carries on; reaching it means this port
        // has let oeaten outgrow the food, which is a defect rather than an
        // unported branch.
        throw new Error(
            `partly eaten food (${uneaten_amt}) more nutritious than `
            + `untouched food (${full_amount})`,
        );
    }
    const scaled = full_amount
        ? Math.trunc(base * uneaten_amt / full_amount)
        : 0;
    return scaled < 1 ? 1 : scaled;
}

// C ref: eat.c adj_victual_nutrition() (336-357). The nutrition one bite is
// worth, which two races read differently for the two foods they were made
// for. Only start_eating() and bite() call it, and only with nmod negative.
//
// C's maybe_polyd(is_elf(gy.youmonst.data), Race_if(PM_ELF)) reduces to the
// race test while the hero is not polymorphed, which is_edible() has already
// established by the time any of this runs.
export function adj_victual_nutrition(state) {
    const otyp = victual(state).piece.otyp;
    let nut = -victual(state).nmod; /* convert 'nmod' to positive */
    if (nut <= 0)
        throw new Error('adj_victual_nutrition requires a negative nmod');
    if (otyp === LEMBAS_WAFER) {
        if (state.urace.mnum === PM_ELF)
            nut += Math.trunc((nut + 2) / 4); /* 800 -> 1000 */
        else if (state.urace.mnum === PM_ORC)
            nut -= Math.trunc((nut + 2) / 4); /* 800 -> 600 */
    } else if (otyp === CRAM_RATION) {
        if (state.urace.mnum === PM_DWARF)
            nut += Math.trunc((nut + 3) / 6); /* 600 -> 700 */
    }
    return Math.max(nut, 1);
}

// C ref: eat.c touchfood() (359-393). Splits one item off the stack, marks it
// partly eaten, and puts it back in inventory under its own letter so the rest
// of the stack stays untouched.
function touchfood(otmp, env) {
    const { state } = env;
    if (otmp.quan > 1) {
        // Only the inventory arm is reachable: floorfood() stops before it can
        // offer a floor object, so carried() is always true here.
        if (!carried(otmp)) {
            throw new UnsupportedEatError(
                'touchfood() splitting a stack on the floor',
            );
        }
        otmp = splitobj(otmp, 1, env);
    }

    if (!otmp.oeaten) {
        costly_alteration(otmp, COST_BITE, env);
        otmp.oeaten = obj_nutrition(otmp, state);
    }

    if (carried(otmp)) {
        freeinv(otmp, env);
        if (inv_cnt(false, state) >= INVLET_BASIC) {
            // A full pack drops the bite on the floor instead, through
            // sellobj_state() and dropy(); neither is ported, and the object
            // has already left inventory by now.
            throw new UnsupportedEatError(
                'touchfood() dropping a bite from a full pack',
            );
        }
        otmp = addinv_nomerge(otmp, env);
    }
    return otmp;
}

// C ref: eat.c food_disappears() (394-402). js/invent.js obfree() is its only
// caller and keeps the obj_stop_timers() half, where the timer hook resolves.
export function food_disappears(obj, state = game) {
    if (obj === state.context?.victual?.piece)
        state.context.victual = zero_victual();
}

// C ref: eat.c recalc_wt() (291-306).
function recalc_wt(env) {
    const piece = victual(env.state).piece;
    if (!piece) throw new Error('recalc_wt without piece');
    piece.owt = weight(piece, env);
}

// C ref: eat.c consume_oeaten() (3806-3872). Lowers how much of the food is
// left, and never all the way to zero: an oeaten of 0 would restore the object
// to untouched, so the last bite leaves 1 and shortens the meal instead.
export function consume_oeaten(obj, amt, state = game) {
    if (!obj_nutrition(obj, state)) {
        // C's impossible(); a zero-nutrition food never reaches a bite here.
        throw new Error(
            `oeaten: attempting to set 0 nutrition food (${obj.otyp}) `
            + 'partially eaten',
        );
    }

    if (amt > 0) {
        /* bit shift to divide the remaining amount of food */
        obj.oeaten = Math.trunc(obj.oeaten) >>> amt;
    } else {
        /* simple decrement; value is negative so we actually add it */
        if (Math.trunc(obj.oeaten) > -amt) obj.oeaten += amt;
        else obj.oeaten = 0;
    }

    if (obj.oeaten === 0) {
        const meal = victual(state);
        if (obj === meal.piece) /* always true unless wishing */
            meal.reqtime = meal.usedtime;
        obj.oeaten = 1; /* smallest possible positive value */
    }
}

// C ref: eat.c newuhs() (3361-3510). Recomputes the hunger status from the
// hero's nutrition and comments on it.
//
// Two hunger statuses are in play while a meal runs, which is what C's
// `static save_hs` and `saved_hs` are for: bite() raises force_save_hs so each
// mouthful updates u.uhs silently, and the first call after the meal restores
// the status the hero started it with, so the message describes the whole meal
// rather than one bite. C keeps the pair in function statics; this port keeps
// them on the game state, so a new game starts with neither set.
//
// `env` supplies message(), endRunning() and statusRefresh(), because the
// elapsed-turn caller substitutes silent versions of all three when it is
// dry-running a turn on a cloned state.
export async function newuhs(incr, state = game, env = {}) {
    const u = state.u;
    let newhs = hungerStatus(u.uhunger);

    // C ref: `if (go.occupation == eatfood || gf.force_save_hs)`. This port has
    // no occupation, so only bite() can take this arm; slice 3's multi-turn
    // occupation is what adds the other half.
    if (state.force_save_hs) {
        if (!state.saved_hs) {
            state.save_hs = u.uhs;
            state.saved_hs = true;
        }
        u.uhs = newhs;
        return;
    }
    if (state.saved_hs) {
        u.uhs = state.save_hs;
        state.saved_hs = false;
    }

    if (newhs === FAINTING) {
        // The fainting and starvation arms need is_fainted(), stop_occupation(),
        // incr_itimeout(HDeaf), nomul() with afternmv, selftouch() and
        // done(STARVING), and the rn2(20 - uhunger/10) draw that picks between
        // them.
        throw new UnsupportedHungerTransitionError(
            'newuhs() fainting or starvation',
        );
    }

    if (newhs !== u.uhs) {
        if (newhs >= WEAK && u.uhs < WEAK) {
            /* temporary loss overrides Fixed_abil */
            u.atemp[A_STR] = -1;
        } else if (newhs < WEAK && u.uhs >= WEAK) {
            /* repair of loss also overrides Fixed_abil */
            u.atemp[A_STR] = 0;
        }

        if (newhs === HUNGRY || newhs === WEAK) {
            const message = requireHungerTransitionOperation(env, 'message');
            const stopRunning = requireHungerTransitionOperation(
                env,
                'endRunning',
            );
            await message(hungerTransitionMessage(newhs, incr, state), state);
            // C ref: `if (incr && go.occupation && ...) stop_occupation();`.
            // No ported occupation can be running here.
            stopRunning(state);
        }
        u.uhs = newhs;
        state.disp ??= {};
        state.disp.botl = true;
        await requireHungerTransitionOperation(env, 'statusRefresh')(state);
        if (u.uhp < 1) {
            // C prints "You die from hunger and exhaustion." and calls
            // done(STARVING).
            throw new UnsupportedHungerTransitionError(
                'newuhs() death from hunger and exhaustion',
            );
        }
    }
}

// C ref: the HUNGRY and WEAK arms of newuhs()'s switch (3468-3496).
function hungerTransitionMessage(newhs, incr, state) {
    const u = state.u;
    const hallucinating = Hallucination(state);
    if (newhs === HUNGRY) {
        if (hallucinating) {
            return incr
                ? 'You are getting the munchies.'
                : 'You now have a lesser case of the munchies.';
        }
        return !incr ? 'You only feel hungry now.'
            : u.uhunger < 145 ? 'You feel hungry.'
                : 'You are beginning to feel hungry.';
    }
    if (hallucinating) {
        return incr
            ? 'The munchies are interfering with your motor capabilities.'
            : 'You still have the munchies.';
    }
    const specialRole = state.urole.mnum === PM_WIZARD
        || state.urole.mnum === PM_VALKYRIE;
    if (incr && (specialRole || state.urace.mnum === PM_ELF)) {
        return `${specialRole ? state.urole.name.m : 'Elf'} `
            + 'needs food, badly!';
    }
    return !incr ? 'You are still weak.'
        : u.uhunger < 45 ? 'You feel weak.'
            : 'You are beginning to feel weak.';
}

// C ref: eat.c lesshungry() (3287-3334). Adds a bite's nutrition and lets
// newuhs() comment on the result.
export async function lesshungry(num, state, env) {
    const u = state.u;
    const meal = victual(state);
    /* See comments in newuhs() for discussion on force_save_hs */
    // C ref: `(go.occupation == eatfood) || gf.force_save_hs`; only the second
    // term exists in this port.
    const iseating = Boolean(state.force_save_hs);

    u.uhunger += num;
    if (u.uhunger >= 2000) {
        if (!iseating || meal.canchoke) {
            throw new UnsupportedEatError(
                'lesshungry() choking on an overfull stomach',
            );
        }
    } else if (u.uhunger >= 1500
        && !propertyActive(state, HUNGER)
        // C spells this `!eating || (eating && !fullwarn)`.
        && (!meal.eating || !meal.fullwarn)) {
        // "You're having a hard time getting all of it down." sets
        // gn.nomovemsg, and either gm.multi or fullwarn plus a
        // paranoid_query(); none of the three has a port.
        throw new UnsupportedEatError(
            "lesshungry()'s nearly-full warning",
        );
    }
    await newuhs(false, state, env);
}

// C ref: eat.c bite() (3126-3161). One turn's worth of the meal: the nutrition
// it pays out, the food it uses up, and the weight that leaves. Returns 1 when
// the hero choked and survived, which no ported arm can answer yet.
async function bite(state, env) {
    const meal = victual(state);

    if (meal.canchoke && state.u.uhunger >= 2000) {
        // choke() prints, may kill through done(CHOKING), and is the only
        // producer of bite()'s nonzero result.
        throw new UnsupportedEatError('choke()');
    }
    if (meal.doreset) {
        // Only reset_eat() sets doreset, and nothing ported calls it; it is
        // the multi-turn interruption slice 3 owns.
        throw new UnsupportedEatError('do_reset_eat()');
    }
    state.force_save_hs = true;
    if (meal.nmod < 0) {
        await lesshungry(adj_victual_nutrition(state), state, env);
        consume_oeaten(meal.piece, meal.nmod, state); /* -= -nmod */
    } else if (meal.nmod > 0 && (meal.usedtime % meal.nmod)) {
        await lesshungry(1, state, env);
        consume_oeaten(meal.piece, -1, state); /* -= 1 */
    }
    state.force_save_hs = false;
    recalc_wt(env);
    return 0;
}

// C ref: eat.c fpostfx() (2508-2597), the effects that follow a finished
// non-corpse meal. Every arm whose effect is unported stops rather than
// silently skipping, because each one changes hero state.
async function fpostfx(otmp, state, env) {
    switch (otmp.otyp) {
    case SPRIG_OF_WOLFSBANE:
        if (ismnum(state.u.ulycn) || is_were(state.youmonst.data))
            throw new UnsupportedEatError('you_unwere()');
        break;
    case CARROT:
        // make_blinded(u.ucreamed, TRUE) clears cream from the hero's face and
        // repairs vision; neither make_blinded() nor u.ucreamed is ported.
        throw new UnsupportedEatError('make_blinded() for a carrot');
    case FORTUNE_COOKIE:
        // outrumor() reads dat/rumors and sets the literate conduct.
        throw new UnsupportedEatError('outrumor()');
    case LUMP_OF_ROYAL_JELLY:
        // gainstr(), the rnd(20) hit points and the rn2(17) maximum increase.
        throw new UnsupportedEatError('the royal jelly effects');
    case EGG:
        // A petrifying egg reaches make_stoned() through flesh_petrifies().
        throw new UnsupportedEatError("fpostfx()'s petrifying egg arm");
    case EUCALYPTUS_LEAF:
        // youprop.h:108 and :111 define Sick and Vomiting as the bare
        // intrinsic, as doeat()'s Strangled read below does for :110.
        if ((hungerProperty(state, SICK).intrinsic
                || hungerProperty(state, VOMITING).intrinsic)
            && !otmp.cursed) {
            throw new UnsupportedEatError('make_sick() and make_vomiting()');
        }
        break;
    case APPLE:
        if (otmp.cursed && !propertyActive(state, SLEEP_RES)) {
            // The Snow White arm: verbalize() or You_hear() and then
            // fall_asleep(-rn1(11, 20), TRUE).
            throw new UnsupportedEatError('fall_asleep() for a cursed apple');
        }
        break;
    default:
        break;
    }
    await Promise.resolve();
}

// C ref: eat.c fprefx() (2091-2213), the message on the first bite of a
// non-corpse, non-tin food. Answers false when eating must not proceed.
//
// Only the default arm is ported. Every arm above it belongs to a food this
// slice cannot reach: the multi-turn foods (a food ration, a tripe ration, a
// lembas wafer) are slice 3's, and the rest each need an unported effect.
async function fprefx(otmp, state) {
    switch (otmp.otyp) {
    case EGG:
        // A pyrolisk egg explodes; a stale one calls make_vomiting().
        throw new UnsupportedEatError("fprefx()'s egg arms");
    case FOOD_RATION:
    case TRIPE_RATION:
    case LEMBAS_WAFER:
        // oc_delay 5, 2 and 2: each is a multi-turn meal.
        throw new UnsupportedEatError(
            "fprefx()'s multi-turn ration arms",
        );
    case MEATBALL:
    case MEAT_STICK:
    case ENORMOUS_MEATBALL:
    case MEAT_RING:
        // These reach the same give_feedback label as the default arm, but
        // every one of them is FLESH, which doeat() stops above.
        throw new UnsupportedEatError("fprefx()'s meat arms");
    case CLOVE_OF_GARLIC:
        // iter_mons(garlic_breath) makes every nearby monster with a sense of
        // smell flee.
        throw new UnsupportedEatError('garlic_breath()');
    default:
        if (Hallucination(state)) {
            // Hallucination changes four of this arm's wordings -- "primo"
            // for "yummy", "grody!" for "terrible!", "gnarly!" for
            // "delicious!", and the apple's joke for a wording rnd(100)
            // picks between three of. Nothing reachable on dungeon level one
            // makes the hero hallucinate, so none of it has a recordable
            // case, and the draw would silently shift the stream if wrong.
            throw new UnsupportedEatError(
                "fprefx()'s hallucinating feedback",
            );
        }
        if (otmp.otyp === SLIME_MOLD && !otmp.cursed
            && otmp.spe === state.context.current_fruit) {
            // "My, this is a yummy <fruit>!" No role starts with a slime mold,
            // and picking one up off the floor needs the unported autopickup
            // and pickup commands, so no recorded case can check the wording
            // or the fruit name singular() would format.
            throw new UnsupportedEatError("fprefx()'s slime mold arm");
        } else if (otmp.otyp === APPLE && otmp.cursed
            && !propertyActive(state, SLEEP_RES)) {
            /* skip core joke; feedback deferred til fpostfx() */
        } else if (otmp.otyp === APPLE || otmp.otyp === PEAR) {
            // The #ifdef UNIX arm. The recorder builds for Linux, so this is
            // the arm an apple or a pear takes.
            await ttyPline('Core dumped.', state);
        } else {
            await ttyPline(
                `This ${singular(otmp, xnameFresh, state)} is ${
                    otmp.cursed
                        ? 'terrible!'
                        : (otmp.otyp === CRAM_RATION
                            || otmp.otyp === K_RATION
                            || otmp.otyp === C_RATION)
                            ? 'bland.'
                            : 'delicious!'
                }`,
                state,
            );
        }
        break;
    }
    return true;
}

// C ref: eat.c done_eating() (542-573). The end of a meal: the food is used
// up, its remaining effects run, and the victual struct returns to zero.
async function done_eating(message, state, env) {
    const meal = victual(state);
    const piece = meal.piece;

    piece.in_use = true;
    // C ref: `go.occupation = 0; /* do this early, so newuhs() knows we're
    // done */`. No ported occupation exists; state.force_save_hs, which
    // bite() raised, is what newuhs() reads instead, and bite() has already
    // lowered it.
    await newuhs(false, state, env);
    if (state.nomovemsg) {
        // Only lesshungry()'s nearly-full warning and choke() set nomovemsg,
        // and both stop above.
        throw new UnsupportedEatError("done_eating()'s nomovemsg");
    } else if (message) {
        // You("finish %s %s.", ..., food_xname(piece, TRUE)); reached only by
        // a meal of more than one turn or one resumed after an interruption.
        throw new UnsupportedEatError(
            "done_eating()'s \"You finish eating\" message",
        );
    }

    await fpostfx(piece, state, env);

    if (carried(piece)) useup(piece, env);
    else {
        throw new UnsupportedEatError('useupf() for a floor meal');
    }

    state.context.victual = zero_victual();
}

// C ref: eat.c start_eating() (2020-2074). Takes the first bite and, when that
// finishes the food, ends the meal at once.
//
// The multi-turn tail is slice 3's: set_occupation(eatfood, ...) and the
// occupation machinery it needs have no port, so a meal that survives its
// first bite stops here.
async function start_eating(otmp, already_partly_eaten, state, env) {
    const meal = victual(state);

    meal.fullwarn = 0;
    meal.doreset = 0;
    meal.eating = 1;

    if (otmp.otyp === CORPSE || otmp.globby) {
        // cprefx() owns cannibalism, the Rider revival and the petrifying
        // corpse; doeat() stops before a corpse reaches here.
        throw new UnsupportedEatError('cprefx()');
    }

    if (await bite(state, env)) {
        // bite() answers nonzero only after choke(), which stops above.
        throw new Error('start_eating: unreachable choke continuation');
    }

    if (++meal.usedtime >= meal.reqtime) {
        /* print "finish eating" message if they just resumed -dlc */
        await done_eating(
            meal.reqtime > 1 || already_partly_eaten,
            state,
            env,
        );
        return;
    }

    throw new UnsupportedEatError(
        'set_occupation(eatfood) for a meal of more than one turn',
    );
}

// C ref: eat.c getobj_else (79-85), a file-scope int rather than a member of
// the bulk-reinitialized globals because floorfood() clears it at every entry
// before anything reads it. It counts the floor alternatives the player
// declined, which is what puts "else" into "You don't have anything else to
// eat."
let getobj_else = 0;

// C ref: eat.c eat_ok() (3514-3533), the getobj() callback for #eat.
function eat_ok(obj, state = game) {
    /* 'getobj_else' will be non-zero if floor food is present and
       player declined to eat that */
    if (!obj)
        return getobj_else ? GETOBJ_EXCLUDE_NONINVENT : GETOBJ_EXCLUDE;

    if (is_edible(obj, state)) return GETOBJ_SUGGEST;

    /* make sure to exclude, not downplay, gold (if not is_edible) in order to
     * produce the "You cannot eat gold" message in getobj */
    if (obj.oclass === COIN_CLASS) return GETOBJ_EXCLUDE;

    return GETOBJ_EXCLUDE_SELECTABLE;
}

// C ref: eat.c floorfood() (3577-3730). Covers the `verb === "eat"` call
// doeat() makes with corpsecheck 0, as far as the getobj() prompt.
//
// C reaches getobj() either by skipping the floor outright or by walking the
// square's object chain and offering each candidate through yn_function().
// Everything on the second route stops here: the metallivore's bear-trap,
// iron-bars and gold questions, and the "There is <object> here; eat it?"
// prompt, which needs otense(), safe_qbuf() and ansimpleoname(). Each would
// consume a keystroke and paint a line, so answering the inventory prompt
// instead would diverge rather than fail closed.
//
// corpsecheck is the sacrifice and tinning selector; #offer and #tin are
// unported, so only doeat()'s 0 arrives and the tail that rejects a non-corpse
// for them has no reachable input.
export async function floorfood(verb, corpsecheck, state = game) {
    const u = state.u;
    const uptr = state.youmonst?.data;
    const feeding = verb === 'eat'; /* corpsecheck==0 */

    if (!feeding || corpsecheck)
        throw new UnsupportedEatError(`floorfood() for '${verb}'`);

    getobj_else = 0; /* haven't asked about floor food */

    /* if we can't touch floor objects then use invent food only;
       same when 'm' prefix is used--for #eat, it means "skip floor food" */
    const skipfloor = state.iflags.menu_requested
        || !can_reach_floor(true, state)
        || (feeding && u.usteed);

    if (!skipfloor) {
        // C skips the floor as well when the hero is over a pool or lava and
        // Wwalking, is_clinger() or (Flying && !Breathless) keeps them out of
        // it, and otherwise walks the chain below. Either way the hero has to
        // be standing on liquid, which the destination admission in
        // js/hack.js does not allow, so one stop covers both arms.
        if (is_pool_or_lava(u.ux, u.uy, state))
            throw new UnsupportedEatError('floorfood() over water or lava');

        if (feeding && metallivorous(uptr)) {
            // The bear-trap, iron-bars and gold questions, and with them the
            // &hands_obj return that doeat() treats as digging.
            throw new UnsupportedEatError(
                'floorfood() for a metallivorous hero',
            );
        }

        /* Is there some food (probably a heavy corpse) here on the ground? */
        for (let otmp = state.level.objects[u.ux]?.[u.uy] ?? null;
            otmp;
            otmp = otmp.nexthere) {
            if (otmp.oclass !== COIN_CLASS && is_edible(otmp, state)) {
                throw new UnsupportedEatError(
                    'floorfood() offering an object on the floor',
                );
            }
        }
    }

    /* skipfloor: */
    /* We cannot use GETOBJ_PROMPT since we don't want a prompt in the case
       where nothing edible is being carried. */
    const otmp = await getobj('eat', eat_ok, GETOBJ_NOFLAGS, state);
    /* resetting 'getobj_else' here isn't essential; it will be cleared the
       next time it needs to be used */
    getobj_else = 0;
    return otmp;
}

// C ref: eat.c doeat() (2815-3084), the #eat command, as far as a food that
// takes one turn to eat needs it. A corpse, a glob, a tin and a resumed meal
// each stop at their own arm below, and so does anything the one-turn path
// cannot reach.
//
// `env` supplies statusRefresh(), which newuhs() calls as C's bot(); the other
// two operations newuhs() needs are this file's own.
export async function doeat(state = game, env = {}) {
    const u = state.u;
    const eatEnv = {
        state,
        // C ref: mkobj.c weight()'s partly-eaten arms, which reach eat.c
        // eaten_stat() through this port's object env. No other hook is
        // reachable: an ordinary comestible carries no timer, no light, no
        // shop bill and no worn mask, so freeinv(), addinv_nomerge(),
        // splitobj() and obfree() each take their hookless path, and a hook
        // this meal did need would stop the command rather than be skipped.
        hooks: { eatenStat: eaten_stat },
        message: ttyPline,
        endRunning,
        // newuhs() resolves this only when the meal moves the hunger status,
        // which is the one place C's doeat() reaches bot().
        statusRefresh: env.statusRefresh,
    };

    if (u.uprops[STRANGLED].intrinsic) {
        await ttyPline(
            "If you can't breathe air, how can you consume solids?",
            state,
        );
        return ECMD_OK;
    }
    let otmp = await floorfood('eat', 0, state);
    if (!otmp)
        return ECMD_OK;
    if (await check_capacity(null, state))
        return ECMD_OK;

    if (u.uedibility) {
        // edibility_prompts() reads the corpse age, the petrification and
        // slime tests and eight message arms, and then asks yn_function().
        // Only blessed food detection sets u.uedibility, and neither the
        // potion nor the scroll that grants it is ported.
        throw new UnsupportedEatError('edibility_prompts()');
    }

    /* from floorfood(), &hands_obj means iron bars at current spot; only the
       metallivorous arm floorfood() refuses can return it. */

    /* We have to make non-foods take 1 move to eat, unless we want to
     * do ridiculous amounts of coding to deal with partly eaten plate
     * mails, players who polymorph back to human in the middle of their
     * metallic meal, etc....
     */
    if (!is_edible(otmp, state)) {
        await ttyPline('You cannot eat that!', state);
        return ECMD_OK;
    } else if ((otmp.owornmask
        & (W_ARMOR | W_TOOL | W_AMUL | W_SADDLE)) !== 0) {
        // C answers You_cant("eat %s you're wearing.", something). is_edible()
        // admits only FOOD_CLASS above, and no comestible can carry any of
        // those four masks, so this arm has no reachable input.
        throw new UnsupportedEatError("doeat()'s worn-object arm");
    }
    // C ref: `!(carried(otmp) ? retouch_object(&otmp, FALSE)
    //           : touch_artifact(otmp, &gy.youmonst))`, which spends a turn
    // when the hero is blasted. floorfood() cannot answer a floor object, and
    // artifact.c retouch_object() (2510-2528) returns 1 with no side effect
    // for anything that is neither an artifact nor SILVER carried against
    // Hate_silver. objects.h's FOOD rows are ten FLESH, twenty-one VEGGY and
    // the METAL tin (1117), so none is SILVER, and no food is an artifact.
    // The stop below keeps that derivation honest.
    if (otmp.oartifact)
        throw new UnsupportedEatError('retouch_object() for an artifact');

    // C ref: the rust-monster arm (2876-2907) and the RIN_SLOW_DIGESTION arm
    // (2909-2916), then `if (otmp->oclass != FOOD_CLASS)
    // return doeat_nonfood(otmp)`. The rust arm needs
    // `u.umonnum == PM_RUST_MONSTER`, which is_edible() refuses above; the
    // other two need a ring or an object outside FOOD_CLASS, which is_edible()
    // cannot answer true for. Being non-metallic is not what keeps a
    // comestible out of the rust arm: objects.h:1117 gives the tin METAL, and
    // objclass.h:194 puts METAL inside is_metallic()'s IRON..MITHRIL range.

    if (otmp === victual(state).piece) {
        // A meal interrupted and then resumed, which needs touchfood() against
        // a partly eaten piece and the "You resume your meal." wording. Only a
        // meal of more than one turn can be interrupted.
        throw new UnsupportedEatError("doeat()'s resumed meal");
    }

    /* nothing in progress - so try to find something. */
    /* tins are a special case */
    /* tins must also check conduct separately in case they're discarded */
    if (otmp.otyp === TIN) {
        // start_tin() runs its own opening occupation and svc.context.tin.
        throw new UnsupportedEatError('start_tin()');
    }

    // C ref: `if (!u.uconduct.food++) livelog_printf(...)`. pline.c
    // livelog_printf() appends to gg.gamelog and the live log file; neither is
    // ported, and neither draws randomness nor writes to the screen, so the
    // `ll_conduct` flag that gates the later livelog calls has no port either.
    u.uconduct.food++;

    const already_partly_eaten = Boolean(otmp.oeaten);
    if (already_partly_eaten) {
        // Only an interrupted meal leaves oeaten set on an object doeat() then
        // meets fresh; the resume arm above covers the rest.
        throw new UnsupportedEatError("doeat()'s partly eaten food");
    }
    otmp = touchfood(otmp, eatEnv);
    const meal = victual(state);
    meal.piece = otmp;
    meal.o_id = otmp.o_id;
    meal.usedtime = 0;

    /* Now we need to calculate delay and nutritional info.
     * The base nutrition calculated here and in eatcorpse() accounts
     * for normal vs. rotten food.  The reqtime and nutrit values are
     * then adjusted in accordance with the amount of food left.
     */
    if (otmp.otyp === CORPSE || otmp.globby) {
        // eatcorpse() owns rot, petrification, acidity, cannibalism and the
        // Rider corpses, and cprefx()/cpostfx() follow it.
        throw new UnsupportedEatError('eatcorpse()');
    }
    /* No checks for WAX, LEATHER, BONE, DRAGON_HIDE.  These are
     * all handled in the != FOOD_CLASS case, above.
     */
    if (objectType(otmp, state).oc_material === FLESH) {
        // The FLESH arm raises the unvegan and unvegetarian conducts through
        // violated_vegetarian(), which costs a Monk a luck point and an
        // alignment point through adjalign().
        throw new UnsupportedEatError('violated_vegetarian()');
    }
    if (otmp.otyp === PANCAKE || otmp.otyp === FORTUNE_COOKIE /*eggs*/
        || otmp.otyp === CREAM_PIE || otmp.otyp === CANDY_BAR /*milk*/
        || otmp.otyp === LUMP_OF_ROYAL_JELLY) {
        u.uconduct.unvegan++;
    }

    meal.reqtime = objectType(otmp, state).oc_delay;
    if (otmp.otyp !== FORTUNE_COOKIE
        && (otmp.cursed || (!nonrotting_food(otmp.otyp)
            && (state.moves - otmp.age) > (otmp.blessed ? 50 : 30)
            && (otmp.orotten || !rn2(7))))) {
        // rottenfood() prints, draws rn2(4) and can blind, confuse or stun the
        // hero, and consume_oeaten(otmp, 1) halves what is left either way.
        throw new UnsupportedEatError('rottenfood()');
    } else if (!already_partly_eaten) {
        if (!await fprefx(otmp, state)) {
            throw new UnsupportedEatError('do_reset_eat() after fprefx()');
        }
    } else {
        // You("%s %s.", reqtime == 1 ? "eat" : "begin eating", doname(otmp));
        // unreachable: the partly eaten stop above precedes it.
        throw new UnsupportedEatError("doeat()'s resumed-meal wording");
    }

    /* re-calc the nutrition */
    const basenutrit = obj_nutrition(otmp, state);

    meal.reqtime = basenutrit === 0
        ? 0
        : rounddiv(meal.reqtime * otmp.oeaten, basenutrit);

    /*
     * calculate the modulo value (nutrit. units per round eating)
     * note: this isn't exact - you actually lose a little nutrition due
     *       to this method.
     */
    if (meal.reqtime === 0 || otmp.oeaten === 0) {
        /* possible if most has been eaten before */
        meal.nmod = 0;
    } else if (otmp.oeaten >= meal.reqtime) {
        meal.nmod = -Math.trunc(otmp.oeaten / meal.reqtime);
    } else {
        meal.nmod = meal.reqtime % otmp.oeaten;
    }
    meal.canchoke = u.uhs === SATIATED ? 1 : 0;

    // C ref: `if (!dont_start) start_eating(...) else otmp->owt = weight()`.
    // dont_start is set only by eatcorpse() and rottenfood(), which both stop
    // above, so it is always false here.
    await start_eating(otmp, already_partly_eaten, state, eatEnv);
    return ECMD_TIME;
}
