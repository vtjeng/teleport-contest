// Minion extensions.
// C ref: minion.c newemin().

import {
    A_CHAOTIC,
    A_LAWFUL,
    A_NONE,
    A_NEUTRAL,
    G_GONE,
    MM_EMIN,
    MM_NOMSG,
} from './const.js';
import { ART_DEMONBANE } from './artifacts.js';
import { Amonnam, Monnam } from './do_name.js';
import { game } from './gstate.js';
import { sgn } from './hacklib.js';
import { makemon_runtime } from './makemon_create.js';
import { mkclass, mkclass_aligned } from './makemon.js';
import {
    is_demon,
    is_dlord,
    is_dprince,
    is_lord,
    is_minion,
    is_ndemon,
    msummon_environ,
} from './mondata.js';
import * as M from './monsters.js';
import { mon_aligntyp } from './priest.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { canSeeMonster, canSpotMonster, heroIsBlind }
    from './startup_a11y.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';

const defaultSelectorRandom = { rn1, rn2, rnd };

function selectorRandom(raw = {}) {
    return { ...defaultSelectorRandom, ...raw };
}

// C ref: minion.c monster_census() (40-57).  The census walks the live level
// chain, ignoring dead monsters and guards parked at <0,0>. A spotted census
// uses the canonical sensing predicate by default; callers can inject a
// clone-local predicate so planning never consults live display state.
export function monster_census(spotted = false, env = {}) {
    const state = env?.state ?? (env?.level ? env : game);
    const canSpot = env?.canSpotMonster ?? env?.canspotmon ?? canSpotMonster;
    let count = 0;
    for (let monster = state.level?.monlist; monster; monster = monster.nmon) {
        if ((monster.mhp ?? 0) < 1) continue;
        if (monster.isgd && monster.mx === 0) continue;
        if (spotted && !canSpot(monster, state)) continue;
        ++count;
    }
    return count;
}

// C ref: minion.c newemin(). Allocates the minion extension on a monster.
// makemon() calls this when MM_EMIN is set; clone_mon() calls it for minion
// clones. Follows the same pattern as newedog() and newepri().
export function newemin(monster) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('newemin requires a monster instance');
    monster.mextra ??= {};
    monster.mextra.emin ??= {
        parentmid: monster.m_id,
        min_align: 0,
        renegade: false,
    };
}

// C ref: minion.c dprince() (391-402).  The fallback is deliberately the
// source's approximate lower rank rather than a second selection strategy.
export function dprince(atyp = A_NONE, state = game, random = { rn1 }) {
    random = selectorRandom(random);
    const endgame = state.u?.uz && state.astral_level
        && state.u.uz.dnum === state.astral_level.dnum;
    for (let tries = endgame ? 0 : 20; tries > 0; --tries) {
        const pm = random.rn1(
            M.PM_DEMOGORGON + 1 - M.PM_ORCUS,
            M.PM_ORCUS,
        );
        const species = state.mons[pm];
        if (!(state.mvitals[pm].mvflags & G_GONE)
            && (atyp === A_NONE
                || sgn(species.maligntyp) === sgn(atyp))) return pm;
    }
    return dlord(atyp, state, random);
}

// C ref: minion.c dlord() (405-416).
export function dlord(atyp = A_NONE, state = game, random = { rn1 }) {
    random = selectorRandom(random);
    const endgame = state.u?.uz && state.astral_level
        && state.u.uz.dnum === state.astral_level.dnum;
    for (let tries = endgame ? 0 : 20; tries > 0; --tries) {
        const pm = random.rn1(
            M.PM_YEENOGHU + 1 - M.PM_JUIBLEX,
            M.PM_JUIBLEX,
        );
        const species = state.mons[pm];
        if (!(state.mvitals[pm].mvflags & G_GONE)
            && (atyp === A_NONE
                || sgn(species.maligntyp) === sgn(atyp))) return pm;
    }
    return ndemon(atyp, state, random);
}

// C ref: minion.c llord() (420-426).
export function llord(state = game, random = { rnd }) {
    random = selectorRandom(random);
    return (state.mvitals[M.PM_ARCHON].mvflags & G_GONE)
        ? lminion(state, random) : M.PM_ARCHON;
}

// C ref: minion.c lminion() (429-441).
export function lminion(state = game, random = { rnd }) {
    random = selectorRandom(random);
    for (let tries = 0; tries < 20; ++tries) {
        const species = mkclass(M.S_ANGEL, 0, { state, random });
        if (species && !is_lord(species)) return species.pmidx;
    }
    return M.NON_PM;
}

// C ref: minion.c ndemon() (444-464).  This is shared by level construction
// and runtime summons, so keep it in the minion owner rather than duplicating
// the selector in mkroom.js.
export function ndemon(atyp = A_NONE, state = game, random = { rnd }) {
    random = selectorRandom(random);
    const species = mkclass_aligned(M.S_DEMON, 0, atyp, { state, random });
    return species && is_ndemon(species) ? species.pmidx : M.NON_PM;
}

function isLawfulMinion(monster) {
    const species = monster?.data;
    return is_minion(species) && mon_aligntyp(monster) === A_LAWFUL;
}

function summonRandom(rawEnv = {}) {
    const source = rawEnv.random ?? {};
    const random = {
        d,
        rn1,
        rn2,
        rnd,
        rne,
        rnz,
        ...source,
    };
    for (const name of ['rn2', 'rnd', 'rn1', 'd', 'rne', 'rnz']) {
        if (typeof random[name] !== 'function') {
            throw new TypeError(`msummon requires random.${name}`);
        }
    }
    return random;
}

// C ref: minion.c msummon() (59-190).  The caller owns the monster's action
// state, while this function owns selector RNG, minion extension state, and
// the census delta.  It is async because makemon_runtime() awaits the runtime
// tails; that keeps the source order visible to summonmu() and planning.
export async function msummon(mon = null, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = summonRandom(rawEnv);
    const message = rawEnv.planning
        ? async () => {}
        : (rawEnv.message ?? ttyPline);
    const seeMonster = rawEnv.canSeeMonster ?? canSeeMonster;
    const env = {
        ...rawEnv,
        state,
        random,
        message,
        canSeeMonster: seeMonster,
        canSpotMonster: rawEnv.canSpotMonster ?? canSpotMonster,
    };
    const ptr = mon?.data ?? state.mons?.[M.PM_WIZARD_OF_YENDOR];
    if (!ptr) return 0;

    if (mon && state.uwep?.oartifact === ART_DEMONBANE
        && is_demon(ptr)) {
        if (seeMonster(mon, state)) {
            await message(
                `${Monnam(mon, state, env)} looks puzzled for a moment.`,
                state,
                env,
            );
        }
        return 0;
    }

    const atyp = mon
        ? mon.ispriest
            ? (mon.mextra?.epri?.shralign ?? A_NONE)
            : mon.isminion
                ? (mon.mextra?.emin?.min_align ?? A_NONE)
                : ptr.maligntyp === A_NONE ? A_NONE : sgn(ptr.maligntyp)
        : ptr.maligntyp === A_NONE ? A_NONE : sgn(ptr.maligntyp);
    let dtype = M.NON_PM;
    let count = 0;

    if (is_dprince(ptr) || ptr.pmidx === M.PM_WIZARD_OF_YENDOR) {
        dtype = !random.rn2(20) ? dprince(atyp, state, random)
            : !random.rn2(4) ? dlord(atyp, state, random)
                : ndemon(atyp, state, random);
        count = dtype !== M.NON_PM && !random.rn2(4)
            && is_ndemon(state.mons[dtype]) ? 2 : 1;
    } else if (is_dlord(ptr)) {
        dtype = !random.rn2(50) ? dprince(atyp, state, random)
            : !random.rn2(20) ? dlord(atyp, state, random)
                : ndemon(atyp, state, random);
        count = dtype !== M.NON_PM && !random.rn2(4)
            && is_ndemon(state.mons[dtype]) ? 2 : 1;
    } else if (ptr.pmidx === M.PM_BONE_DEVIL) {
        dtype = M.PM_SKELETON;
        count = 1;
    } else if (is_ndemon(ptr)) {
        dtype = !random.rn2(20) ? dlord(atyp, state, random)
            : !random.rn2(6) ? ndemon(atyp, state, random)
                : ptr.pmidx;
        count = 1;
    } else if (isLawfulMinion(mon)) {
        dtype = is_lord(ptr) && !random.rn2(20) ? llord(state, random)
            : (is_lord(ptr) || !random.rn2(6))
                ? lminion(state, random) : ptr.pmidx;
        count = dtype !== M.NON_PM && !random.rn2(4)
            && !is_lord(state.mons[dtype]) ? 2 : 1;
    } else if (ptr.pmidx === M.PM_ANGEL) {
        if (!random.rn2(6)) {
            if (atyp === A_NEUTRAL) {
                const elementals = [
                    M.PM_AIR_ELEMENTAL,
                    M.PM_FIRE_ELEMENTAL,
                    M.PM_EARTH_ELEMENTAL,
                    M.PM_WATER_ELEMENTAL,
                ];
                dtype = elementals[random.rn2(elementals.length)];
            } else if (atyp === A_CHAOTIC || atyp === A_NONE) {
                dtype = ndemon(atyp, state, random);
            }
        } else {
            dtype = M.PM_ANGEL;
        }
        count = dtype !== M.NON_PM && !random.rn2(4)
            && !is_lord(state.mons[dtype]) ? 2 : 1;
    }

    if (dtype === M.NON_PM) return 0;
    const species = state.mons[dtype];
    if (!species) return 0;
    if (count > 1 && (species.geno & M.G_UNIQ)) count = 1;
    if (state.mvitals[dtype].mvflags & G_GONE) {
        dtype = ndemon(atyp, state, random);
        if (dtype === M.NON_PM) return 0;
    }

    const census = monster_census(false, { state });
    let result = 0;
    let hasTransientLight = false;
    const makeMonster = rawEnv.makemon_runtime ?? makemon_runtime;
    while (count-- > 0) {
        const created = await makeMonster(
            state.mons[dtype],
            state.u.ux,
            state.u.uy,
            MM_EMIN | MM_NOMSG,
            { ...env, _msummon: true },
        );
        if (!created) continue;
        result++;
        if (dtype === M.PM_ANGEL) {
            created.isminion = true;
            created.mextra.emin.min_align = atyp;
            created.mextra.emin.renegade =
                (atyp !== state.u.ualign.type) ^ !created.mpeaceful;
        }
        if (created.data.mlet === M.S_ANGEL && !heroIsBlind(state)) {
            hasTransientLight = true;
            if (!env.planning && typeof env.showTransientLight === 'function') {
                await env.showTransientLight(created.mx, created.my, state, env);
            } else if (!env.planning) {
                // C discards this display helper's return value; the display
                // animation itself remains an explicitly recorded gap.
                note_unported('light.c show_transient_light');
            }
        }
        if (count === 0 && seeMonster(created, state)) {
            const { cloud, what } = msummon_environ(created.data);
            await message(
                `${Amonnam(created, env)} appears in a ${cloud} of ${what}!`,
                state,
                env,
            );
        }
    }
    if (hasTransientLight && !env.planning)
        note_unported('light.c transient_light_cleanup');
    return result ? monster_census(false, { state }) - census : 0;
}
