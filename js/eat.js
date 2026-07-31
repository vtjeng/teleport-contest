// The #eat command, the hunger clock, and the food helpers that object
// creation and naming share.
// C refs: src/eat.c is_edible(), gethungry(), newuhs(), nonrotting_corpse(),
//         vegan(), vegetarian(), tin_variety(), set_tin_variety(),
//         tin_details(), eat_ok(), floorfood(), and doeat().

import {
    A_STR,
    CONFLICT,
    ECMD_OK,
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
    PROTECTION,
    RANDOM_TIN,
    REGENERATION,
    ROTTEN_TIN,
    SATIATED,
    SLOW_DIGESTION,
    SLT_ENCUMBER,
    SPINACH_TIN,
    STRANGLED,
    Upolyd,
    WEAK,
    W_ARTI,
    W_RINGL,
    W_RINGR,
    W_WEP,
    NEUTRAL,
} from './const.js';
import { can_reach_floor } from './engrave.js';
import { game } from './gstate.js';
import { check_capacity } from './hack.js';
import { getobj } from './invent.js';
import { is_rider, metallivorous } from './mondata.js';
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
import { objectType } from './obj.js';
import {
    COIN_CLASS,
    FAKE_AMULET_OF_YENDOR,
    FOOD_CLASS,
    MEAT_RING,
    RIN_PROTECTION,
    RIN_SLOW_DIGESTION,
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

// C ref: eat.c doeat() (2815-3084), from its entry as far as the
// !is_edible(otmp) arm. Everything that actually eats stops below that:
// the worn-item and retouch_object() arms, the rust-monster and slow-digestion
// arms, doeat_nonfood(), the resumed meal, start_tin(), the conduct counters
// and start_eating() with its occupation.
export async function doeat(state = game) {
    const u = state.u;

    if (u.uprops[STRANGLED].intrinsic) {
        await ttyPline(
            "If you can't breathe air, how can you consume solids?",
            state,
        );
        return ECMD_OK;
    }
    const otmp = await floorfood('eat', 0, state);
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
    }
    throw new UnsupportedEatError('start_eating() and the meal it begins');
}
