// Minion extensions.
// C ref: minion.c newemin().

import {
    A_CHA,
    A_CHAOTIC,
    A_LAWFUL,
    A_NONE,
    A_NEUTRAL,
    ARTICLE_A,
    CONFLICT,
    DEAF,
    EXACT_NAME,
    G_GONE,
    LL_UMONST,
    MM_EMIN,
    MM_NOMSG,
    RLOC_MSG,
    STRAT_APPEARMSG,
    W_ARMS,
    voice_deity,
} from './const.js';
import { ART_DEMONBANE, ART_EXCALIBUR, is_art } from './artifacts.js';
import { Amonnam, Monnam, mon_nam, x_monnam } from './do_name.js';
import { flush_screen, map_invisible, newsym } from './display.js';
import { In_hell } from './dungeon.js';
import { Hear_again, is_fainted } from './eat.js';
import { game } from './gstate.js';
import { sgn, s_suffix } from './hacklib.js';
import { nomul, unmul } from './hack.js';
import { stop_occupation } from './allmain.js';
import { money_cnt, currency } from './invent.js';
import { makemon_runtime, mongets } from './makemon_create.js';
import { mongone } from './mon.js';
import { mkclass, mkclass_aligned, set_malign } from './makemon.js';
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
import { mk_roamer, mon_aligntyp } from './priest.js';
import { mon_has_amulet } from './wizard.js';
import { acurr } from './attrib.js';
import { getlin } from './windows.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { show_transient_light, transient_light_cleanup } from './light.js';
import { rloc, tele_restrict } from './teleport.js';
import { heroIsBlind } from './startup_a11y.js';
import { vision_recalc } from './vision.js';
import { livelog_printf, verbalize } from './pline.js';
import { align_gname } from './pray.js';
import { set_voice } from './sounds.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import { canseemon, canspotmon } from './display.js';
import { enexto } from './teleport.js';
import { m_dowear, which_armor } from './worn.js';
import { select_hwep } from './weapon.js';
import {
    AMULET_OF_REFLECTION,
    SHIELD_OF_REFLECTION,
    SILVER_SABER,
} from './objects.js';
import { bless, mksobj } from './obj.js';
import { mpickobj } from './steal.js';

function guardianRandom(state, rawEnv = {}) {
    return { d, rn1, rn2, rnd, rne, ...state.random, ...rawEnv.random };
}

function conflictActive(state) {
    const conflict = state.u?.uprops?.[CONFLICT];
    return Boolean(conflict?.intrinsic || conflict?.extrinsic);
}

// C ref: minion.c lose_guardian_angel(). The source discards mk_roamer's
// result while creating replacement hostile angels in source order.
export async function lose_guardian_angel(mon, state = game, rawEnv = {}) {
    const random = guardianRandom(state, rawEnv);
    const env = { ...rawEnv, state, random };
    if (mon) {
        if (canseemon(mon, state)) {
            if (!heroDeaf(state)) {
                await (rawEnv.message ?? ttyPline)(
                    `${Monnam(mon, state)} rebukes you, saying:`, state,
                );
                set_voice(mon, 0, 80, 0, state);
                await verbalize('Since you desire conflict, have some more!',
                    state, { message: rawEnv.message ?? ttyPline });
            } else {
                await (rawEnv.message ?? ttyPline)(
                    `${Monnam(mon, state)} vanishes!`, state,
                );
            }
        }
        mongone(mon, env);
    }
    for (let i = random.rn1(3, 2); i > 0; --i) {
        const at = enexto(state.u.ux, state.u.uy,
            state.mons[M.PM_ANGEL], env);
        if (at)
            await mk_roamer(state.mons[M.PM_ANGEL], state.u.ualign.type,
                at.x, at.y, false, env);
    }
}

// C ref: minion.c gain_guardian_angel(). Astral arrival invokes the deafness
// check before testing Conflict and alignment record, then equips a worthy
// hero's guardian in source order.
export async function gain_guardian_angel(state = game, rawEnv = {}) {
    const random = guardianRandom(state, rawEnv);
    const message = rawEnv.message ?? ttyPline;
    const env = { ...rawEnv, state, random, message };
    await Hear_again(state, env);
    if (conflictActive(state)) {
        if (!heroDeaf(state)) await message('A voice booms:', state);
        else await message('You feel a booming voice:', state);
        set_voice(null, 0, 80, voice_deity, state);
        await verbalize('Thy desire for conflict shall be fulfilled!', state,
            { message });
        await lose_guardian_angel(null, state, env);
    } else if ((state.u?.ualign?.record ?? 0) > 8) {
        if (!heroDeaf(state)) await message('A voice whispers:', state);
        else await message('You feel a soft voice:', state);
        set_voice(null, 0, 80, voice_deity, state);
        await verbalize('Thou hast been worthy of me!', state, { message });
        const at = enexto(state.u.ux, state.u.uy,
            state.mons[M.PM_ANGEL], env);
        const angel = at
            ? await mk_roamer(state.mons[M.PM_ANGEL], state.u.ualign.type,
                at.x, at.y, true, env)
            : null;
        if (angel) {
            angel.mstrategy &= ~STRAT_APPEARMSG;
            if (state.u?.uconduct?.pets) {
                angel.mtame = 10;
                state.u.uconduct.pets++;
            }
            newsym(angel.mx, angel.my, state);
            await message(heroIsBlind(state)
                ? 'You feel the presence of a friendly angel near you.'
                : 'An angel appears near you.', state);
            angel.m_lev = random.rn1(8, 15);
            angel.mhp = angel.mhpmax = random.d(angel.m_lev, 10)
                + 30 + random.rnd(30);
            let weapon = select_hwep(angel, env);
            if (!weapon) {
                weapon = mksobj(SILVER_SABER, false, false, env);
                if (mpickobj(angel, weapon, env))
                    throw new Error('gain_guardian_angel: merged weapon');
            }
            bless(weapon, env);
            if (weapon.spe < 4) weapon.spe += random.rnd(4);
            const arms = which_armor(angel, W_ARMS, state);
            if (!arms || arms.otyp !== SHIELD_OF_REFLECTION) {
                mongets(angel, AMULET_OF_REFLECTION, env);
                await m_dowear(angel, true, env);
            }
        }
    }
}

const defaultSelectorRandom = { rn1, rn2, rnd };

function selectorRandom(raw = {}) {
    return { ...defaultSelectorRandom, ...raw };
}

function transientLightEnv(state) {
    return {
        visionRecalc: (control) => vision_recalc(control, {
            state,
            redraw: (x, y) => newsym(x, y, state),
        }),
        flushScreen: (mode) => flush_screen(mode),
        canSeeMonster: (monster) => canseemon(monster, state),
        canSpotMonster: (monster) => canspotmon(monster, state),
        mapInvisible: (x, y) => map_invisible(x, y, state),
    };
}

function heroDeaf(state) {
    const deaf = state.u?.uprops?.[DEAF];
    return Boolean(deaf?.intrinsic || deaf?.extrinsic
        || state.u?.uroleplay?.deaf);
}

// C ref: minion.c summon_minion() (198-255). The deity creates a hostile
// minion without recomputing malign after overriding its initial peacefulness.
export async function summon_minion(alignment, talk, state = game, rawEnv = {}) {
    const random = summonRandom(rawEnv);
    const message = rawEnv.message ?? ttyPline;
    const env = { ...rawEnv, state, random, message };
    let mnum;
    switch (alignment) {
    case A_LAWFUL:
        mnum = lminion(state, random);
        break;
    case A_NEUTRAL: {
        // minion.c:11-14 deliberately preserves this order, independent of
        // the order of the E-class species table.
        const elementals = [M.PM_AIR_ELEMENTAL, M.PM_FIRE_ELEMENTAL,
            M.PM_EARTH_ELEMENTAL, M.PM_WATER_ELEMENTAL];
        mnum = elementals[random.rn2(elementals.length)];
        break;
    }
    case A_CHAOTIC:
    case A_NONE:
        mnum = ndemon(alignment, state, random);
        break;
    default:
        note_unported('pline.c impossible');
        mnum = ndemon(A_NONE, state, random);
        break;
    }
    if (mnum === M.NON_PM) return;
    const needsMinion = mnum === M.PM_ANGEL
        || ![M.PM_SHOPKEEPER, M.PM_GUARD, M.PM_ALIGNED_CLERIC, M.PM_HIGH_CLERIC].includes(mnum);
    const mon = await makemon_runtime(state.mons[mnum], state.u.ux, state.u.uy,
        MM_NOMSG | (needsMinion ? MM_EMIN : 0), { ...env, _summon_minion: true });
    if (!mon) return;
    if (needsMinion) {
        mon.isminion = true;
        mon.mextra.emin.min_align = alignment;
        mon.mextra.emin.renegade = false;
    }
    if (talk) {
        const deity = align_gname(alignment, state);
        await message(heroDeaf(state)
            ? `You feel ${s_suffix(deity)} booming voice:`
            : `The voice of ${deity} booms:`, state);
        set_voice(mon, 0, 80, 0, state);
        await verbalize('Thou shalt pay for thine indiscretion!', state, env);
        if (canspotmon(mon, state))
            await message(`${Amonnam(mon, state, env)} appears before you.`, state);
        mon.mstrategy &= ~STRAT_APPEARMSG;
    }
    mon.mpeaceful = false;
}

// C ref: minion.c demon_talk() (263-359). sounds.c:1140 discards this
// function's return, but demon_talk() consumes bribe()'s long result when it
// decides whether the demon departs or attacks.
export async function demon_talk(mtmp, state = game, env = {}) {
    const random = { rn1, rn2, rnd, ...(env.random ?? {}) };
    const message = env.message ?? ttyPline;
    const speak = env.verbalize ?? verbalize;
    const deaf = heroDeaf(state);

    if (is_art(state.uwep, ART_EXCALIBUR)
        || is_art(state.uwep, ART_DEMONBANE)) {
        if (canseemon(mtmp, state))
            await message(`${Amonnam(mtmp, state)} looks very angry.`, state);
        else
            await message('You feel tension building.', state);
        mtmp.mpeaceful = 0;
        mtmp.mtame = 0;
        set_malign(mtmp, state);
        newsym(mtmp.mx, mtmp.my, state);
        return 0;
    }

    if (is_fainted(state)) {
        // eat.c reset_faint()'s return is void, but its unmul() side effect
        // wakes the hero when afternmv is unfaint. Preserve the missing source
        // owner explicitly instead of fabricating that state transition.
        note_unported('eat.c reset_faint');
    } else {
        await stop_occupation(state, { message });
        if ((state.multi ?? 0) > 0) {
            nomul(0, state);
            await unmul(null, state);
        }
    }

    if (is_dprince(mtmp.data) && mtmp.minvis) {
        const wasUnseen = !canspotmon(mtmp, state);
        mtmp.minvis = 0;
        mtmp.perminvis = 0;
        if (wasUnseen && canspotmon(mtmp, state)) {
            await message(`${Amonnam(mtmp, state)} appears before you.`, state);
            mtmp.mstrategy &= ~STRAT_APPEARMSG;
        }
        newsym(mtmp.mx, mtmp.my, state);
    }

    if (state.youmonst?.data?.mlet === M.S_DEMON) {
        if (!deaf) {
            await message(
                `${Amonnam(mtmp, state)} says, "Good hunting, ${state.flags?.female ? 'Sister' : 'Brother'}."`,
                state,
            );
        } else if (canseemon(mtmp, state)) {
            await message(`${Amonnam(mtmp, state)} says something.`, state);
        }
        if (!await tele_restrict(mtmp, state))
            rloc(mtmp, RLOC_MSG, { state });
        return 1;
    }

    const cash = money_cnt(state.invent);
    const atHome = In_hell(state.u.uz, state) && mtmp.cham === M.NON_PM;
    const sameAlignment = sgn(state.u.ualign.type)
        === sgn(mtmp.data.maligntyp);
    let demand = Math.trunc(
        (cash * (random.rnd(80) + 20 * Number(atHome)))
        / (100 * (1 + Number(sameAlignment))),
    );

    if (!demand || (state.multi ?? 0) < 0) {
        mtmp.mpeaceful = 0;
        set_malign(mtmp, state);
        return 0;
    }

    let offer = 0;
    if (mon_has_amulet(mtmp) || deaf)
        demand = cash + random.rn1(1000, 125);

    if (!deaf) {
        await message(
            `${Amonnam(mtmp, state)} demands ${demand} ${currency(demand, state)} for safe passage.`,
            state,
        );
        offer = await bribe(mtmp, 'How much will you offer?', state, env);
    } else if (canseemon(mtmp, state)) {
        await message(`${Amonnam(mtmp, state)} seems to be demanding something.`, state);
    }

    if (!deaf && offer >= demand) {
        await message(
            `${Amonnam(mtmp, state)} vanishes, laughing about cowardly mortals.`,
            state,
        );
    } else if (offer > 0
        && random.rnd(5 * acurr(A_CHA, state)) > demand - offer) {
        await message(
            `${Amonnam(mtmp, state)} scowls at you menacingly, then vanishes.`,
            state,
        );
    } else {
        await message(`${Amonnam(mtmp, state)} gets angry...`, state);
        mtmp.mpeaceful = 0;
        set_malign(mtmp, state);
        return 0;
    }

    livelog_printf(
        LL_UMONST,
        `bribed ${x_monnam(mtmp, ARTICLE_A, null, EXACT_NAME, false, state)} with ${offer} ${offer === 1 ? 'zorkmid' : 'zorkmids'} for safe passage`,
        state,
    );
    mongone(mtmp, { state });
    return 1;
}

// C ref: minion.c bribe() (361-389). The terminal line is parsed as a signed
// decimal long, payment is capped to the hero's inventory, and money2mon()
// owns the object transfer while its C return is discarded here.
export async function bribe(mtmp, prompt, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const input = await (env.getlin ?? getlin)(prompt, state);
    const match = /^\s*([+-]?\d+)/u.exec(String(input ?? ''));
    let offer = match ? Number.parseInt(match[1], 10) : 0;
    const umoney = money_cnt(state.invent);

    if (offer < 0) {
        await message(`You try to shortchange ${mon_nam(mtmp, state)}, but fumble.`, state);
        return 0;
    }
    if (offer === 0) {
        await message('You refuse.', state);
        return 0;
    }
    if (offer >= umoney) {
        await message(`You give ${mon_nam(mtmp, state)} all your gold.`, state);
        offer = umoney;
    } else {
        await message(
            `You give ${mon_nam(mtmp, state)} ${offer} ${currency(offer, state)}.`,
            state,
        );
    }

    const { money2mon } = await import('./shk.js');
    money2mon(mtmp, offer, state);
    state.disp ??= {};
    state.disp.botl = true;
    return offer;
}

// C ref: minion.c monster_census() (40-57).  The census walks the live level
// chain, ignoring dead monsters and guards parked at <0,0>. A spotted census
// uses the canonical sensing predicate by default; callers can inject a
// clone-local predicate so planning never consults live display state.
export function monster_census(spotted = false, env = {}) {
    const state = env?.state ?? (env?.level ? env : game);
    const canSpot = env?.canSpotMonster ?? env?.canspotmon ?? canspotmon;
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
    const seeMonster = rawEnv.canSeeMonster ?? canseemon;
    const env = {
        ...rawEnv,
        state,
        random,
        message,
        canSeeMonster: seeMonster,
        canSpotMonster: rawEnv.canSpotMonster ?? canspotmon,
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
                await show_transient_light(
                    null,
                    created.mx,
                    created.my,
                    state,
                    transientLightEnv(state),
                );
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
        await transient_light_cleanup(state, transientLightEnv(state));
    return result ? monster_census(false, { state }) - census : 0;
}
