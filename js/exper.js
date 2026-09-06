// exper.js — experience and spell-energy advancement.
// C ref: src/exper.c newuexp(), enermod(), newpw(), experience(),
// more_experienced(), newexplevel(), and pluslvl().

import {
    A_WIS,
    MAGICAL_BREATHING,
    MAXULEV,
    NATTK,
    NORMAL_SPEED,
    Upolyd,
} from './const.js';
import { adjabil, acurr, newhp, setuhpmax } from './attrib.js';
import { exp_percent_changing, xlev_to_rank } from './display.js';
import { game } from './gstate.js';
import { achieve_rank, record_achievement } from './insight.js';
import { amphibious, extra_nasty } from './mondata.js';
import {
    AD_BLND,
    AD_DRLI,
    AD_PHYS,
    AD_SLIM,
    AD_STON,
    AD_WRAP,
    AT_BUTT,
    AT_MAGC,
    AT_WEAP,
    PM_MAIL_DAEMON,
    PM_WIZARD,
    S_EEL,
} from './monsters.js';
import { rn1, rnd } from './rng.js';
import { find_mac } from './worn.js';

function advancementValue(advance, field) {
    return Math.trunc(advance?.[field] ?? 0);
}

export function newuexp(level) {
    if (level < 1) return 0;
    if (level < 10) return 10 * (2 ** level);
    if (level < 20) return 10_000 * (2 ** (level - 10));
    return 10_000_000 * (level - 19);
}

// C ref: exper.c losexp() (207-291). The divine-anger consumer currently
// reaches the level-1, no-drainer arm: C suppresses the level-loss message and
// resets u.uexp to zero without changing u.ulevel. Keep the other source arms
// fail-closed until a live caller supplies their life-drain resistance, death,
// level-ability, HP, and polymorph contracts.
export async function losexp(drainer = null, state = game, env = {}) {
    const u = state.u;
    if (drainer !== null || u.ulevel > 1) {
        throw new UnsupportedExperienceChangeError(
            'losexp() outside the level-1 divine-anger arm',
        );
    }
    u.uexp = 0;
    state.disp ??= {};
    state.disp.botl = true;
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
        let energyRandom = Math.trunc(acurr(state, A_WIS) / 2);
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

// C ref: youprop.h Amphibious() (272-273). Upolyd() is constantly false in
// this port, so gy.youmonst.data is the role's own species and amphibious()
// answers for it directly.
function Amphibious(state) {
    const breathing = state.u?.uprops?.[MAGICAL_BREATHING];
    return Boolean(breathing?.intrinsic)
        || Boolean(breathing?.extrinsic)
        || amphibious(state.youmonst?.data);
}

// C ref: exper.c experience() (84-166). The experience points one kill is
// worth. It draws nothing, prints nothing and changes nothing: every term
// reads the dead monster's species record, its level, and its armor class.
//
// `nk` is svm.mvitals[mndx].died, which mondead() has already incremented, so
// the current kill is included in the count. It matters only for a revived or
// cloned monster, whose reward halves every so many kills of its species.
export function experience(mtmp, nk, state = game) {
    const ptr = mtmp.data;
    let i;
    let tmp;
    let tmp2;

    tmp = 1 + mtmp.m_lev * mtmp.m_lev;

    /*  "For higher ac values, give extra experience" */
    if ((i = find_mac(mtmp, state)) < 3)
        tmp += (7 - i) * ((i < 0) ? 2 : 1);

    /*  "For very fast monsters, give extra experience" */
    if (ptr.mmove > NORMAL_SPEED)
        tmp += (ptr.mmove > Math.trunc(3 * NORMAL_SPEED / 2)) ? 5 : 3;

    /*  "For each 'special' attack type give extra experience" */
    for (i = 0; i < NATTK; i++) {
        tmp2 = ptr.mattk[i].aatyp;
        if (tmp2 > AT_BUTT) {
            if (tmp2 === AT_WEAP) tmp += 5;
            else if (tmp2 === AT_MAGC) tmp += 10;
            else tmp += 3;
        }
    }

    /*  "For each 'special' damage type give extra experience" */
    for (i = 0; i < NATTK; i++) {
        tmp2 = ptr.mattk[i].adtyp;
        if (tmp2 > AD_PHYS && tmp2 < AD_BLND) tmp += 2 * mtmp.m_lev;
        else if (tmp2 === AD_DRLI || tmp2 === AD_STON || tmp2 === AD_SLIM)
            tmp += 50;
        else if (tmp2 !== AD_PHYS) tmp += mtmp.m_lev;
        /* "extra heavy damage bonus" */
        if (ptr.mattk[i].damd * ptr.mattk[i].damn > 23) tmp += mtmp.m_lev;
        if (tmp2 === AD_WRAP && ptr.mlet === S_EEL && !Amphibious(state))
            tmp += 1000;
    }

    /*  "For certain 'extra nasty' monsters, give even more" */
    if (extra_nasty(ptr)) tmp += 7 * mtmp.m_lev;

    /*  "For higher level monsters, an additional bonus is given" */
    if (mtmp.m_lev > 8) tmp += 50;

    /* "Mail daemons put up no fight." global.h:430 defines MAIL_STRUCTURES
       unconditionally, so this arm is compiled even though MAIL is not. */
    if (ptr === state.mons[PM_MAIL_DAEMON]) tmp = 1;

    if (mtmp.mrevived || mtmp.mcloned) {
        /*
         * "Reduce experience awarded for repeated killings of 'the same
         * monster'.  Kill count includes all of this monster's type which
         * have been killed--including the current monster--regardless of
         * how they were created."
         *    1.. 20  full experience    81..120  xp / 8    241..255+  xp / 64
         *   21.. 40  xp / 2            121..180  xp / 16
         *   41.. 80  xp / 4            181..240  xp / 32
         */
        for (i = 0, tmp2 = 20; nk > tmp2 && tmp > 1; ++i) {
            tmp = Math.trunc((tmp + 1) / 2);
            nk -= tmp2;
            if (i & 1) tmp2 += 20;
        }
    }

    return tmp;
}

// Thrown where exper.c reaches an experience branch this port has not ported.
export class UnsupportedExperienceChangeError extends Error {
    constructor(branch) {
        super(`experience change requires ${branch}`);
        this.name = 'UnsupportedExperienceChangeError';
        this.branch = branch;
    }
}

// C ref: exper.c more_experienced(). Adds `exper` experience points and
// `rexp` bonus score points, the score also taking four times the experience.
// It draws no random numbers and prints nothing; all it can do besides move
// the two totals is ask for a status redraw.
//
// The score half sets no redraw: include/config.h:627 leaves SCORE_ON_BOTL
// undefined in the reference build, so the `flags.showscore` test at
// exper.c:196-198 is not compiled and the status line carries no S: field.
export function more_experienced(exper, rexp, state = game) {
    const u = state.u;
    const oldexp = u.uexp;
    const oldrexp = u.urexp;
    const newexp = oldexp + exper;
    const rexpincr = 4 * exper + rexp;
    const newrexp = oldrexp + rexpincr;

    /* "cap experience and score on wraparound" */
    // exper.c:178-181 replaces a total that C's 64-bit `long` addition drove
    // negative with LONG_MAX. A JavaScript number neither wraps nor stays an
    // exact integer that far out, so the cap cannot be reproduced; refuse the
    // arithmetic instead, at the point where the two languages part. Nothing
    // ported comes close: neither total ever goes negative, and the largest
    // single grant any caller makes here is level_difficulty(), 2 on D:2.
    if (!Number.isSafeInteger(newexp) || !Number.isSafeInteger(newrexp)) {
        throw new UnsupportedExperienceChangeError(
            "more_experienced() past JavaScript's exact-integer range",
        );
    }

    if (newexp !== oldexp) {
        u.uexp = newexp;
        if (state.flags.showexp) state.disp.botl = true;
        /* "even when experience points aren't being shown, experience level
           might be highlighted with a percentage highlight rule and that
           percentage depends upon experience points" */
        if (!state.disp.botl && exp_percent_changing(state))
            state.disp.botl = true;
    }
    /* "newrexp will always differ from oldrexp unless they're LONG_MAX" */
    if (newrexp !== oldrexp) u.urexp = newrexp;
    if (u.urexp >= (state.urole?.mnum === PM_WIZARD ? 1000 : 2000))
        state.flags.beginner = false;
}

// C ref: exper.c newexplevel(). "Make experience gaining similar to AD&D(tm),
// whereby you can at most go up by one level at a time, extra expr possibly
// helping you along." The one caller wired here is do.c goto_level()'s
// Tourist arrival, whose grant is level_difficulty(); a Tourist needs to reach
// D:6 before 2+3+4+5+6 meets newuexp(1), so pluslvl(TRUE) below stays refused.
export async function newexplevel(state = game, env = {}) {
    const u = state.u;
    if (u.ulevel < MAXULEV && u.uexp >= newuexp(u.ulevel))
        await pluslvl(true, state, env);
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
// Three arms have no owner. `incr` is True only from exper.c newexplevel()
// above, whose sole wired caller grants a Tourist level_difficulty() points on
// arrival; the smallest fresh case that meets newuexp(1) with those grants is
// a Tourist on D:6, and no recorded or fresh case has taken the port past D:2.
// The `incr` arm -- the silent opening and the u.uexp cap just below the next
// threshold -- is therefore refused below rather than written blind, and
// QUALITY.json carries it as a deferral.
//
// The Upolyd block, which adds monhp_per_lvl() to u.mh, cannot run because
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
        /* give new intrinsics; adjabil() prints through the same owner so a
           You_feel() gain shares this call's --More-- chain */
        await adjabil(u.ulevel - 1, u.ulevel, state, { message });
        const newrank = xlev_to_rank(u.ulevel);
        if (newrank > oldrank)
            record_achievement(achieve_rank(newrank, state), state);
        if (u.ulevel > u.ulevelpeak) u.ulevelpeak = u.ulevel;
    }
    state.disp.botl = true;
}

export const _experInternals = Object.freeze({ enermod });
