// exper.js — experience and spell-energy advancement.
// C ref: src/exper.c newuexp(), enermod(), and newpw().

import { A_WIS, MAXULEV } from './const.js';
import { game } from './gstate.js';
import { rn1, rnd } from './rng.js';

function advancementValue(advance, field) {
    return Math.trunc(advance?.[field] ?? 0);
}

export function newuexp(level) {
    if (level < 1) return 0;
    if (level < 10) return 10 * (2 ** level);
    if (level < 20) return 10_000 * (2 ** (level - 10));
    return 10_000_000 * (level - 19);
}

function enermod(energy, role) {
    switch (role?.filecode) {
    case 'Pri':
    case 'Wiz':
        return 2 * energy;
    case 'Hea':
    case 'Kni':
        return Math.trunc((3 * energy) / 2);
    case 'Bar':
    case 'Val':
        return Math.trunc((3 * energy) / 4);
    default:
        return energy;
    }
}

// C ref: exper.c newpw().
export function newpw(state = game, random = { rn1, rnd }) {
    const u = state?.u;
    const role = state?.urole;
    const race = state?.urace;
    if (!u || !role || !race) {
        throw new Error('hero, role, and race must be initialized first');
    }

    let energy = 0;
    if ((u.ulevel ?? 0) === 0) {
        energy = advancementValue(role.enadv, 'infix')
            + advancementValue(race.enadv, 'infix');
        const roleRandom = advancementValue(role.enadv, 'inrnd');
        const raceRandom = advancementValue(race.enadv, 'inrnd');
        if (roleRandom > 0) energy += random.rnd(roleRandom);
        if (raceRandom > 0) energy += random.rnd(raceRandom);
    } else {
        let energyRandom = Math.trunc((u.acurr?.a?.[A_WIS] ?? 0) / 2);
        const lowLevel = u.ulevel < Math.trunc(role.xlev ?? 0);
        const fixedField = lowLevel ? 'lofix' : 'hifix';
        const randomField = lowLevel ? 'lornd' : 'hirnd';
        energyRandom += advancementValue(role.enadv, randomField)
            + advancementValue(race.enadv, randomField);
        const energyFixed = advancementValue(role.enadv, fixedField)
            + advancementValue(race.enadv, fixedField);
        energy = enermod(random.rn1(energyRandom, energyFixed), role);
    }

    if (energy <= 0) energy = 1;
    if ((u.ulevel ?? 0) < MAXULEV) {
        if (!Array.isArray(u.ueninc)) u.ueninc = new Array(MAXULEV).fill(0);
        u.ueninc[u.ulevel ?? 0] = energy;
    } else {
        const limit = Math.max(4 - Math.trunc((u.uenmax ?? 0) / 200), 1);
        if (energy > limit) energy = limit;
    }
    return energy;
}

export const _experInternals = Object.freeze({ enermod });
