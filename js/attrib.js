// attrib.js — hero attributes, advancement, exercise, and adjustment.
// C ref: src/attrib.c newhp(), init_attr(), vary_init_attr(), exercise(),
// exerper(), adjattrib(), and exerchk().

import {
    A_CHA,
    A_CON,
    A_DEX,
    A_INT,
    A_STR,
    A_WIS,
    CLAIRVOYANT,
    CONFUSION,
    EXT_ENCUMBER,
    FAINTED,
    FAINTING,
    FIXED_ABIL,
    FUMBLING,
    HALLUC,
    HALLUC_RES,
    HUNGRY,
    HVY_ENCUMBER,
    MAXULEV,
    MOD_ENCUMBER,
    NOT_HUNGRY,
    NUM_ATTRS,
    REGENERATION,
    SATIATED,
    SICK,
    STUNNED,
    Upolyd,
    VOMITING,
    WEAK,
    WOUNDED_LEGS,
} from './const.js';
import { SPFX_LUCK } from './artifacts.js';
import { game } from './gstate.js';
import {
    PM_AMOROUS_DEMON,
    PM_MONK,
    S_NYMPH,
} from './monsters.js';
import { DUNCE_CAP, LUCKSTONE } from './objects.js';
import { rn1, rn2, rnd } from './rng.js';
import { aligns } from './roles.js';

const EXERCISE_LIMIT = 50;
const ATTRIBUTE_NAMES = Object.freeze([
    'strength',
    'intelligence',
    'wisdom',
    'dexterity',
    'constitution',
    'charisma',
]);
const POSITIVE_ATTRIBUTE_DESCRIPTIONS = Object.freeze([
    'strong',
    'smart',
    'wise',
    'agile',
    'tough',
    'charismatic',
]);
const NEGATIVE_ATTRIBUTE_DESCRIPTIONS = Object.freeze([
    'weak',
    'stupid',
    'foolish',
    'clumsy',
    'fragile',
    'repulsive',
]);
const EXERCISE_EXPLANATIONS = Object.freeze([
    Object.freeze(['exercising diligently', 'exercising properly']),
    Object.freeze([null, null]),
    Object.freeze(['very observant', 'paying attention']),
    Object.freeze(['working on your reflexes', 'working on reflexes lately']),
    Object.freeze(['leading a healthy life-style', 'watching your health']),
    Object.freeze([null, null]),
]);

function roleAndRace(state) {
    if (!state?.urole || !state?.urace) {
        throw new Error('role and race must be initialized first');
    }
    return { role: state.urole, race: state.urace };
}

function advancementValue(advance, field) {
    return Math.trunc(advance?.[field] ?? 0);
}

function ensureIncrementArray(u, key) {
    if (!Array.isArray(u[key])) u[key] = new Array(MAXULEV).fill(0);
    return u[key];
}

// C ref: attrib.c newhp(). The initial branch is the one used by
// u_init_misc(), but the level-gain branches are kept here with it.
export function newhp(state = game, random = { rnd }) {
    const u = state.u;
    const { role, race } = roleAndRace(state);
    if (!u) throw new Error('hero state must be initialized first');

    let hp;
    if ((u.ulevel ?? 0) === 0) {
        hp = advancementValue(role.hpadv, 'infix')
            + advancementValue(race.hpadv, 'infix');
        const roleRandom = advancementValue(role.hpadv, 'inrnd');
        const raceRandom = advancementValue(race.hpadv, 'inrnd');
        if (roleRandom > 0) hp += random.rnd(roleRandom);
        if (raceRandom > 0) hp += random.rnd(raceRandom);
        if ((state.moves ?? 0) === 0) {
            if (!u.ualign) u.ualign = {};
            u.ualign.type = aligns[state.flags?.initalign]?.value ?? 0;
            u.ualign.record = Math.trunc(role.initrecord ?? 0);
        }
    } else {
        const lowLevel = u.ulevel < Math.trunc(role.xlev ?? 0);
        const fixedField = lowLevel ? 'lofix' : 'hifix';
        const randomField = lowLevel ? 'lornd' : 'hirnd';
        hp = advancementValue(role.hpadv, fixedField)
            + advancementValue(race.hpadv, fixedField);
        const roleRandom = advancementValue(role.hpadv, randomField);
        const raceRandom = advancementValue(race.hpadv, randomField);
        if (roleRandom > 0) hp += random.rnd(roleRandom);
        if (raceRandom > 0) hp += random.rnd(raceRandom);

        const constitution = effective_attribute(state, A_CON);
        if (constitution <= 3) hp -= 2;
        else if (constitution <= 6) hp -= 1;
        else if (constitution <= 14) hp += 0;
        else if (constitution <= 16) hp += 1;
        else if (constitution === 17) hp += 2;
        else if (constitution === 18) hp += 3;
        else hp += 4;
    }

    if (hp <= 0) hp = 1;
    if ((u.ulevel ?? 0) < MAXULEV) {
        ensureIncrementArray(u, 'uhpinc')[u.ulevel ?? 0] = hp;
    } else {
        const limit = Math.max(5 - Math.trunc((u.uhpmax ?? 0) / 300), 1);
        if (hp > limit) hp = limit;
    }
    return hp;
}

function attributeArrays(u) {
    if (!u.acurr) u.acurr = {};
    if (!Array.isArray(u.acurr.a)) u.acurr.a = new Array(NUM_ATTRS).fill(0);
    if (!u.amax) u.amax = {};
    if (!Array.isArray(u.amax.a)) u.amax.a = new Array(NUM_ATTRS).fill(0);
    if (!Array.isArray(u.atemp)) u.atemp = new Array(NUM_ATTRS).fill(0);
    if (!Array.isArray(u.atime)) u.atime = new Array(NUM_ATTRS).fill(0);
    if (!Array.isArray(u.aexe)) u.aexe = new Array(NUM_ATTRS).fill(0);
    return {
        base: u.acurr.a,
        max: u.amax.a,
        temp: u.atemp,
        time: u.atime,
        exercise: u.aexe,
    };
}

function attributeArray(value) {
    return Array.isArray(value) ? value : value?.a;
}

// C ref: attrib.c acurr(). The shared arithmetic here owns the
// base/bonus/temporary sum, source caps, and form-specific Charisma floor.
// Equipment-specific overrides remain with the eventual worn-item attribute
// subsystem.
export function effective_attribute(state = game, index) {
    const u = state.u;
    const base = Math.trunc(u?.acurr?.a?.[index] ?? 0);
    const bonus = Math.trunc(attributeArray(u?.abon)?.[index] ?? 0);
    const temporary = Math.trunc(attributeArray(u?.atemp)?.[index] ?? 0);
    const total = base + bonus + temporary;
    if (index === A_STR) return Math.max(3, Math.min(total, 125));
    if (index === A_CHA && total < 18
        && (state.youmonst?.data?.mlet === S_NYMPH
            || state.u?.umonnum === PM_AMOROUS_DEMON)) {
        return 18;
    }
    return Math.max(3, Math.min(total, 25));
}

function randomAttribute(role, random) {
    let value = random.rn2(100);
    for (let i = 0; i < NUM_ATTRS; i++) {
        value -= Math.trunc(role.attrdist?.[i] ?? 0);
        if (value < 0) return i;
    }
    return NUM_ATTRS;
}

function redistributeInitialAttributes(state, points, addition, random) {
    const { role, race } = roleAndRace(state);
    const attrs = attributeArrays(state.u);
    let tries = 0;
    const adjustment = addition ? 1 : -1;

    while ((addition ? points > 0 : points < 0) && tries < 100) {
        const index = randomAttribute(role, random);
        const limit = addition
            ? Math.trunc(race.attrmax?.[index] ?? attrs.base[index])
            : Math.trunc(race.attrmin?.[index] ?? attrs.base[index]);
        if (index >= NUM_ATTRS
            || (addition ? attrs.base[index] >= limit : attrs.base[index] <= limit)) {
            tries += 1;
            continue;
        }
        tries = 0;
        attrs.base[index] += adjustment;
        attrs.max[index] += adjustment;
        points -= adjustment;
    }
    return points;
}

// C ref: attrib.c init_attr().
export function init_attr(points, state = game, random = { rn2 }) {
    const { role } = roleAndRace(state);
    const attrs = attributeArrays(state.u);
    let remaining = Math.trunc(points);

    for (let i = 0; i < NUM_ATTRS; i++) {
        const base = Math.trunc(role.attrbase?.[i] ?? 0);
        attrs.base[i] = attrs.max[i] = base;
        attrs.temp[i] = attrs.time[i] = 0;
        remaining -= base;
    }
    remaining = redistributeInitialAttributes(state, remaining, true, random);
    return redistributeInitialAttributes(state, remaining, false, random);
}

function adjustInitialAttribute(state, index, increment, random) {
    if (!increment) return false;
    const { race } = roleAndRace(state);
    const attrs = attributeArrays(state.u);
    const minimum = Math.trunc(race.attrmin?.[index] ?? attrs.base[index]);
    const maximum = Math.trunc(race.attrmax?.[index] ?? attrs.max[index]);
    const oldCurrent = attrs.base[index] + attrs.temp[index];

    attrs.base[index] += increment;
    if (increment > 0) {
        if (attrs.base[index] > attrs.max[index]) {
            attrs.max[index] = attrs.base[index];
            if (attrs.max[index] > maximum) {
                attrs.base[index] = attrs.max[index] = maximum;
            }
        }
    } else if (attrs.base[index] < minimum) {
        const decrease = random.rn2(minimum - attrs.base[index] + 1);
        attrs.base[index] = minimum;
        attrs.max[index] = Math.max(attrs.max[index] - decrease, minimum);
    }
    if (attrs.base[index] + attrs.temp[index] !== oldCurrent) {
        attrs.exercise[index] = 0;
        return true;
    }
    return false;
}

// C ref: attrib.c vary_init_attr().
export function vary_init_attr(state = game, random = { rn2 }) {
    const attrs = attributeArrays(state.u);
    for (let i = 0; i < NUM_ATTRS; i++) {
        if (random.rn2(20) === 0) {
            const adjustment = random.rn2(7) - 2;
            adjustInitialAttribute(state, i, adjustment, random);
            if (attrs.base[i] < attrs.max[i]) attrs.max[i] = attrs.base[i];
        }
    }
}

// C ref: attrib.c exercise(). The inventory-identification path exercises
// Wisdom, but keeping the complete small routine here preserves the source's
// draw boundary for other callers too. encumberMessage owns encumber_msg(),
// which only follows physical exercise after play has begun.
export function exercise(
    index,
    increase,
    state = game,
    random = { rn2 },
    { encumberMessage } = {},
) {
    if (index === A_INT || index === A_CHA) return 0;
    if (Upolyd(state.u) && index !== A_WIS) return 0;
    if (typeof random.rn2 !== 'function')
        throw new TypeError('exercise random injection requires rn2');

    const physicalMessage = Math.trunc(state.moves ?? 0) > 0
        && (index === A_STR || index === A_CON);
    if (physicalMessage && typeof encumberMessage !== 'function')
        throw new Error('exercise requires encumber_msg');

    const attrs = attributeArrays(state.u);
    let adjustment = 0;
    if (Math.abs(attrs.exercise[index]) < EXERCISE_LIMIT) {
        adjustment = increase
            ? (random.rn2(19) > effective_attribute(state, index) ? 1 : 0)
            : -random.rn2(2);
        attrs.exercise[index] += adjustment;
    }
    if (physicalMessage) {
        const completion = encumberMessage(state);
        if (completion && typeof completion.then === 'function') {
            return completion.then(() => adjustment);
        }
    }
    return adjustment;
}

function propertyPresent(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function intrinsicPropertyPresent(hero, index) {
    return Boolean(hero?.uprops?.[index]?.intrinsic);
}

function requiredOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`attribute upkeep requires ${name}`);
    return operation;
}

async function exerciseWithEnvironment(index, increase, state, env) {
    return exercise(index, increase, state, env.random, {
        encumberMessage: env.encumberMessage,
    });
}

// C ref: attrib.c exerper(). This owns the five-turn status cadence and the
// ten-turn hunger and encumbrance cadence. Inventory contents remain stable in
// the active boundary, but nearCapacity is live: temporary Strength changes
// can change capacity and burden before the next allocation.
export async function exerper(state = game, env = {}) {
    const random = env.random ?? { rn2 };
    const encumberMessage = requiredOperation(env, 'encumberMessage');
    const nearCapacity = requiredOperation(env, 'nearCapacity');
    const normalized = {
        ...env,
        random,
        encumberMessage,
        nearCapacity,
    };
    const moves = Math.trunc(state.moves ?? 0);
    const hero = state.u;
    if (!hero || !Number.isSafeInteger(hero.uhunger))
        throw new Error('periodic exercise requires initialized hero hunger');

    if (moves % 10 === 0) {
        const hunger = hero.uhunger > 1000
            ? SATIATED
            : hero.uhunger > 150
                ? NOT_HUNGRY
                : hero.uhunger > 50
                    ? HUNGRY
                    : hero.uhunger > 0 ? WEAK : FAINTING;
        switch (hunger) {
        case SATIATED:
            await exerciseWithEnvironment(A_DEX, false, state, normalized);
            if (state.urole?.mnum === PM_MONK)
                await exerciseWithEnvironment(A_WIS, false, state, normalized);
            break;
        case NOT_HUNGRY:
            await exerciseWithEnvironment(A_CON, true, state, normalized);
            break;
        case WEAK:
            await exerciseWithEnvironment(A_STR, false, state, normalized);
            if (state.urole?.mnum === PM_MONK)
                await exerciseWithEnvironment(A_WIS, true, state, normalized);
            break;
        case FAINTING:
        case FAINTED:
            await exerciseWithEnvironment(A_CON, false, state, normalized);
            break;
        default:
            break;
        }

        switch (nearCapacity(state)) {
        case MOD_ENCUMBER:
            await exerciseWithEnvironment(A_STR, true, state, normalized);
            break;
        case HVY_ENCUMBER:
            await exerciseWithEnvironment(A_STR, true, state, normalized);
            await exerciseWithEnvironment(A_DEX, false, state, normalized);
            break;
        case EXT_ENCUMBER:
            await exerciseWithEnvironment(A_DEX, false, state, normalized);
            await exerciseWithEnvironment(A_CON, false, state, normalized);
            break;
        default:
            break;
        }
    }

    if (moves % 5 === 0) {
        if (intrinsicPropertyPresent(hero, CLAIRVOYANT)
            && !hero.uprops?.[CLAIRVOYANT]?.blocked) {
            await exerciseWithEnvironment(A_WIS, true, state, normalized);
        }
        if (intrinsicPropertyPresent(hero, REGENERATION))
            await exerciseWithEnvironment(A_STR, true, state, normalized);
        if (intrinsicPropertyPresent(hero, SICK)
            || intrinsicPropertyPresent(hero, VOMITING)) {
            await exerciseWithEnvironment(A_CON, false, state, normalized);
        }
        const hallucinating = intrinsicPropertyPresent(hero, HALLUC)
            && !propertyPresent(hero, HALLUC_RES);
        if (intrinsicPropertyPresent(hero, CONFUSION) || hallucinating) {
            await exerciseWithEnvironment(A_WIS, false, state, normalized);
        }
        if ((propertyPresent(hero, WOUNDED_LEGS) && !hero.usteed)
            || propertyPresent(hero, FUMBLING)
            || intrinsicPropertyPresent(hero, STUNNED)) {
            await exerciseWithEnvironment(A_DEX, false, state, normalized);
        }
    }
}

function attributeBonus(hero, index) {
    return Math.trunc(attributeArray(hero?.abon)?.[index] ?? 0);
}

async function emitAttributeMessage(env, text, state) {
    const message = requiredOperation(env, 'message');
    await message(text, state);
}

// C ref: attrib.c adjattrib(). The periodic check is its live consumer here.
// Keeping the whole state and message contract together avoids giving the
// scheduled path a second attribute-adjustment implementation.
// messageMode preserves msgflg's three source modes: positive suppresses all
// messages, zero reports success or a verbose no-change result, and negative
// reports only a successful change.
export async function adjattrib(
    index,
    increment,
    messageMode,
    state = game,
    env = {},
) {
    if (state.u?.uprops?.[FIXED_ABIL]?.extrinsic || !increment) return false;

    if ((index === A_INT || index === A_WIS)
        && state.uarmh?.otyp === DUNCE_CAP) {
        if (messageMode === 0) {
            await emitAttributeMessage(
                env,
                'Your cap constricts briefly, then relaxes again.',
                state,
            );
        }
        return false;
    }

    const random = env.random ?? { rn2 };
    const attrs = attributeArrays(state.u);
    const oldCurrent = effective_attribute(state, index);
    const oldBase = attrs.base[index];
    const oldMaximum = attrs.max[index];
    const racialMinimum = Math.trunc(
        state.urace?.attrmin?.[index] ?? attrs.base[index],
    );
    const racialMaximum = Math.trunc(
        state.urace?.attrmax?.[index] ?? attrs.max[index],
    );
    attrs.base[index] += increment;

    let description;
    let bonusOpposesChange;
    if (increment > 0) {
        if (attrs.base[index] > attrs.max[index]) {
            attrs.max[index] = attrs.base[index];
            if (attrs.max[index] > racialMaximum)
                attrs.base[index] = attrs.max[index] = racialMaximum;
        }
        description = POSITIVE_ATTRIBUTE_DESCRIPTIONS[index];
        bonusOpposesChange = attributeBonus(state.u, index) < 0;
    } else {
        if (attrs.base[index] < racialMinimum) {
            const decrease = random.rn2(
                racialMinimum - attrs.base[index] + 1,
            );
            attrs.base[index] = racialMinimum;
            attrs.max[index] = Math.max(
                attrs.max[index] - decrease,
                racialMinimum,
            );
        }
        description = NEGATIVE_ATTRIBUTE_DESCRIPTIONS[index];
        bonusOpposesChange = attributeBonus(state.u, index) > 0;
    }

    if (effective_attribute(state, index) === oldCurrent) {
        if (messageMode === 0 && state.flags?.verbose) {
            if (attrs.base[index] === oldBase
                && attrs.max[index] === oldMaximum) {
                await emitAttributeMessage(
                    env,
                    `You're ${bonusOpposesChange ? 'currently' : 'already'} `
                        + `as ${description} as you can get.`,
                    state,
                );
            } else {
                await emitAttributeMessage(
                    env,
                    `Your innate ${ATTRIBUTE_NAMES[index]} has `
                        + `${increment > 0 ? 'improved' : 'declined'}.`,
                    state,
                );
            }
        }
        return false;
    }

    attrs.exercise[index] = 0;
    state.disp ??= {};
    state.disp.botl = true;
    if (messageMode <= 0) {
        await emitAttributeMessage(
            env,
            `You feel ${Math.abs(increment) > 1 ? 'very ' : ''}`
                + `${description}!`,
            state,
        );
    }
    if (state.program_state?.in_moveloop
        && (index === A_STR || index === A_CON)) {
        await requiredOperation(env, 'encumberMessage')(state);
    }
    return true;
}

function halveExercise(value) {
    return Math.trunc(Math.abs(value) / 2) * Math.sign(value);
}

// C ref: attrib.c exerchk(). The scheduled check begins at move 600 in a new
// game and advances by rn1(200, 800) after every completed check.
export async function exerchk(state = game, env = {}) {
    const random = env.random ?? { rn1, rn2 };
    if (typeof random.rn1 !== 'function'
        || typeof random.rn2 !== 'function') {
        throw new TypeError('attribute check random injection requires rn1 and rn2');
    }
    const normalized = { ...env, random };
    await exerper(state, normalized);

    const moves = Math.trunc(state.moves ?? 0);
    const nextCheck = state.context?.next_attrib_check;
    if (!Number.isSafeInteger(nextCheck) || nextCheck < 0)
        throw new Error('attribute check requires next_attrib_check');
    if (moves < nextCheck || state.multi) return false;

    const attrs = attributeArrays(state.u);
    for (let index = 0; index < NUM_ATTRS; ++index) {
        let accumulated = attrs.exercise[index];
        if (!accumulated) continue;

        const direction = Math.sign(accumulated);
        const minimum = Math.trunc(
            state.urace?.attrmin?.[index] ?? attrs.base[index],
        );
        const maximum = Math.min(
            Math.trunc(
                state.urace?.attrmax?.[index] ?? attrs.max[index],
            ),
            18,
        );
        const atLimit = accumulated < 0
            ? attrs.base[index] <= minimum
            : attrs.base[index] >= maximum;
        const temporaryBody = Upolyd(state.u) && index !== A_WIS;
        const threshold = index === A_WIS
            ? Math.abs(accumulated)
            : Math.trunc(Math.abs(accumulated) * 2 / 3);

        if (!atLimit && !temporaryBody
            && random.rn2(EXERCISE_LIMIT) <= threshold) {
            if (await adjattrib(
                index,
                direction,
                -1,
                state,
                normalized,
            )) {
                accumulated = 0;
                const explanation =
                    EXERCISE_EXPLANATIONS[index][direction > 0 ? 0 : 1];
                await emitAttributeMessage(
                    normalized,
                    `You ${direction > 0 ? 'must have' : "haven't"} been `
                        + `${explanation}.`,
                    state,
                );
            }
        }
        attrs.exercise[index] = halveExercise(accumulated);
    }

    state.context.next_attrib_check += random.rn1(200, 800);
    return true;
}

function confersLuck(object, state) {
    if (object.otyp === LUCKSTONE) return true;
    if (!object.oartifact) return false;
    return Boolean(state.artilist?.[object.oartifact]?.spfx & SPFX_LUCK);
}

// C ref: attrib.c stone_luck(). Quantity contributes before the final sign;
// uncursed stones are counted only when the caller asks for them.
export function stone_luck(includeUncursed, state = game) {
    let bonus = 0;
    for (let object = state.invent; object; object = object.nobj) {
        if (!confersLuck(object, state)) continue;
        const quantity = Math.trunc(object.quan ?? 0);
        if (object.cursed) bonus -= quantity;
        else if (object.blessed || includeUncursed) bonus += quantity;
    }
    return Math.sign(bonus);
}

export const _attribInternals = Object.freeze({
    randomAttribute,
    redistributeInitialAttributes,
});
