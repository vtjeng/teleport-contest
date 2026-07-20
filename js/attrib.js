// attrib.js — hero attribute initialization and hit-point advancement.
// C ref: src/attrib.c newhp(), init_attr(), and vary_init_attr().

import { A_CON, MAXULEV, NUM_ATTRS } from './const.js';
import { game } from './gstate.js';
import { rn2, rnd } from './rng.js';
import { aligns } from './roles.js';

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

        const constitution = Math.trunc(u.acurr?.a?.[A_CON] ?? 0);
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

export const _attribInternals = Object.freeze({
    randomAttribute,
    redistributeInitialAttributes,
});
