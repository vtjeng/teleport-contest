// exper.js — experience and spell-energy advancement.
// C ref: src/exper.c newuexp(), enermod(), newpw(), and pluslvl().

import { A_WIS, MAXULEV, Upolyd } from './const.js';
import { adjabil, effective_attribute, newhp, setuhpmax } from './attrib.js';
import { xlev_to_rank } from './display.js';
import { game } from './gstate.js';
import { achieve_rank, record_achievement } from './insight.js';
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
        let energyRandom = Math.trunc(effective_attribute(state, A_WIS) / 2);
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

// Thrown where exper.c reaches an experience branch this port has not ported.
export class UnsupportedExperienceChangeError extends Error {
    constructor(branch) {
        super(`experience change requires ${branch}`);
        this.name = 'UnsupportedExperienceChangeError';
        this.branch = branch;
    }
}

// C ref: exper.c pluslvl(). `incr` is False for the potion of gain level, the
// wraith corpse, and wizard mode's #levelchange; only #levelchange reaches it
// here, so the "You feel more experienced." opening always prints.
//
// The message order is load-bearing for both the random-number log and the
// screen. The opening message runs before newhp() and newpw() draw, and the
// welcome line runs after u.ulevel has already been incremented. Each message
// also flushes the status line before update_topl() can block on --More--
// (pline.c:274), so a screen recorded at that prompt can show a level the top
// line has not announced yet.
//
// Three arms have no owner. `incr` is True only from exper.c newexplevel(),
// which is unported, so its arm -- the silent opening and the u.uexp cap just
// below the next threshold -- is refused below rather than written blind. The
// Upolyd block, which adds monhp_per_lvl() to u.mh, cannot run because
// js/u_init.js is this port's only writer of u.umonnum and sets it equal to
// u.umonster. livelog_printf() writes a file this port cannot write, the
// treatment recorded at js/do.js:658-660; it is the only reader of C's
// `old_ach_cnt`, so count_achievements() has no consumer here either.
export async function pluslvl(incr, state = game, env = {}) {
    const message = env.message;
    if (typeof message !== 'function')
        throw new TypeError('pluslvl needs a message owner');
    const random = env.random ?? { rn1, rnd };
    const u = state.u;

    if (incr) {
        throw new UnsupportedExperienceChangeError(
            'pluslvl(TRUE), which only exper.c newexplevel() reaches',
        );
    }
    await message('You feel more experienced.', state);

    /* increase hit points (when polymorphed, C does monster form first
       in order to retain normal human/whatever increase for later) */
    if (Upolyd(u)) {
        throw new UnsupportedExperienceChangeError(
            'pluslvl() adding monhp_per_lvl() while polymorphed',
        );
    }
    const hpinc = newhp(state, random);
    u.uhp += hpinc;
    /* will lower u.uhp if it exceeds u.uhpmax */
    setuhpmax(u.uhpmax + hpinc, true, state);

    /* increase spell power/energy points */
    const eninc = newpw(state, random);
    u.uenmax += eninc;
    if (u.uenmax > u.uenpeak) u.uenpeak = u.uenmax;
    u.uen += eninc;

    /* increase level (unless already maxxed) */
    if (u.ulevel < MAXULEV) {
        const oldrank = xlev_to_rank(u.ulevel);

        /* increase experience points to reflect new level; C's `incr` arm,
           which instead caps u.uexp one point below newuexp(u.ulevel + 1),
           is the one refused above */
        u.uexp = newuexp(u.ulevel);
        ++u.ulevel;
        await message(
            `Welcome ${u.ulevelmax < u.ulevel ? '' : 'back '}`
            + `to experience level ${u.ulevel}.`,
            state,
        );
        if (u.ulevelmax < u.ulevel) u.ulevelmax = u.ulevel;
        adjabil(u.ulevel - 1, u.ulevel, state); /* give new intrinsics */
        const newrank = xlev_to_rank(u.ulevel);
        if (newrank > oldrank)
            record_achievement(achieve_rank(newrank, state), state);
        if (u.ulevel > u.ulevelpeak) u.ulevelpeak = u.ulevel;
    }
    state.disp.botl = true;
}

export const _experInternals = Object.freeze({ enermod });
