// mcastu.js -- Monster wizard and cleric spell casting.
// C ref: mcastu.c -- cursetxt(), choose_monster_spell(), castmu(),
// is_undirected_spell(), spell_would_be_useless(), and mcast_spell().
//
// Individual spell effects (mcast_psi_bolt, mcast_open_wounds, etc.) are
// ported as the running game exercises them.  Unexercised cases inside
// mcast_spell() throw unsupported.

import {
    ANTIMAGIC,
    BLINDED,
    DEAF,
    DISPLACED,
    HALF_SPDAM,
    HALLUC,
    HALLUC_RES,
    HEAD,
    INVIS,
    M_ATTK_HIT,
    M_ATTK_MISS,
    M_SEEN_MAGR,
    MFAST,
    SEE_INVIS,
    u_at,
} from './const.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import { healmon } from './mon.js';
import {
    cvt_adtyp_to_mseenres,
    monstseesu,
    monstunseesu,
    perceives,
} from './mondata.js';
import {
    AD_CLRC,
    AD_SPEL,
} from './monsters.js';
import { body_part } from './polyself.js';
import { rn2, d } from './rng.js';
import { couldsee, canseemon } from './vision.js';

// ---- Spell enum (mcastu.h MONSPELL order) ----
// These must match the C enum values (0-based, order from mcastu.h).
const MCAST_PSI_BOLT = 0;
const MCAST_OPEN_WOUNDS = 1;
const MCAST_CURE_SELF = 2;
const MCAST_HASTE_SELF = 3;
const MCAST_CONFUSE_YOU = 4;
const MCAST_STUN_YOU = 5;
const MCAST_DISAPPEAR = 6;
const MCAST_PARALYZE = 7;
const MCAST_BLIND_YOU = 8;
const MCAST_WEAKEN_YOU = 9;
const MCAST_DESTRY_ARMR = 10;
const MCAST_INSECTS = 11;
const MCAST_CURSE_ITEMS = 12;
const MCAST_LIGHTNING = 13;
const MCAST_FIRE_PILLAR = 14;
const MCAST_GEYSER = 15;
const MCAST_AGGRAVATION = 16;
const MCAST_SUMMON_MONS = 17;
const MCAST_CLONE_WIZ = 18;
const MCAST_DEATH_TOUCH = 19;

// ---- Spell flags (mcastu.h) ----
const MCF_NONE = 0x0000;
const MCF_INDIRECT = 0x0001;
const MCF_SIGHT = 0x0002;
const MCF_HOSTILE = 0x0004;

// ---- Spell data table (mcastu.h MONSPELL definitions, indexed by enum) ----
// Each entry: { level, flags }.
const mcast_data = [
    /* MCAST_PSI_BOLT     */ { level: 0, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_OPEN_WOUNDS  */ { level: 0, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_CURE_SELF    */ { level: 1, flags: MCF_INDIRECT },
    /* MCAST_HASTE_SELF   */ { level: 2, flags: MCF_INDIRECT },
    /* MCAST_CONFUSE_YOU  */ { level: 2, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_STUN_YOU     */ { level: 3, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_DISAPPEAR    */ { level: 4, flags: MCF_INDIRECT },
    /* MCAST_PARALYZE     */ { level: 4, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_BLIND_YOU    */ { level: 6, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_WEAKEN_YOU   */ { level: 6, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_DESTRY_ARMR  */ { level: 8, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_INSECTS      */ { level: 8,
        flags: MCF_HOSTILE | MCF_INDIRECT | MCF_SIGHT },
    /* MCAST_CURSE_ITEMS  */ { level: 10, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_LIGHTNING    */ { level: 11, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_FIRE_PILLAR  */ { level: 12, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_GEYSER       */ { level: 13, flags: MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_AGGRAVATION  */ { level: 13,
        flags: MCF_INDIRECT | MCF_HOSTILE | MCF_SIGHT },
    /* MCAST_SUMMON_MONS  */ { level: 15,
        flags: MCF_HOSTILE | MCF_INDIRECT | MCF_SIGHT },
    /* MCAST_CLONE_WIZ    */ { level: 18,
        flags: MCF_HOSTILE | MCF_INDIRECT | MCF_SIGHT },
    /* MCAST_DEATH_TOUCH  */ { level: 20, flags: MCF_HOSTILE | MCF_SIGHT },
];

// ---- Spell lists for specific monster casters ----
// C ref: mcastu.c mon_cleric_spells[] and mon_wizard_spells[].
const mon_cleric_spells = [
    MCAST_OPEN_WOUNDS, MCAST_CURE_SELF, MCAST_CONFUSE_YOU, MCAST_PARALYZE,
    MCAST_BLIND_YOU, MCAST_INSECTS, MCAST_CURSE_ITEMS, MCAST_LIGHTNING,
    MCAST_FIRE_PILLAR, MCAST_GEYSER,
];
const mon_wizard_spells = [
    MCAST_PSI_BOLT, MCAST_CURE_SELF, MCAST_HASTE_SELF, MCAST_STUN_YOU,
    MCAST_DISAPPEAR, MCAST_WEAKEN_YOU, MCAST_DESTRY_ARMR, MCAST_CURSE_ITEMS,
    MCAST_AGGRAVATION, MCAST_SUMMON_MONS, MCAST_CLONE_WIZ, MCAST_DEATH_TOUCH,
];

// ---- Property helpers (youprop.h macros) ----
// Most C macros test (intrinsic | extrinsic) and respect a blocked alias only
// for the few properties that have one.  The helpers here follow the same
// structure, mirroring monmove.js and mhitu.js.
function heroProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

// Some properties have a blocked alias (Invis, Blind, etc.) -- this tests
// for the unblocked-active form.
function activeHeroProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean((value?.intrinsic || value?.extrinsic) && !value?.blocked);
}

// C ref: youprop.h Hallucination. `HHallucination && !Halluc_resistance`.
function Hallucination(state) {
    return heroProperty(state, HALLUC)
        && !heroProperty(state, HALLUC_RES);
}

// C ref: display.h canspotmon(). Inline test that does not require importing
// the full startup_a11y.js.  canseemon() || sensemon() -- sensemon is unported
// but only matters for monsters the hero senses without seeing.  For the
// adjacent-combat paths that reach castmu(), the hero virtually always can
// either see or is adjacent to the monster, so canseemon() covers every case
// the development sessions exercise.
function canspotmon(monster, state) {
    return canseemon(monster, state);
}

// ---- is_undirected_spell() ----
// C ref: mcastu.c is_undirected_spell() (899-905).
function is_undirected_spell(spellnum) {
    return (mcast_data[spellnum].flags & MCF_INDIRECT) !== 0;
}

// ---- spell_would_be_useless() ----
// C ref: mcastu.c spell_would_be_useless() (908-985).
function spell_would_be_useless(mtmp, spellnum, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2 };

    /* spell is only cast by hostile monsters */
    if ((mcast_data[spellnum].flags & MCF_HOSTILE) !== 0) {
        if (mtmp.mpeaceful) return true;
    }

    /* spell needs the monster to see hero */
    if ((mcast_data[spellnum].flags & MCF_SIGHT) !== 0) {
        if (!couldsee(mtmp.mx, mtmp.my, state)) return true;
    }

    switch (spellnum) {
    case MCAST_DEATH_TOUCH:
        if ((heroProperty(state, ANTIMAGIC) || Hallucination(state))
            && !random.rn2(2))
            return true;
        break;
    case MCAST_GEYSER:
        if (!random.rn2(5)) return true;
        break;
    case MCAST_CLONE_WIZ:
        if (!mtmp.iswiz
            || (state.context?.no_of_wizards ?? 0) > 1)
            return true;
        break;
    case MCAST_AGGRAVATION:
        // C calls has_aggravatables(), which is complex and unported.
        // Approximate with rn2(100) -- the same fallback C uses when
        // has_aggravatables() returns false.
        if (random.rn2(100)) return true;
        break;
    case MCAST_HASTE_SELF:
        if (mtmp.permspeed === MFAST) return true;
        break;
    case MCAST_DISAPPEAR:
        if (mtmp.minvis || mtmp.invis_blkd) return true;
        if (mtmp.mpeaceful && !heroProperty(state, SEE_INVIS)) return true;
        break;
    case MCAST_CURE_SELF:
        if (mtmp.mhp === mtmp.mhpmax) return true;
        break;
    case MCAST_BLIND_YOU:
        if (heroProperty(state, BLINDED)) return true;
        break;
    default:
        break;
    }
    return false;
}

// ---- choose_monster_spell() ----
// C ref: mcastu.c choose_monster_spell() (88-123).
function choose_monster_spell(mtmp, adtyp, env = {}) {
    const random = env.random ?? { rn2 };
    let list = null;

    if (adtyp === AD_SPEL) {
        list = mon_wizard_spells;
    } else if (adtyp === AD_CLRC) {
        list = mon_cleric_spells;
    }

    if (!list || list.length < 1) return MCAST_PSI_BOLT;

    const len = list.length;
    /* max spell level in this monster spell list */
    const maxlev = mcast_data[list[len - 1]].level;

    /* which level spell to cast? */
    let spellval = random.rn2(mtmp.m_lev);
    if (spellval > maxlev && random.rn2(maxlev))
        spellval = random.rn2(maxlev);

    /* find the highest spell in the list we could cast */
    for (let i = len - 1; i >= 0; i--) {
        if (mcast_data[list[i]].level <= spellval
            && !spell_would_be_useless(mtmp, list[i], env))
            return list[i];
    }

    /* or return the first spell in the list */
    return list[0];
}

// ---- cursetxt() ----
// C ref: mcastu.c cursetxt() (62-85).
// "feedback when frustrated monster couldn't cast a spell"
function cursetxt(mtmp, undirected, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2 };
    const message = env.message;

    if (canseemon(mtmp, state)
        && couldsee(mtmp.mx, mtmp.my, state)) {
        let point_msg;
        if (undirected) {
            point_msg = 'all around, then curses';
        } else if ((activeHeroProperty(state, INVIS)
                && !perceives(mtmp.data)
                && (mtmp.mux !== state.u.ux || mtmp.muy !== state.u.uy))
            || (state.youmonst?.m_ap_type === 10 /* M_AP_OBJECT */
                && state.youmonst?.mappearance === 63 /* STRANGE_OBJECT */)
            || state.u?.uundetected) {
            point_msg = 'and curses in your general direction';
        } else if (activeHeroProperty(state, DISPLACED)
                && (mtmp.mux !== state.u.ux || mtmp.muy !== state.u.uy)) {
            point_msg = 'and curses at your displaced image';
        } else {
            point_msg = 'at you, then curses';
        }
        if (message) {
            message(
                `${env.monsterName?.(mtmp)
                    ?? capitalizedMonsterNameFallback(mtmp, state)
                } points ${point_msg}.`,
                state,
            );
        }
    } else if (!(state.moves % 4) || !random.rn2(4)) {
        if (!heroProperty(state, DEAF) && message) {
            // C uses Norep() here, which suppresses repeated identical lines.
            // Norep is not ported; plain message is acceptable because this
            // code path runs at most once per spell attempt.
            message('You hear a mumbled curse.', state);
        }
    }
}

// Minimal name formatter when the caller does not supply one.
function capitalizedMonsterNameFallback(mtmp, state) {
    // Use the same function mhitu.js uses, but avoid importing do_name.js
    // at module scope to reduce the chance of import cycles.  The caller
    // typically injects monsterName through env.
    const name = mtmp.data?.pmnames?.[2]
        ?? mtmp.data?.pmnames?.[0]
        ?? 'something';
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

// C ref: mondata.c cvt_adtyp_to_mseenres() -- already exported from
// js/mondata.js, but we also need m_seenres() which is a simple macro.
function m_seenres(mtmp, mask) {
    return (mtmp.seen_resistance & mask) !== 0;
}

// ---- castmu() ----
// C ref: mcastu.c castmu() (129-305).
// return values: M_ATTK_HIT (successful spell), M_ATTK_MISS (unsuccessful).
export async function castmu(
    mtmp,
    mattk,
    thinks_it_foundyou,
    foundyou,
    rawEnv = {},
) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2, d };
    const unsupported = rawEnv.unsupported;
    const message = rawEnv.message;
    const env = { ...rawEnv, state, random };
    const ml = mtmp.m_lev;
    let spellnum = 0;

    // Three cases: monster attacking, thinks it's attacking, or not trying.
    if ((mattk.adtyp === AD_SPEL || mattk.adtyp === AD_CLRC) && ml) {
        let cnt = 40;

        do {
            spellnum = choose_monster_spell(mtmp, mattk.adtyp, env);
            /* not trying to attack?  don't allow directed spells */
            if (!thinks_it_foundyou) {
                if (!is_undirected_spell(spellnum)
                    || spell_would_be_useless(mtmp, spellnum, env)) {
                    return M_ATTK_MISS;
                }
                break;
            }
        } while (--cnt > 0
            && spell_would_be_useless(mtmp, spellnum, env));
        if (cnt === 0) return M_ATTK_MISS;
    }

    /* monster unable to cast spells? */
    if (mtmp.mcan || mtmp.mspec_used || !ml
        || m_seenres(mtmp, cvt_adtyp_to_mseenres(mattk.adtyp))) {
        cursetxt(mtmp, is_undirected_spell(spellnum), env);
        return M_ATTK_MISS;
    }

    if (mattk.adtyp === AD_SPEL || mattk.adtyp === AD_CLRC) {
        /* monst->m_lev is unsigned (uchar), monst->mspec_used is int */
        mtmp.mspec_used = ml < 8 ? (10 - ml) : 2;
    }

    /* Monster can cast spells, but is casting a directed spell at the
     * wrong place? */
    if (!foundyou && thinks_it_foundyou
        && !is_undirected_spell(spellnum)) {
        if (message) {
            const casterName = canseemon(mtmp, state)
                ? (env.monsterName?.(mtmp)
                    ?? capitalizedMonsterNameFallback(mtmp, state))
                : 'Something';
            message(`${casterName} casts a spell at thin air!`, state);
        }
        return M_ATTK_MISS;
    }

    nomul(0, state);
    if (random.rn2(ml * 10) < (mtmp.mconf ? 100 : 20)) {
        /* fumbled attack */
        if (canseemon(mtmp, state) && !heroProperty(state, DEAF)
            && message) {
            message(
                `The air crackles around ${
                    env.monnam?.(mtmp)
                    ?? monnamFallback(mtmp, state)
                }.`,
                state,
            );
        }
        return M_ATTK_MISS;
    }

    if (canspotmon(mtmp, state) || !is_undirected_spell(spellnum)) {
        if (message) {
            const casterName = canspotmon(mtmp, state)
                ? (env.monsterName?.(mtmp)
                    ?? capitalizedMonsterNameFallback(mtmp, state))
                : 'Something';
            let target;
            if (is_undirected_spell(spellnum)) {
                target = '';
            } else if (activeHeroProperty(state, INVIS)
                    && !perceives(mtmp.data)
                    && !u_at(mtmp.mux, mtmp.muy, state)) {
                target = ' at a spot near you';
            } else if (activeHeroProperty(state, DISPLACED)
                    && !u_at(mtmp.mux, mtmp.muy, state)) {
                target = ' at your displaced image';
            } else {
                target = ' at you';
            }
            message(`${casterName} casts a spell${target}!`, state);
        }
    }

    let dmg;
    if (!foundyou) {
        dmg = 0;
        if (mattk.adtyp !== AD_SPEL && mattk.adtyp !== AD_CLRC) {
            // impossible() in C
            return M_ATTK_MISS;
        }
    } else if (mattk.damd) {
        dmg = random.d(
            Math.trunc(ml / 2) + mattk.damn, mattk.damd,
        );
    } else {
        dmg = random.d(Math.trunc(ml / 2) + 1, 6);
    }
    if (heroProperty(state, HALF_SPDAM))
        dmg = Math.trunc((dmg + 1) / 2);

    const ret = M_ATTK_HIT;

    switch (mattk.adtyp) {
    case AD_SPEL: /* wizard spell */
    case AD_CLRC: /* clerical spell */
        await mcast_spell(mtmp, dmg, spellnum, env);
        dmg = 0; /* done by the spell casting functions */
        break;
    default:
        // AD_FIRE, AD_COLD, AD_MAGM are ranged-only attack types.
        // Adjacent AT_MAGC attacks always carry AD_SPEL or AD_CLRC.
        if (typeof unsupported === 'function') {
            unsupported('castmu() elemental spell type');
        }
        dmg = 0;
        break;
    }

    if (dmg) {
        // mdamageu() is in mhitu.js; only reached when a spell effect
        // sets dmg > 0.  Individual spell effects are ported as needed.
        if (typeof unsupported === 'function') {
            unsupported('castmu() direct damage (mdamageu)');
        }
    }
    return ret;
}

// Lowercase monster name fallback for "the air crackles around <mon_nam>".
function monnamFallback(mtmp, state) {
    const name = mtmp.data?.pmnames?.[2]
        ?? mtmp.data?.pmnames?.[0]
        ?? 'something';
    return `the ${name}`;
}

// ---- Individual spell effect functions ----

// C ref: mcastu.c mcast_psi_bolt() (600-621).
function mcast_psi_bolt(dmg, env = {}) {
    const state = env.state ?? game;
    const message = env.message;

    if (heroProperty(state, ANTIMAGIC)) {
        // shieldeff(u.ux, u.uy) -- display animation, no game state change
        monstseesu(M_SEEN_MAGR, state);
        dmg = Math.trunc((dmg + 1) / 2);
    } else {
        monstunseesu(M_SEEN_MAGR, state);
    }
    if (message) {
        if (dmg <= 5) {
            message(
                `You get a slight ${body_part(HEAD, state.youmonst)}ache.`,
                state,
            );
        } else if (dmg <= 10) {
            message('Your brain is on fire!', state);
        } else if (dmg <= 20) {
            message(
                `Your ${body_part(HEAD, state.youmonst)} suddenly aches painfully!`,
                state,
            );
        } else {
            message(
                `Your ${body_part(HEAD, state.youmonst)} suddenly aches very painfully!`,
                state,
            );
        }
    }
    return dmg;
}

// C ref: mcastu.c mcast_open_wounds() (623-642).
function mcast_open_wounds(dmg, env = {}) {
    const state = env.state ?? game;
    const message = env.message;

    if (heroProperty(state, ANTIMAGIC)) {
        // shieldeff(u.ux, u.uy) -- display animation, no game state change
        monstseesu(M_SEEN_MAGR, state);
        dmg = Math.trunc((dmg + 1) / 2);
    } else {
        monstunseesu(M_SEEN_MAGR, state);
    }
    if (message) {
        if (dmg <= 5) {
            message('Your skin itches badly for a moment.', state);
        } else if (dmg <= 10) {
            message('Wounds appear on your body!', state);
        } else if (dmg <= 20) {
            message('Severe wounds appear on your body!', state);
        } else {
            message('Your body is covered with painful wounds!', state);
        }
    }
    return dmg;
}

// C ref: mcastu.c m_cure_self() (307-318).
function m_cure_self(mtmp, dmg, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { d };
    const message = env.message;

    if (mtmp.mhp < mtmp.mhpmax) {
        if (canseemon(mtmp, state) && message) {
            message(
                `${env.monsterName?.(mtmp)
                    ?? capitalizedMonsterNameFallback(mtmp, state)
                } looks better.`,
                state,
            );
        }
        /* note: player healing does 6d4; this used to do 1d8 */
        healmon(mtmp, random.d(3, 6), 0);
        dmg = 0;
    }
    return dmg;
}

// ---- mcast_spell() ----
// C ref: mcastu.c mcast_spell() (800-897).
// Dispatches to individual spell effects.  Effects are ported as the running
// game exercises them; unexercised cases throw unsupported.
async function mcast_spell(mtmp, dmg, spellnum, env = {}) {
    const unsupported = env.unsupported;
    const mdamageu = env.mdamageu;

    if (dmg < 0) return; /* impossible() in C */
    if (dmg === 0 && !is_undirected_spell(spellnum)) return;

    // Each case either sets dmg to 0 or returns a new dmg.
    // The only cases that leave dmg > 0 call mdamageu() at the end.
    let resultDmg = 0;

    switch (spellnum) {
    case MCAST_PSI_BOLT:
        resultDmg = mcast_psi_bolt(dmg, env);
        break;
    case MCAST_OPEN_WOUNDS:
        resultDmg = mcast_open_wounds(dmg, env);
        break;
    case MCAST_CURE_SELF:
        resultDmg = m_cure_self(mtmp, dmg, env);
        break;
    case MCAST_DEATH_TOUCH:
    case MCAST_CLONE_WIZ:
    case MCAST_SUMMON_MONS:
    case MCAST_AGGRAVATION:
    case MCAST_CURSE_ITEMS:
    case MCAST_DESTRY_ARMR:
    case MCAST_WEAKEN_YOU:
    case MCAST_DISAPPEAR:
    case MCAST_STUN_YOU:
    case MCAST_HASTE_SELF:
    case MCAST_GEYSER:
    case MCAST_FIRE_PILLAR:
    case MCAST_LIGHTNING:
    case MCAST_INSECTS:
    case MCAST_BLIND_YOU:
    case MCAST_PARALYZE:
    case MCAST_CONFUSE_YOU:
        if (typeof unsupported === 'function') {
            unsupported(`mcast_spell effect ${spellnum}`);
        }
        resultDmg = 0;
        break;
    default:
        // impossible() in C
        resultDmg = 0;
        break;
    }

    if (resultDmg) {
        if (typeof mdamageu === 'function') {
            await mdamageu(mtmp, resultDmg);
        } else if (typeof unsupported === 'function') {
            unsupported('mcast_spell mdamageu');
        }
    }
}
