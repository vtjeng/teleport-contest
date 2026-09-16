// Hero-versus-monster interaction owned by uhitm.c.

import {
    ART_CLEAVER,
    ART_GIANTSLAYER,
    ART_OGRESMASHER,
    ART_SNICKERSNEE,
    ART_TROLLSBANE,
    artifact_hit,
    artifact_light,
    permapoisoned,
    shade_glare,
} from './artifacts.js';
import { adjalign, exercise } from './attrib.js';
import {
    A_DEX,
    A_LAWFUL,
    A_STR,
    A_WIS,
    ACID_RES,
    ARTICLE_THE,
    BLINDED,
    CONFUSION,
    DEAF,
    DISMOUNT_POLY,
    FACE,
    HALLUC,
    HALLUC_RES,
    HMON_APPLIED,
    HMON_MELEE,
    HMON_KICKED,
    HMON_THROWN,
    LL_CONDUCT,
    IS_DOOR,
    Is_airlevel,
    Is_waterlevel,
    M_ATTK_AGR_DIED,
    M_ATTK_AGR_DONE,
    M_ATTK_DEF_DIED,
    M_ATTK_HIT,
    M_ATTK_MISS,
    RLOC_MSG,
    RLOC_NOMSG,
    M_SEEN_COLD,
    M_SEEN_ELEC,
    NATTK,
    NOTELL,
    NEED_WEAPON,
    P_BARE_HANDED_COMBAT,
    P_BASIC,
    P_KNIFE,
    P_LANCE,
    P_NONE,
    POTHIT_HERO_BASH,
    POTHIT_HERO_THROW,
    P_SKILLED,
    P_WHIP,
    POISON_RES,
    STONE_RES,
    SHOCK_RES,
    DETECT_MONSTERS,
    EXACT_NAME,
    MIM_REVEAL,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    PROT_FROM_SHAPE_CHANGERS,
    SEE_INVIS,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
    STUNNED,
    TIMEOUT,
    TEST_MOVE,
    W_ARMG,
    W_RINGL,
    W_RINGR,
    W_SADDLE,
    engulfing_u,
    helpless,
    isok,
    ismnum,
    M_AP_TYPE,
    HAND,
    NO_TRAP_FLAGS,
    MAX_EGG_HATCH_TIME,
    NEUTRAL,
    CXN_ARTICLE,
    CXN_PFX_THE,
    XKILL_NOMSG,
    something,
    Upolyd,
} from './const.js';
import {
    Adjmonnam,
    a_monnam,
    capitalizedAlwaysVisibleMonsterName,
    capitalizedMonsterName,
    l_monnam,
    mon_nam,
    Monnam,
    monsterCommonName,
    monsterPossessive,
    pmname,
    x_monnam,
} from './do_name.js';
import { livelog_printf } from './pline.js';
import { ttyPline } from './tty_message.js';
import { makeplural } from './fruit.js';
import {
    glyph_at,
    glyph_is_cmap,
    glyph_is_invisible,
    glyph_is_monster,
    glyph_is_object,
    glyph_to_cmap,
    glyph_to_mon,
    glyph_to_obj,
    map_invisible,
    newsym,
} from './display.js';
import { u_wipe_engr } from './engrave.js';
import { game } from './gstate.js';
import { doorless_door, test_move } from './hack.js';
import { ing_suffix, s_suffix, sgn } from './hacklib.js';
import { change_luck } from './moveloop_preamble.js';
import { will_hurtle } from './dothrow.js';
// js/mhitu.js imports mhitm_adtyping() and mhitm_knockback() from this file,
// so this edge closes an import cycle, exactly as mhitu.c and uhitm.c call
// into each other. Both bindings are hoisted function declarations, which an
// ES module cycle initializes before either module body runs, and nothing here
// reads them at module scope.
import { hitmsg, m_next2u, magic_negation } from './mhitu.js';
import { abuse_dog } from './dog.js';
import {
    angry_guards,
    killed,
    m_carrying,
    seemimic,
    setmangry,
    set_ustuck,
    wakeup,
    xkilled,
} from './mon.js';
import {
    amorphous,
    attacktype,
    can_blnd,
    dmgtype,
    gender,
    haseyes,
    hides_under,
    is_animal,
    is_demon,
    is_floater,
    is_flyer,
    is_orc,
    is_undead,
    is_vampshifter,
    is_watch,
    is_whirly,
    mon_hates_blessings,
    mon_hates_light,
    mon_hates_silver,
    hates_silver,
    monsndx,
    monstseesu,
    monstunseesu,
    noncorporeal,
    monster_resists_element,
    passes_rocks,
    sticks,
    thick_skinned,
    touch_petrifies,
} from './mondata.js';
import {
    monflee,
    monfleeMessage,
    onscary,
    set_apparxy,
} from './monmove.js';
import { m_at } from './monst.js';
import {
    AD_ACID,
    AD_BLND,
    AD_COLD,
    AD_CONF,
    AD_CORR,
    AD_CURS,
    AD_DCAY,
    AD_DETH,
    AD_DGST,
    AD_DISE,
    AD_DRCO,
    AD_DRDX,
    AD_DREN,
    AD_DRIN,
    AD_DRLI,
    AD_DRST,
    AD_ELEC,
    AD_ENCH,
    AD_FAMN,
    AD_FIRE,
    AD_HALU,
    AD_HEAL,
    AD_LEGS,
    AD_PEST,
    AD_PHYS,
    AD_PLYS,
    AD_POLY,
    AD_RUST,
    AD_SAMU,
    AD_SEDU,
    AD_SGLD,
    AD_SITM,
    AD_SLEE,
    AD_SLIM,
    AD_SLOW,
    AD_SSEX,
    AD_STCK,
    AD_STON,
    AD_STUN,
    AD_TLPT,
    AD_WERE,
    AD_WRAP,
    AT_BITE,
    AT_BUTT,
    AT_CLAW,
    AT_ENGL,
    AT_SPIT,
    AT_GAZE,
    AT_HUGS,
    AT_KICK,
    AT_NONE,
    AT_TUCH,
    AT_WEAP,
    PM_BARBARIAN,
    PM_BLACK_PUDDING,
    PM_BROWN_PUDDING,
    PM_ELF,
    PM_HEALER,
    PM_KNIGHT,
    PM_MONK,
    PM_AMOROUS_DEMON,
    PM_ARCHON,
    PM_BALROG,
    PM_FLOATING_EYE,
    PM_IRON_GOLEM,
    PM_PYROLISK,
    PM_PURPLE_WORM,
    PM_ROGUE,
    PM_SAMURAI,
    PM_SHADE,
    PM_SHRIEKER,
    PM_STEAM_VORTEX,
    S_BLOB,
    S_EEL,
    S_EYE,
    S_FUNGUS,
    S_LEPRECHAUN,
    S_MIMIC,
    S_NYMPH,
    S_TROLL,
} from './monsters.js';
import {
    carried,
    is_ammo,
    ammo_and_launcher,
    greatest_erosion,
    is_launcher,
    is_missile,
    is_weptool,
    mksobj,
    is_flimsy,
    is_shield,
    is_wet_towel,
    place_object,
    splitobj,
    objectType,
    stone_missile,
    weight,
} from './obj.js';
import { add_to_minv, carrying, freeinv, obfree, useup, useupall } from './invent.js';
import { clone_mon, grow_up } from './makemon.js';
import {
    an,
    bare_artifactname,
    cxname,
    corpse_xname,
    donameFresh,
    is_plural,
    obj_is_pname,
    otense,
    simpleonames,
    The,
    vtense,
    yname,
    Yobjnam2,
    ysimple_name as ysimpleName,
    mshot_xname,
    isPoisonable,
} from './objnam.js';
import {
    ACID_VENOM,
    BLINDING_VENOM,
    BOOMERANG,
    BOULDER,
    CLOVE_OF_GARLIC,
    CORPSE,
    CREAM_PIE,
    EGG,
    ELVEN_ARROW,
    EXPENSIVE_CAMERA,
    GAUNTLETS_OF_POWER,
    GEM_CLASS,
    HEAVY_IRON_BALL,
    IRON,
    IRON_CHAIN,
    KATANA,
    LOADSTONE,
    METAL,
    MIRROR,
    NO_MATERIAL,
    PAPER,
    POTION_CLASS,
    ROCK,
    SILVER,
    SPBOOK_CLASS,
    VEGGY,
    WEAPON_CLASS,
    WHACK,
    YA,
    YUMI,
} from './objects.js';
import { encumber_msg } from './pickup.js';
import { make_blinded, potionhit } from './potion.js';
import { d, rn1, rn2, rnl, rnd } from './rng.js';
import {
    canSeeMonster,
    canSpotMonster,
    heroIsBlind,
    sensesMonster,
    sensesMonsterWithoutDetection,
} from './startup_a11y.js';
import { P_SKILL, weapon_type } from './startup_skills.js';
import {
    UnsupportedWeaponSkillError,
    abon,
    dbon,
    dmgval,
    hitval,
    martial_bonus,
    special_dmgval,
    use_skill,
    uwep_skill_type,
    weapon_dam_bonus,
    weapon_hit_bonus,
    mwepgone,
    possibly_unwield,
} from './weapon.js';
import { can_twoweapon, cantwield } from './wield.js';
import {
    bimanual,
    extract_from_minvent,
    find_mac,
    is_pole,
    setuwep,
    which_armor,
} from './worn.js';
import { steal } from './steal.js';
import { rloc, tele_restrict } from './teleport.js';
import { Flying, Levitation, is_pool } from './trap.js';
import { mintrap } from './trap_effects.js';
import { mselftouch } from './trap_effects.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { destroy_items } from './zap_destroy_items.js';
import { Cold_resistance, exclam, hit, resist } from './zap.js';
import { note_unported } from './unported.js';
import { cansee, canseemon } from './vision.js';
import { body_part, mbodypart } from './polyself.js';
import { observe_object } from './o_init.js';
import { obj_resists } from './bury.js';

function intrinsicProperty(hero, index) {
    return Boolean(hero?.uprops?.[index]?.intrinsic);
}

function propertyPresent(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: youprop.h:120 Hallucination, over :116-119. HHallucination is the
// intrinsic alone -- no worn item confers hallucination, so there is no
// EHallucination term -- while Halluc_resistance is the intrinsic or the
// extrinsic. Both readers below take the macro from here, because uhitm.c
// spells it the same way at 300 as display.h is_safemon() does.
function Hallucination(state) {
    return intrinsicProperty(state?.u, HALLUC)
        && !propertyPresent(state?.u, HALLUC_RES);
}

// C ref: display.h is_safemon().
export function is_safemon(monster, state = game) {
    const hero = state.u;
    return Boolean(
        state.flags?.safe_dog
        && monster?.mpeaceful
        && canSpotMonster(monster, state)
        && !intrinsicProperty(hero, CONFUSION)
        && !Hallucination(state)
        && !intrinsicProperty(hero, STUNNED),
    );
}

function requireAttackOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`do_attack requires ${name}`);
    return operation;
}

// C ref: uhitm.c mhitm_mgc_atk_negated() (74-98). Whether the defender's
// magic cancellation thwarts the attack before its damage type is applied.
//
// `verbosely` is C's. Every ported call site passes TRUE, and so do most of
// C's; mhitm_ad_dren():2422, mhitm_ad_drst():3126 and mhitm_ad_stck():3310 are
// three of the arms that pass FALSE, and none of them is ported.
//
// The draw is unconditional once the attacker is uncancelled, so a defender
// with no cancellation at all still spends it: `rn2(10) >= 0` is always true,
// which is why an unarmored hero is never spared and the roll still shows in
// the log.
export async function mhitm_mgc_atk_negated(
    magr,
    mdef,
    verbosely,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2 };
    const message = requireAttackOperation(env, 'message');

    /* mcan doesn't apply to youmonst; hero can't be cancelled */
    if (magr !== state.youmonst && magr.mcan)
        return true; /* no message if attacker has been cancelled */

    const armpro = magic_negation(mdef, state);
    const negated = !(random.rn2(10) >= 3 * armpro);
    if (negated) {
        /* attack has been thwarted by negation, aka magical cancellation */
        if (verbosely) {
            // C's second arm, `else if (gv.vis && canseemon(mdef))`, announces
            // a monster defender's escape. magic_negation() above covers the
            // hero alone and throws for a monster, so that arm is unreachable
            // and is left out rather than restated.
            await message('You avoid harm.', state);
        }
        return true;
    }
    return false;
}

// C ref: uhitm.c that_is_a_mimic() (6199-6276). Builds and prints the message
// that tells the hero what the mimic really is. Four format branches (cmap,
// object, monster, blind) choose the format string, and four what-branches
// (invisible, M_AP_MONSTER, sleeping S_MIMIC, default) choose the substitute.
// `mimic_flags` carries MIM_REVEAL and MIM_OMIT_WAIT.
async function that_is_a_mimic(mtmp, mimic_flags, state = game, env = {}) {
    const S_trapped_chest = 73; // defsym.h PCHAR 73
    const reveal_it = (mimic_flags & MIM_REVEAL) !== 0;
    const omit_wait = (mimic_flags & 2 /* MIM_OMIT_WAIT */) !== 0;
    const generic = 'a monster';
    let fmtbuf = "Wait!  That's %s!";
    let what = null;

    if (heroIsBlind(state)) {
        // Blind: default format unless the hero has blind telepathy and the
        // mimic is disguised as a monster (in which case it looks different
        // from what was sensed).
        const Blind_telepat = Boolean(
            state.u?.uprops?.[30 /* TELEPAT */]?.intrinsic
            || state.u?.uprops?.[30]?.extrinsic);
        if (!Blind_telepat) {
            what = generic;
        } else if (M_AP_TYPE(mtmp) === M_AP_MONSTER) {
            what = a_monnam(mtmp, { state });
        }
    } else {
        const x = mtmp.mx, y = mtmp.my;
        const glyph = glyph_at(x, y, state);

        if (glyph_is_cmap(glyph)) {
            const sym = glyph_to_cmap(glyph);
            if (M_AP_TYPE(mtmp) === M_AP_FURNITURE
                || (M_AP_TYPE(mtmp) === M_AP_OBJECT
                    && sym === S_trapped_chest)) {
                const explanation = CMAP_EXPLANATIONS[sym] ?? 'something';
                fmtbuf = `That ${explanation} actually is %s!`;
            }
        } else if (glyph_is_object(glyph)) {
            // C ref: pager.c object_from_map() line 317.
            const otyp = glyph_to_obj(glyph);
            const otmp = mksobj(otyp, false, false, { state });
            const otmp_name = simpleonames(otmp, state);
            const those = is_plural(otmp) ? 'Those' : 'That';
            const verb = otense(otmp, 'are');
            fmtbuf = `${those} ${otmp_name} ${verb} %s!`;
        } else if (glyph_is_monster(glyph)) {
            const mndx = glyph_to_mon(glyph);
            const mtmp_name = pmname(
                state.mons?.[mndx] ?? mtmp.data, gender(mtmp));
            fmtbuf = `Wait!  That ${mtmp_name} is really %s!`;
        }

        // Determine what the mimic really is.
        if (mtmp.minvis && !propertyPresent(state.u, SEE_INVIS)) {
            what = generic;
        } else if (M_AP_TYPE(mtmp) === M_AP_MONSTER) {
            what = x_monnam(mtmp, 2 /* ARTICLE_A */, null, EXACT_NAME, true,
                state);
        } else if (mtmp.data?.mlet === S_MIMIC
            && (M_AP_TYPE(mtmp) === M_AP_OBJECT
                || M_AP_TYPE(mtmp) === M_AP_FURNITURE)
            && (mtmp.msleeping || mtmp.mfrozen)) {
            what = x_monnam(mtmp, 2 /* ARTICLE_A */, 'sleeping', 0, false,
                state);
        } else {
            what = a_monnam(mtmp, { state });
        }
    }

    if (what) {
        const i = (omit_wait && fmtbuf.startsWith('Wait!  ')) ? 7 : 0;
        await env.pline?.(fmtbuf.substring(i).replace('%s', what), state);
    }
    if (reveal_it)
        seemimic(mtmp, state);
}

// C ref: uhitm.c stumble_onto_mimic() (6281-6297). Called when the hero moves
// into a square occupied by a mimicking monster. Prints the identification
// message, optionally sticks the hero, wakes the mimic, and marks the square
// invisible if the hero still cannot spot it.
export async function stumble_onto_mimic(mtmp, state = game, env = {}) {
    await that_is_a_mimic(mtmp, MIM_REVEAL, state, env);

    if (!state.u.ustuck && !mtmp.mflee && dmgtype(mtmp.data, AD_STCK)
        && m_next2u(mtmp, state)) {
        set_ustuck(mtmp, state);
    }

    await wakeup(mtmp, false, env);

    if (!canSpotMonster(mtmp, state)
        && !glyph_is_invisible(
            state.level?.at(mtmp.mx, mtmp.my)?.glyph)) {
        map_invisible(mtmp.mx, mtmp.my, state);
    }
}

// C ref: uhitm.c attack_checks() (188-327). FALSE means it is fine to attack.
// The ordinary melee case -- a spotted, undisguised, hostile target -- reaches
// the closing `return FALSE` at 326 having done nothing but clear the wait
// strategy at 196.
//
// The force-fight arm at 201-214 returns FALSE above every arm below.
//
// Remaining unsupported arms:
//   198-199  engulfing_u(): ported, returns false immediately.
//   308-324  paranoid_query() for a peaceful target, and the Stormbringer
//            override above it.
export async function attack_checks(mtmp, wep, state = game, env = {}) {
    const unsupported = requireAttackOperation(env, 'unsupported');

    mtmp.mstrategy &= ~STRAT_WAITMASK;

    if (engulfing_u(mtmp, state)) return false;

    if (state.context?.forcefight) {
        // dokick.c sets forcefight so a kick can reach an invisible target.
        // C's force-fight arm returns immediately, regardless of visibility.
        return false;
    }

    // 220: cache the shown glyph for the visibility and mimic tests below.
    // hack.c stores the destination in gb.bhitpos before calling do_attack().
    const bhitpos = state.gb?.bhitpos ?? { x: mtmp.mx, y: mtmp.my };
    const glyph = glyph_at(bhitpos.x, bhitpos.y, state);

    // glyph_is_warning() is constantly false in this port: a warning glyph
    // needs a warning level this port never raises.

    // 230-252: a target the hero cannot spot, not hidden under something.
    if (!canSpotMonster(mtmp, state)
        && !glyph_is_invisible(glyph)
        && !(!(heroIsBlind(state)) && mtmp.mundetected
            && hides_under(mtmp.data))) {
        const message = requireAttackOperation(env, 'message');
        await message(
            `Wait!  There's ${something} there you can't see!`,
            state,
        );
        map_invisible(bhitpos.x, bhitpos.y, state);
        // An unseen mimic is treated as though the hero stumbled onto a
        // visible mimic, including the source's adjacent-sticking check.
        if (M_AP_TYPE(mtmp)
            && !propertyPresent(state.u, PROT_FROM_SHAPE_CHANGERS)
            && !state.u.ustuck && !mtmp.mflee
            && dmgtype(mtmp.data, AD_STCK)
            && m_next2u(mtmp, state)) {
            set_ustuck(mtmp, state);
        }
        // C passes TRUE so the attempted attack wakes and angers the target.
        await wakeup(mtmp, true, { ...env, state });
        return true;
    }

    // 254-266: a mimicking target the hero cannot sense.
    if (M_AP_TYPE(mtmp)
        && !propertyPresent(state.u, PROT_FROM_SHAPE_CHANGERS)
        && !sensesMonster(mtmp, state)) {
        if (glyph_is_invisible(glyph)) {
            // If a hidden mimic was where the player remembers an unseen
            // monster, the player is in luck -- attacks it even though hidden.
            seemimic(mtmp, state);
            return false;
        }
        const pline = requireAttackOperation(env, 'message');
        await stumble_onto_mimic(mtmp, state, { ...env, pline });
        return true;
    }

    // 268-297: a hidden or submerged monster the hero cannot see.
    if (mtmp.mundetected && !canSeeMonster(mtmp, state)
        && (hides_under(mtmp.data) || mtmp.data?.mlet === S_EEL)) {
        mtmp.mundetected = 0;
        mtmp.msleeping = 0;
        newsym(mtmp.mx, mtmp.my);
        if (glyph_is_invisible(glyph)) {
            seemimic(mtmp, state);
            return false;
        }
        // tp_sensemon: sensesMonsterWithoutDetection covers the same
        // telepathy and warn-of-monster tests, with the swallowed/underwater
        // gates that C's sensemon() wrapper adds.
        if (!sensesMonsterWithoutDetection(mtmp, state)
            && !propertyPresent(state.u, DETECT_MONSTERS)) {
            const pline = requireAttackOperation(env, 'message');
            const lmonbuf = l_monnam(mtmp, state);
            const notseen = lmonbuf === 'it';
            if (!heroIsBlind(state) && Hallucination(state)) {
                await pline(`A ${mtmp.mtame ? 'tame' : 'wild'} `
                    + `${notseen ? 'creature' : lmonbuf} `
                    + `${notseen ? 'is present' : 'appears'}!`, state);
            } else if (heroIsBlind(state)
                || (is_pool(mtmp.mx, mtmp.my, state)
                    && !state.u.uinwater)) {
                await pline("Wait!  There's a hidden monster there!", state);
            } else {
                const obj = state.level?.objects?.[mtmp.mx]?.[mtmp.my];
                if (obj) {
                    const name = notseen
                        ? something : an(lmonbuf);
                    await pline(`Wait!  There's ${name} hiding under `
                        + `${donameFresh(obj, state)}!`, state);
                }
            }
            return true;
        }
    }

    // 303-306: wake up a disguised or hidden monster the hero can sense.
    if ((mtmp.mundetected || M_AP_TYPE(mtmp)) && sensesMonster(mtmp, state)) {
        mtmp.mundetected = 0;
        await wakeup(mtmp, true, env);
    }

    if (state.flags?.confirm && mtmp.mpeaceful
        && !intrinsicProperty(state.u, CONFUSION)
        && !Hallucination(state)
        && !intrinsicProperty(state.u, STUNNED)) {
        unsupported('confirming an attack on a peaceful monster');
    }

    return false;
}

// C ref: uhitm.c check_caitiff() (330-347). A Knight who strikes a helpless or
// fleeing target, or a Samurai who strikes a peaceful one, loses an alignment
// point. Both arms print through the caller's message operation and call
// attrib.c adjalign(-1), whose loss arm updates the alignment abuse state and
// reaches mon.c adj_erinys(). Every other hero runs the whole function and
// changes nothing.
export async function check_caitiff(mtmp, state = game, env = {}) {
    const u = state.u;
    if (u.ualign.record <= -10) return;

    const role = state.urole?.mnum;
    if (role === PM_KNIGHT && u.ualign.type === A_LAWFUL
        && !is_undead(mtmp.data)
        && (helpless(mtmp) || (mtmp.mflee && !mtmp.mavenge))) {
        const message = requireAttackOperation(env, 'message');
        await message('You caitiff!', state);
        adjalign(-1, state);
    } else if (role === PM_SAMURAI && mtmp.mpeaceful) {
        const message = requireAttackOperation(env, 'message');
        await message('You dishonorably attack the innocent!', state);
        adjalign(-1, state);
    }
}

// C ref: uhitm.c mon_maybe_unparalyze() (350-359). A paralyzed target has one
// chance in ten of shaking it off as the blow arrives. A target that can move
// never reaches the draw.
export function mon_maybe_unparalyze(mtmp, random = { rn2 }) {
    if (!mtmp.mcanmove) {
        if (!random.rn2(10)) {
            mtmp.mcanmove = 1;
            mtmp.mfrozen = 0;
        }
    }
}

// C ref: uhitm.c find_roll_to_hit() (363-427). How easy the hero finds it to
// hit `mtmp`; larger is easier, and the caller compares it with rnd(20). It
// makes no random-number call of its own.
//
// C writes *attk_count and *role_roll_penalty through pointers. `counters`
// carries both: `attknum` in and out, `role_roll_penalty` out.
//
// Its two maybe_polyd() reads, at 383 and 400, take their unpolymorphed
// halves, because polyself is unported and Upolyd() is constantly false;
// js/regen.js:52 records the same fact.
//
// The AT_KICK arm at 424-425 contributes the martial-arts weapon-hit bonus.
export async function find_roll_to_hit(
    mtmp,
    aatyp,
    weapon,
    counters,
    state = game,
    env = {},
) {
    const u = state.u;
    counters.role_roll_penalty = 0; /* default is `none' */

    // you.h: Luck is the sum of u.uluck and u.moreluck.
    const luck = (u.uluck ?? 0) + (u.moreluck ?? 0);
    let tmp = 1 + abon(state) + find_mac(mtmp, state) + u.uhitinc
        + (sgn(luck) * Math.trunc((Math.abs(luck) + 2) / 3))
        + u.ulevel;

    /* some actions should occur only once during multiple attacks */
    if (!counters.attknum++) {
        /* knight's chivalry or samurai's giri */
        await check_caitiff(mtmp, state, env);
    }

    /* adjust vs. monster state */
    if (mtmp.mstun) tmp += 2;
    if (mtmp.mflee) tmp += 2;
    if (mtmp.msleeping) tmp += 2;
    if (!mtmp.mcanmove) tmp += 4;

    /* role/race adjustments */
    if (state.urole?.mnum === PM_MONK) {
        if (state.uarm) {
            counters.role_roll_penalty = state.urole.spelarmr;
            tmp -= counters.role_roll_penalty;
        } else if (!state.uwep && !state.uarms) {
            tmp += Math.trunc(u.ulevel / 3) + 2;
        }
    }
    if (is_orc(mtmp.data) && state.urace?.mnum === PM_ELF) tmp++;

    /* encumbrance: with a lot of luggage, your agility diminishes */
    const tmp2 = requireAttackOperation(env, 'nearCapacity')(state);
    if (tmp2 !== 0) tmp -= (tmp2 * 2) - 1;
    if (u.utrap) tmp -= 3;

    /*
     * hitval applies if making a weapon attack while wielding a weapon;
     * weapon_hit_bonus applies if doing a weapon attack even bare-handed
     * or if kicking as martial artist
     */
    if (aatyp === AT_WEAP || aatyp === AT_CLAW) {
        if (weapon) tmp += hitval(weapon, mtmp, state, env);
        tmp += weapon_hit_bonus(weapon, state);
    } else if (aatyp === AT_KICK && martial_bonus(state)) {
        tmp += weapon_hit_bonus(null, state);
    }

    return tmp;
}

// C ref: uhitm.c do_attack() (446-583). The hero moves into a square holding a
// monster. Returns TRUE when the step is used up.
//
// The `is_safemon(mtmp) && !forcefight` arm at 461-509 covers safe peaceful
// monsters as well as tame pets. Result false lets hack.c swap places; true
// consumes the move after the monster refuses. Everything from 511 on is the
// hostile arm.
export async function do_attack(monster, state = game, env = {}) {
    const random = env.random ?? { d, rn1, rn2, rnd };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('do_attack random injection requires rn2');
    const unsupported = requireAttackOperation(env, 'unsupported');

    if (is_safemon(monster, state) && !state.context?.forcefight) {
        const message = requireAttackOperation(env, 'message');
        const stopRunning = requireAttackOperation(env, 'endRunning');
        const makeFlee = env.monFlee ?? monflee;
        if (typeof makeFlee !== 'function')
            throw new TypeError('do_attack requires monFlee');

        if (random.rn2(7)) return false;

        // uhitm.c:497 only frightens a tame pet. A peaceful non-pet uses the
        // same safety stop but must not consume the rnd(6) flee duration.
        if (monster.mtame) {
            if (typeof random.rnd !== 'function')
                throw new TypeError('do_attack pet refusal requires rnd');
            await makeFlee(monster, random.rnd(6), false, false, {
                ...env,
                state,
                random,
            });
        }
        await message(
            `You stop.  ${capitalizedAlwaysVisibleMonsterName(monster, state)} `
                + 'is in the way!',
            state,
        );
        stopRunning(state);
        return true;
    }

    // 511-514. go.override_confirmation is written only by attack_checks()'s
    // Stormbringer arm, which stops below, and read only by known_hitum() at
    // 601 and hitum() at 797; both read it as FALSE, so it is not carried.
    // gb.bhitpos and gn.notonhead are set here too and are read only inside
    // arms that stop: attack_checks()'s glyph tests, and known_hitum()'s
    // hmon() and cutworm() calls.
    if (await attack_checks(monster, state.uwep, state, env)) return true;

    // 516-521's `Upolyd && noattacks()` and 578-579's hmonas() arm cannot run:
    // polyself is unported, so Upolyd() is constantly false.

    // 523-526. check_capacity() prints and abandons the attack for an
    // overloaded hero. overexertion() spends the fight's extra nutrition and
    // makes the attempt's first random-number call, an rn2(20) inside
    // gethungry(). Both jump to atk_done, which returns TRUE.
    if (await requireAttackOperation(env, 'checkCapacity')(
        'You cannot fight while so heavily loaded.',
        state,
    )) {
        return true;
    }
    if (await requireAttackOperation(env, 'overexertion')(state)) return true;

    // 528-529. A hero still able to two-weapon falls straight through: C runs
    // nothing here and reaches the exercise below. can_twoweapon() is
    // wield.c's and fully ported, messages included, so evaluating it is
    // source-faithful; only its FALSE branch stops, because that is where
    // wield.c untwoweapon() takes over.
    if (state.u.twoweap && !(await can_twoweapon(state)))
        unsupported('ending two-weapon combat');

    // 531-541. wield.c setuwep() sets gu.unweapon for a hero holding something
    // that is not a weapon; the first swing clears it and, with `verbose` on,
    // announces what the hero is now bashing monsters with. The no-weapon
    // arm uses the hero's role verb and anatomy, but suppresses the line for a
    // form that cannot wield.
    if (state.unweapon) {
        state.unweapon = false;
        if (state.flags?.verbose) {
            const message = requireAttackOperation(env, 'message');
            if (state.uwep) {
                await message(
                    `You begin bashing monsters with ${yname(state.uwep, state)}.`,
                    state,
                );
            } else if (!cantwield(state.youmonst?.data)) {
                const verb = ing_suffix(
                    state.urole?.mnum === PM_MONK ? 'strike' : 'bash',
                );
                const hands = makeplural(body_part(HAND, state.youmonst));
                await message(
                    `You begin ${verb} monsters with your `
                        + `${state.uarmg ? 'gloved' : 'bare'} ${hands}.`,
                    state,
                );
            }
        }
    }

    // 543-545. exercise() draws rn2(19) while |AEXE(A_STR)| is under its
    // limit, so this is the attempt's second call. u_wipe_engr() draws only
    // where something is engraved under the hero.
    await exercise(A_STR, true, state, random, {
        encumberMessage: env.encumberMessage ?? encumber_msg,
    });
    /* andrew@orca: prevent unlimited pick-axe attacks */
    u_wipe_engr(3, { ...env, state, random });

    // 547-556. A leprechaun dodges the blow and the hero stumbles forward.
    // The arm needs monmove.c m_move(), so a leprechaun target stops here;
    // every other species fails mlet and never reaches its rn2(7).
    if (monster.data.mlet === S_LEPRECHAUN) unsupported('leprechaun dodge');

    // 580. C passes the whole mattk[] array and hitum() reads element 0.
    await hitum(monster, state.youmonst.data.mattk[0], state, env);
    monster.mstrategy &= ~STRAT_WAITMASK;

    // 577-580. C marks the square with an 'I' when a forced blow leaves a
    // target the hero cannot spot alive. Nothing in this port reaches that
    // tail: attack_checks() admits a force-fight only against a target the
    // hero can spot, and the arms between there and here do not produce an
    // invisible surviving target. The marker's `!glyph_is_invisible(...)`
    // conjunct is therefore not reached, so whether a marker sits on the
    // square is moot. Knockback remains a separate source arm and does not
    // decide this reachability condition.
    return true;
}

// C ref: uhitm.c known_hitum() (585-646). Delivers one already-decided swing.
// `mhit` carries the hit-or-miss decision in and back out, because the hit arm
// can downgrade a hit to a miss; the miss arm never does. C returns whether
// the target still lives, which is TRUE for every miss.
//
// `slice_or_chop`, computed at 599 for the hit arm's cutworm() call, is left
// out: no target this port reaches has a wormno, so the cutworm() call at
// 642-643 that reads it stops first. go.override_confirmation at 601 is
// constantly FALSE; see do_attack().
//
// gn.notonhead at 620 records whether the blow landed on a long worm's tail
// rather than its head. Only hmon_hitmon()'s potion and misc-object arms read
// it, and both stop, so it is not carried.
//
// The morale check at 623-633 spends a second random choice only after the
// unconditional !rn2(25) draw succeeds. Its void monflee() call is the
// existing monmove.c owner; set_ustuck() then clears the hero's attachment if
// the flee operation did not already release it.
export async function known_hitum(
    mon,
    weapon,
    mhit,
    rollneeded,
    armorpenalty,
    uattk,
    dieroll,
    state = game,
    env = {},
) {
    const random = env.random ?? { d, rn2, rnd };
    let malive = true;

    if (!mhit.value) {
        await missum(
            mon,
            uattk,
            rollneeded + armorpenalty > dieroll,
            state,
            env,
        );
    } else {
        const oldhp = mon.mhp;
        const oldweaphit = state.u.uconduct.weaphit;

        /* KMH, conduct */
        if (weapon && (weapon.oclass === WEAPON_CLASS
                       || is_weptool(weapon, state)))
            state.u.uconduct.weaphit++;

        /* we hit the monster; be careful: it might die or
           be knocked into a different location */
        malive = await hmon(mon, weapon, HMON_MELEE, dieroll, state, env);
        if (malive) {
            /* monster still alive */
            if (!random.rn2(25) && mon.mhp < Math.trunc(mon.mhpmax / 2)
                && !engulfing_u(mon, state)) {
                const fleeTime = !random.rn2(3) ? random.rnd(100) : 0;
                // monmove.c monflee() discards create_gas_cloud()'s return.
                // Positive-damage gas remains an unported region callback, so
                // preserve the source gap without replacing the flight owner.
                const createGasCloud = env.createGasCloud ?? (() => {
                    note_unported('region.c create_gas_cloud');
                });
                await monflee(mon, fleeTime, false, true, {
                    ...env,
                    state,
                    random,
                    canSeeMonster: env.canSeeMonster
                        ?? ((subject) => canSeeMonster(subject, state)),
                    fleeMessage: env.fleeMessage ?? monfleeMessage,
                    message: env.message ?? (env.planning
                        ? async () => {}
                        : undefined),
                    createGasCloud,
                });

                if (state.u.ustuck === mon && !state.u.uswallow
                    && !sticks(state.youmonst.data))
                    set_ustuck(null, state);
            }
            /* Vorpal Blade hit converted to miss */
            /* could be headless monster or worm tail */
            if (mon.mhp === oldhp) {
                mhit.value = false;
                /* a miss does not break conduct */
                state.u.uconduct.weaphit = oldweaphit;
            }
            if (mon.wormno && mhit.value)
                requireAttackOperation(env, 'unsupported')('cutting a worm');
        }
    }
    return malive;
}

// C ref: uhitm.c double_punch() (735-754). Whether a bare-handed hero tries a
// second blow. Skilled and better draw; Basic and Unskilled fail the
// `skl_lvl > P_BASIC` test first, so a hero who has not trained the skill
// never reaches the rn2(5).
export function double_punch(state = game, random = { rn2 }) {
    /* note: P_BARE_HANDED_COMBAT and P_MARTIAL_ARTS are equivalent */
    const skl_lvl = P_SKILL(P_BARE_HANDED_COMBAT, state);

    if (!state.uwep && !state.uarms && skl_lvl > P_BASIC)
        return (skl_lvl - P_BASIC) > random.rn2(5);
    return false;
}

// C ref: uhitm.c hitum() (756-815). Rolls one swing, hands it to known_hitum()
// and then lets the target's passive counter-attack answer; a hero fighting
// with two weapons, or punching well enough for double_punch(), swings a second
// time at 797-812. Returns TRUE if the target still lives.
//
// The Cleaver arm at 769-771 needs hitum_cleave(). C also requires !u.twoweap,
// no engulfer, no holder and a diagonal-capable form before cleaving; this
// stops on the wielded artifact alone, because the arms those four terms would
// send it to are the ones below, which stop too.
//
// Three of the six terms guarding the second attack are constantly false here
// and are left out rather than restated:
//
//   go.override_confirmation  written only by attack_checks()'s Stormbringer
//                             arm, which stops; do_attack() records the same.
//   gm.multi < 0              a passive counter-attack that paralysed the hero.
//                             C reads it after the passive() call above, so it
//                             answers TRUE only for a paralysis inflicted
//                             during this call. Two facts keep it false. The
//                             hero cannot already be counting a negative multi:
//                             allmain.c moveloop_core() reads no key then, so
//                             no attack command can begin -- js/pray.js
//                             dopray()'s `nomul(-3)` is the port's one writer
//                             of a negative value, and the three turns it buys
//                             pass without reaching rhack(). And nothing this
//                             function calls can turn it negative: uhitm.c's
//                             paralysing arm is AD_PLYS in passive()'s second
//                             switch, and passive() below stops for every
//                             damage type but AD_PHYS before reaching it.
//                             Port that arm and this term becomes live.
//   u.umortality > oldumort   the hero killed by that counter-attack and then
//                             life-saved. js/end.js done() is the counter's
//                             one writer, at end.c:1070, and it raises
//                             UnsupportedEndOfGameError before hitum() can
//                             resume and test the count. The changed state is
//                             still observable to code that catches that
//                             refusal. js/u_init.js:217 initializes it to 0
//                             and js/insight.js:1190 is its only other reader.
//
// The two that remain are written out, and only one of them can currently
// decide anything. `m_at(x, y) != mon` is live: the second swing is aimed at
// the square the step was, so a target that is no longer standing there is not
// struck again. `!malive` is C's own first answer to the same question, but in
// this port it can only be true where the m_at test is: killing a monster ends
// at mon.c m_detach() -> mon_leaving_level(), which takes it off the map, and
// hmon_hitmon() has no other way to return FALSE with the target still
// standing. Deleting the term leaves all 3,113 tests passing. It stays because
// it is C's, and because a later arm -- lifesaved_monster(), or a knockback
// that kills -- can separate the two.
export async function hitum(mon, uattk, state = game, env = {}) {
    const random = env.random ?? { d, rn2, rnd };
    const unsupported = requireAttackOperation(env, 'unsupported');
    const wepbefore = state.uwep;
    const secondwep = state.u.twoweap ? state.uswapwep : null;
    const x = state.u.ux + state.u.dx;
    const y = state.u.uy + state.u.dy;

    if (state.uwep?.oartifact === ART_CLEAVER) unsupported('Cleaver melee');

    /* 0: single hit, 1: first of two hits; affects strength bonus and
       silver rings; known_hitum() -> hmon() -> hmon_hitmon() will copy
       gt.twohits into struct _hitmon_data hmd.twohits */
    state.twohits = (state.uwep
        ? state.u.twoweap
        : double_punch(state, random)) ? 1 : 0;

    const counters = { attknum: 0, role_roll_penalty: 0 };
    let tmp = await find_roll_to_hit(
        mon,
        uattk.aatyp,
        state.uwep,
        counters,
        state,
        env,
    );
    mon_maybe_unparalyze(mon, random);
    let dieroll = random.rnd(20);
    const mhit = { value: tmp > dieroll || state.u.uswallow };
    if (tmp > dieroll) {
        await exercise(A_DEX, true, state, random, {
            encumberMessage: env.encumberMessage ?? encumber_msg,
        });
    }

    /* gb.bhitpos is set up by caller */
    let malive = await known_hitum(
        mon,
        state.uwep,
        mhit,
        tmp,
        counters.role_roll_penalty,
        uattk,
        dieroll,
        state,
        env,
    );
    const wep_was_destroyed = Boolean(wepbefore && !state.uwep);
    await passive(
        mon,
        state.uwep,
        mhit.value,
        malive,
        AT_WEAP,
        wep_was_destroyed,
        state,
        env,
    );

    /* second attack for two-weapon combat or skilled unarmed combat;
       won't occur if Stormbringer overrode confirmation (assumes
       Stormbringer is primary weapon), or if hero became paralyzed by
       passive counter-attack, or if hero was killed by passive
       counter-attack and got life-saved, or if monster was killed or
       knocked to different location */
    if (state.twohits && malive && m_at(x, y, state) === mon) {
        state.twohits = 2; /* second of 2 hits */
        // C reads the live uswapwep for the to-hit number but hands
        // known_hitum() the `secondwep` it captured on entry. The two differ
        // for a bare-handed double punch, which leaves uswapwep alone and
        // strikes with nothing.
        tmp = await find_roll_to_hit(
            mon,
            uattk.aatyp,
            state.uswapwep,
            counters,
            state,
            env,
        );
        mon_maybe_unparalyze(mon, random);
        dieroll = random.rnd(20);
        // C reassigns its `mhit` local; known_hitum() may still downgrade the
        // hit to a miss below, and the passive() guard reads what it left.
        mhit.value = tmp > dieroll || state.u.uswallow;
        // 783's exercise(A_DEX, TRUE) has no counterpart here: only the first
        // swing of a turn exercises Dexterity.
        malive = await known_hitum(
            mon,
            secondwep,
            mhit,
            tmp,
            counters.role_roll_penalty,
            uattk,
            dieroll,
            state,
            env,
        );
        /* second passive counter-attack only occurs if second attack hits */
        if (mhit.value) {
            await passive(
                mon,
                secondwep,
                mhit.value,
                malive,
                AT_WEAP,
                Boolean(secondwep && !state.uswapwep),
                state,
                env,
            );
        }
    }
    state.twohits = 0;
    return malive;
}

// C ref: uhitm.c hmon() (817-834). The wrapper every hit goes through. Its own
// body is two consequences of striking a monster the town protects.
//
// `anger_guards` is computed at 826-828, before hmon_hitmon() runs, and is
// called after the hit just as C does. ghod_hitsu() is a discarded void
// consequence, but its priest-only rn2(2) still belongs to this source
// wrapper and must be consumed before returning the hit result.
export async function hmon(mon, obj, thrown, dieroll, state = game, env = {}) {
    const random = env.random ?? { rn2 };
    const angerGuards = mon.mpeaceful
        && (mon.ispriest || mon.isshk || is_watch(mon.data));

    const result = await hmon_hitmon(mon, obj, thrown, dieroll, state, env);
    if (mon.ispriest && !random.rn2(2))
        note_unported('priest.c ghod_hitsu');
    if (angerGuards) {
        const deaf = state.u?.uprops?.[DEAF];
        await angry_guards(
            Boolean(deaf?.intrinsic || deaf?.extrinsic
                || state.u?.uroleplay?.deaf),
            { ...env, state },
        );
    }
    return result;
}

// C ref: uhitm.c hmon_hitmon_barehands() (837-882). Damage for a hero striking
// with a fist, and the blessed-gloves or silver-ring bonus that rides on it.
//
// A shade takes nothing from a fist, and unlike the weapon arm at 892 C does
// not consult shade_glare() here. The feedback that says so is
// hmon_hitmon():1821's shade_miss(), which is where the shade case stops.
async function hmon_hitmon_barehands(hmd, mon, state, env, random) {
    const silverhit = { silverhit: 0 }; /* worn masks */

    if (hmd.mdat === state.mons[PM_SHADE]) {
        hmd.dmg = 0;
    } else {
        /* note: 1..2 or 1..4 can be substantially increased by
           strength bonus or skill bonus, usually both... */
        hmd.dmg = random.rnd(martial_bonus(state) ? 4 : 2);
        hmd.use_weapon_skill = true;
        hmd.train_weapon_skill = (hmd.dmg > 1);
    }

    /* Blessed gloves give bonuses when fighting 'bare-handed'.  So do
       silver rings.  Note:  rings are worn under gloves, so you don't
       get both bonuses, and two silver rings don't give double bonus.
       When making only one hit, both rings are checked (backwards
       compatibility => playability), but when making two hits, only the
       ring on the hand making the attack is checked. */
    const spcdmgflg = state.uarmg ? W_ARMG
        : (((hmd.twohits === 0 || hmd.twohits === 1) ? W_RINGR : 0)
           | ((hmd.twohits === 0 || hmd.twohits === 2) ? W_RINGL : 0));
    hmd.dmg += special_dmgval(
        state.youmonst, mon, spcdmgflg, silverhit, state, { ...env, random },
    );

    /* copy silverhit info back into struct _hitmon_data *hmd */
    switch (hmd.twohits) {
    case 0: /* only one hit being attempted; a silver ring on either hand
             * applies but having silver rings on both is same as just one */
        hmd.barehand_silver_rings =
            (silverhit.silverhit & (W_RINGR | W_RINGL)) ? 1 : 0;
        break;
    case 1: /* first of two or more hit attempts; right ring applies */
        hmd.barehand_silver_rings = (silverhit.silverhit & W_RINGR) ? 1 : 0;
        break;
    case 2: /* second of two or more hit attempts; left ring applies */
        hmd.barehand_silver_rings = (silverhit.silverhit & W_RINGL) ? 1 : 0;
        break;
    default: /* third or later of more than two hit attempts (poly'd hero);
              * rings were applied on first and second hits */
        hmd.barehand_silver_rings = 0;
        break;
    }
    if (hmd.barehand_silver_rings > 0) hmd.silvermsg = true;
}

// C ref: uhitm.c backstabbable() (920-931). Whether a Rogue may strike this
// target from behind. The last term is the one that changes during a fight;
// the six before it are fixed properties of the species.
function backstabbable(mon, state) {
    return !amorphous(mon.data)
        && !is_whirly(mon.data)
        && !noncorporeal(mon.data)
        && mon.data.mlet !== S_BLOB
        && mon.data.mlet !== S_EYE
        && mon.data.mlet !== S_FUNGUS
        && canSeeMonster(mon, state)
        && Boolean(mon.mflee || helpless(mon));
}

// C ref: uhitm.c shade_aware() (1992-2014).  These objects either affect a
// shade directly or have a dedicated misc-object arm that handles shades.
// Keep this predicate beside hmon_hitmon_do_hit(), the only caller.
function shade_aware(obj, state) {
    if (!obj) return false;
    return obj.otyp === BOULDER
        || obj.otyp === HEAVY_IRON_BALL
        || obj.otyp === IRON_CHAIN
        || obj.otyp === MIRROR
        || obj.otyp === CLOVE_OF_GARLIC
        || objectType(obj, state).oc_material === SILVER;
}

// C ref: uhitm.c hmon_hitmon_weapon_melee() (933-1067). Damage for a wielded
// weapon, weapon-tool or gem swung in melee, and the flags the messages below
// read off it.
//
// Four arms stop, each the whole of one C branch:
//
//   979-1010  the dieroll == 2 shatter of a defender's weapon. It needs
//             Yobjnam2() and m_useupall(); C reaches it only for a hero at
//             P_SKILLED or better swinging a two-handed weapon (or a
//             Samurai's katana) at a monster that is wielding something.
//   1043-1049 joust(), for a lance used from a saddle.
//   1050-1063 the HMON_THROWN ammunition bonuses. hmon() admits only
//             HMON_MELEE, so `thrown` is 0 here and both tests fail.
//   1065-1066 permapoisoned(), which only Grimtooth satisfies; the poison
//             owner below consumes its source result flags.
async function hmon_hitmon_weapon_melee(hmd, mon, obj, state, env, random) {
    /* "normal" weapon usage */
    hmd.use_weapon_skill = true;
    hmd.dmg = dmgval(obj, mon, state, { ...env, random });
    /* a minimal hit doesn't exercise proficiency */
    hmd.train_weapon_skill = (hmd.dmg > 1);

    /* Healer with anatomy knowledge */
    if (state.urole?.mnum === PM_HEALER && hmd.hand_to_hand
        && obj.oclass === WEAPON_CLASS
        && objectType(obj, state).oc_subtyp === P_KNIFE) {
        hmd.dmg += Math.min(
            3,
            Math.trunc(state.svm.mvitals[monsndx(mon.data)].died / 6),
        );
    }

    /* special attack actions */
    if (!hmd.train_weapon_skill || mon === state.u.ustuck || state.u.twoweap
        /* Cleaver can hit up to three targets at once so don't
           let it also hit from behind or shatter foes' weapons */
        || (hmd.hand_to_hand && obj.oartifact === ART_CLEAVER)) {
        ; /* no special bonuses */
    } else if (state.urole?.mnum === PM_ROGUE && backstabbable(mon, state)
               /* multi-shot throwing is too powerful here */
               && hmd.hand_to_hand) {
        await requireAttackOperation(env, 'message')(
            `You strike ${monsterCommonName(mon, state)} from behind!`,
            state,
        );
        hmd.dmg += random.rnd(state.u.ulevel);
        hmd.hittxt = true;
    } else if (hmd.dieroll === 2 && obj === state.uwep
               && obj.oclass === WEAPON_CLASS
               && (bimanual(obj, state)
                   || (state.urole?.mnum === PM_SAMURAI
                       && obj.otyp === KATANA && !state.uarms))
               && uwep_skill_type(state) !== P_NONE
               && P_SKILL(uwep_skill_type(state), state) >= P_SKILLED
               && mon.mw /* MON_WEP() */
               && !is_flimsy(mon.mw, state)
               && !obj_resists(
                   mon.mw,
                   50 + 15 * (greatest_erosion(obj)
                       - greatest_erosion(mon.mw)),
                   100,
                   { ...env, state, random },
               )) {
        const monwep = mon.mw;
        mon.weapon_check = NEED_WEAPON;
        await (await import('./weapon.js')).setmnotwielded(
            mon, monwep, { ...env, state },
        );
        await (await import('./mthrowu.js')).m_useupall(
            mon, monwep, { ...env, state },
        );
        if (canSeeMonster(mon, state)) {
            await requireAttackOperation(env, 'message')(
                `${Yobjnam2(monwep, 'shatter', state)} from the force of your blow!`,
                state,
            );
        }
        if (random.rn2(4))
            await monflee(mon, random.d(2, 3), true, true,
                         { ...env, state, random });
    }

    if (obj.oartifact) {
        const dmgptr = { value: hmd.dmg };
        if (await artifact_hit(
            state.youmonst, mon, obj, dmgptr, hmd.dieroll, state)) {
            hmd.dmg = dmgptr.value;
            /* artifact_hit updates 'tmp' but doesn't inflict any
               damage; however, it might cause carried items to be
               destroyed and they might do so */
            if (mon.mhp < 1) { /* DEADMONSTER(mon) -- artifact killed monster */
                hmd.doreturn = true;
                hmd.retval = false;
                return;
            }
            /* perhaps artifact tried to behead a headless monster */
            if (hmd.dmg === 0) {
                hmd.doreturn = true;
                hmd.retval = true;
                return;
            }
            hmd.hittxt = true;
        } else {
            hmd.dmg = dmgptr.value;
        }
    }
    if (hmd.material === SILVER && mon_hates_silver(mon)) {
        hmd.silvermsg = hmd.silverobj = true;
    }
    if (artifact_light(obj) && obj.lamplit && mon_hates_light(mon))
        hmd.lightobj = true;
    if (state.u.usteed && !hmd.thrown && hmd.dmg > 0
        && weapon_type(obj, state) === P_LANCE && mon !== state.u.ustuck) {
        // joust()'s knockback and lance break are a discarded side effect in
        // this source slice. Keep the hit's damage and mark the source call
        // without replacing it with a refusal.
        note_unported('steed.c joust');
        hmd.jousting = 1;
    }
    if (hmd.thrown === HMON_THROWN
        && (is_ammo(obj, state) || is_missile(obj, state))) {
        if (ammo_and_launcher(obj, state.uwep, state)) {
            if (state.urole?.mnum === PM_SAMURAI
                && obj.otyp === YA && state.uwep?.otyp === YUMI)
                hmd.dmg++;
            else if (state.urace?.mnum === PM_ELF
                     && obj.otyp === ELVEN_ARROW
                     && state.uwep?.otyp === ELVEN_BOW)
                hmd.dmg++;
            hmd.train_weapon_skill = hmd.dmg > 0;
        }
        if (obj.opoisoned && isPoisonable(obj, state))
            hmd.ispoisoned = true;
    }
    if (permapoisoned(obj) && hmd.dieroll <= 5)
        hmd.ispoisoned = true;
}

// C ref: uhitm.c hmon_hitmon_weapon() (1069-1092). Chooses between the melee
// and the ranged damage arms for a weapon, weapon-tool or gem.
//
// hmon_hitmon_weapon_ranged() (884-918) stops. It covers bashing with
// something meant to be launched or thrown -- a wielded bow, dart or arrow --
// and needs the BOOMERANG return arm at 901-917 that gives the weapon back to
// the hero.
//
// C's four tests are written against `hmd->thrown`; the ranged path keeps
// that field so its projectile-specific tests remain source-visible.
async function hmon_hitmon_weapon_ranged(hmd, mon, obj, state, env, random) {
    if (hmd.mdat === state.mons[PM_SHADE] && !shade_glare(obj, state))
        hmd.dmg = 0;
    else
        hmd.dmg = random.rnd(2);
    if (hmd.material === SILVER && mon_hates_silver(mon)) {
        hmd.silvermsg = hmd.silverobj = true;
        hmd.dmg += random.rnd(hmd.dmg ? 20 : 10);
    }
    if (!hmd.thrown && obj === state.uwep && obj.otyp === BOOMERANG
        && (random.rnl ?? rnl)(4) === 3) {
        const moreThanOne = obj.quan > 1;
        const message = requireAttackOperation(env, 'message');
        await message(
            `As you hit ${mon_nam(mon, state)}, ${moreThanOne ? 'one of ' : ''}`
            + `${yname(obj, state)} breaks into splinters.`,
            state,
        );
        if (!moreThanOne) {
            state.gn ??= {};
            state.gn.unweapon = true;
        }
        useup(obj, { ...env, state });
        hmd.hittxt = true;
        if (hmd.mdat !== state.mons[PM_SHADE]) hmd.dmg++;
    }
}

async function hmon_hitmon_weapon(hmd, mon, obj, state, env, random) {
    /* is it not a melee weapon? */
    if (/* if you strike with a bow... */
        is_launcher(obj, state)
        /* or strike with a missile in your hand... */
        || (!hmd.thrown && (is_missile(obj, state) || is_ammo(obj, state)))
        /* or use a pole at short range and not mounted... */
        || (!hmd.thrown && !state.u.usteed && is_pole(obj, state)
            && obj.oartifact !== ART_SNICKERSNEE)
        /* throw an ammo object without its matching launcher */
        || (is_ammo(obj, state)
            && (hmd.thrown !== HMON_THROWN
                || !ammo_and_launcher(obj, state.uwep, state)))) {
        await hmon_hitmon_weapon_ranged(hmd, mon, obj, state, env, random);
    } else {
        await hmon_hitmon_weapon_melee(hmd, mon, obj, state, env, random);
    }
}

// C ref: uhitm.c hmon_hitmon_misc_obj() (1204-1300). The cream pie arm is
// reached by dothrow.c for a thrown nonweapon. It blinds and angers a visible
// defender, consumes the object, and leaves zero damage while marking the hit
// text so the generic damage and message tails do not add a second result.
async function hmon_hitmon_misc_obj(hmd, mon, obj, state, env, random) {
    const message = requireAttackOperation(env, 'message');
    const lifeEnv = { ...env, state, random };

    /* Keep the complete non-weapon switch in the uhitm.c owner.  These arms
       are reached by do_hit() for ordinary objects and by dothrow for thrown
       objects, so an early cream-pie-only refusal changes both damage and
       object lifetime. */
    if (obj.otyp === BOULDER || obj.otyp === HEAVY_IRON_BALL
        || obj.otyp === IRON_CHAIN) {
        hmd.dmg = dmgval(obj, mon, state, lifeEnv);
        return;
    }

    if (obj.otyp === MIRROR) {
        // breaktest() owns the source resistance draw and decision.  Dynamic
        // import avoids making dothrow's existing uhitm cycle eager.
        const { breaktest } = await import('./dothrow.js');
        if (breaktest(obj, lifeEnv)) {
            await message(
                `You break ${ysimpleName(obj, state)}.  That's bad luck!`,
                state,
            );
            change_luck(-2, state);
            useup(obj, lifeEnv);
            hmd.unarmed = false;
            hmd.get_dmg_bonus = false;
            hmd.hittxt = true;
        }
        hmd.dmg = 1;
        return;
    }

    if (obj.otyp === EXPENSIVE_CAMERA) {
        await message(
            `You succeed in destroying ${ysimpleName(obj, state)}.  Congratulations!`,
            state,
        );
        // release_camera_demon() is a discarded side effect in C.  Preserve
        // that explicit source boundary without inventing a monster or draw.
        note_unported('dothrow.c release_camera_demon');
        useup(obj, lifeEnv);
        hmd.doreturn = true;
        hmd.retval = true;
        return;
    }

    if (obj.otyp === CORPSE) {
        const corpseSpecies = ismnum(obj.corpsenm)
            ? state.mons?.[obj.corpsenm] : null;
        if (corpseSpecies && touch_petrifies(corpseSpecies)) {
            hmd.dmg = 1;
            hmd.hittxt = true;
            await message(
                `You hit ${monsterCommonName(mon, state)} with `
                    + `${corpse_xname(
                        obj,
                        null,
                        obj.dknown ? CXN_PFX_THE : CXN_ARTICLE,
                        state,
                    )}.`,
                state,
            );
            observe_object(obj, state);
            const { munstone } = await import('./muse.js');
            if (!await munstone(mon, true, state, lifeEnv))
                note_unported('mon.c minstapetrify');
            if (!monster_resists_element(mon, STONE_RES, state)) {
                hmd.doreturn = true;
                hmd.retval = mon.mhp >= 1;
                return;
            }
            /* C's `break` leaves hmon_hitmon_misc_obj() with its nominal
               one-point damage; hmon_hitmon() then applies that damage. */
            return;
        }
        hmd.dmg = (corpseSpecies?.msize ?? 0) + 1;
        return;
    }

    if (obj.otyp === EGG) {
        const count = obj.quan ?? 1;
        hmd.dmg = 1;
        hmd.get_dmg_bonus = false;
        hmd.hittxt = true;
        if (obj === state.uwep) {
            state.gn ??= {};
            state.gn.unweapon = true;
        }
        if (obj.spe && ismnum(obj.corpsenm))
            change_luck(-Math.min(count, 5), state);
        const eggSpecies = ismnum(obj.corpsenm)
            ? state.mons?.[obj.corpsenm] : null;
        if (eggSpecies && touch_petrifies(eggSpecies)) {
            await message(
                `Splat!  You hit ${monsterCommonName(mon, state)} with `
                    + `${obj.known ? 'the' : count > 1 ? 'some' : 'a'} `
                    + `${obj.known ? `the ${pmname(eggSpecies, NEUTRAL)}` : 'petrifying'} egg`
                    + `${count === 1 ? '' : 's'}!`,
                state,
            );
            obj.known = true;
            if (hmd.thrown) obfree(obj, null, lifeEnv);
            else useupall(obj, lifeEnv);
            const { munstone } = await import('./muse.js');
            if (!await munstone(mon, true, state, lifeEnv))
                note_unported('mon.c minstapetrify');
            if (!monster_resists_element(mon, STONE_RES, state)) {
                hmd.doreturn = true;
                hmd.retval = mon.mhp >= 1;
                return;
            }
            /* C's switch `break` continues through the common hit tail when
               the defender resists petrification. */
            return;
        }

        const eggName = eggSpecies && obj.known
            ? `the ${pmname(eggSpecies, NEUTRAL)}`
            : count > 1 ? 'some' : 'an';
        await message(
            `You hit ${monsterCommonName(mon, state)} with ${eggName} egg`
                + `${count === 1 ? '' : 's'}.`,
            state,
        );
        const staleEgg = Number.isFinite(state.moves)
            && state.moves - (obj.age ?? 0) > 2 * MAX_EGG_HATCH_TIME;
        if (hmd.mdat && touch_petrifies(hmd.mdat) && !staleEgg) {
            await message(
                `The egg${count === 1 ? '' : 's'} isn't alive any more...`,
                state,
            );
            if (obj.timed) {
                const { obj_stop_timers } = await import('./timeout.js');
                obj_stop_timers(obj, state, lifeEnv);
            }
            obj.otyp = ROCK;
            obj.oclass = GEM_CLASS;
            obj.oartifact = 0;
            obj.spe = 0;
            obj.known = obj.dknown = obj.bknown = 0;
            obj.owt = weight(obj, lifeEnv);
            if (hmd.thrown) place_object(obj, mon.mx, mon.my, lifeEnv);
        } else if (obj.corpsenm === PM_PYROLISK) {
            if (hmd.thrown) obfree(obj, null, lifeEnv);
            else useupall(obj, lifeEnv);
            const { explode } = await import('./explode.js');
            await explode(mon.mx, mon.my, -11, random.d(3, 6), 0, 5,
                state, lifeEnv);
            hmd.doreturn = true;
            hmd.retval = mon.mhp >= 1;
            return;
        } else {
            await message('Splat!', state);
            if (hmd.thrown) obfree(obj, null, lifeEnv);
            else useupall(obj, lifeEnv);
            await exercise(A_WIS, false, state);
        }
        return;
    }

    if (obj.otyp === CLOVE_OF_GARLIC) {
        if (is_undead(hmd.mdat) || is_vampshifter(mon))
            await monflee(mon, random.d(2, 4), false, true, lifeEnv);
        hmd.dmg = 1;
        return;
    }

    if (obj.otyp === CREAM_PIE || obj.otyp === BLINDING_VENOM) {
        mon.msleeping = 0;
        if (can_blnd(
            state.youmonst, mon,
            obj.otyp === BLINDING_VENOM ? AT_SPIT : AT_WEAP,
            obj,
            state,
        )) {
            if (heroIsBlind(state)) {
                await message(obj.otyp === CREAM_PIE ? 'Splat!' : 'Splash!', state);
            } else if (obj.otyp === BLINDING_VENOM) {
                await message(
                    `The venom blinds ${monsterCommonName(mon, state)}`
                        + `${mon.mcansee ? '' : ' further'}!`,
                    state,
                );
            } else {
                let whom = monsterPossessive(mon, state);
                const what = The(cxname(obj, state), state);
                if (haseyes(hmd.mdat) && hmd.mdat.pmidx !== PM_FLOATING_EYE)
                    whom += ` ${mbodypart(mon, FACE)}`;
                await message(
                    `${what} ${vtense(what, 'splash')} over ${whom}!`,
                    state,
                );
            }
            await setmangry(mon, true, lifeEnv);
            mon.mcansee = 0;
            hmd.dmg = random.rn1(25, 21);
            mon.mblinded = Math.min(127, (mon.mblinded ?? 0) + hmd.dmg);
        } else {
            await message(obj.otyp === CREAM_PIE ? 'Splat!' : 'Splash!', state);
            await setmangry(mon, true, lifeEnv);
        }
        if (hmd.thrown) obfree(obj, null, lifeEnv);
        else useup(obj, lifeEnv);
        hmd.hittxt = true;
        hmd.get_dmg_bonus = false;
        hmd.dmg = 0;
        return;
    }

    if (obj.otyp === ACID_VENOM) {
        if (monster_resists_element(mon, ACID_RES, state)) {
            await message(
                `Your venom hits ${monsterCommonName(mon, state)} harmlessly.`,
                state,
            );
            hmd.dmg = 0;
        } else {
            await message(
                `Your venom burns ${monsterCommonName(mon, state)}!`,
                state,
            );
            hmd.dmg = dmgval(obj, mon, state, lifeEnv);
        }
        if (hmd.thrown) obfree(obj, null, lifeEnv);
        else useup(obj, lifeEnv);
        hmd.hittxt = true;
        hmd.get_dmg_bonus = false;
        return;
    }

    const type = objectType(obj, state);
    if ((type.oc_material === VEGGY || type.oc_material === PAPER)
        && obj.oclass !== SPBOOK_CLASS) {
        hmd.dmg = 0;
        hmd.get_dmg_bonus = false;
        return;
    }
    hmd.dmg = Math.trunc((obj.owt + 99) / 100);
    hmd.dmg = hmd.dmg <= 1 ? 1 : random.rnd(hmd.dmg);
    if (hmd.dmg > 6) hmd.dmg = 6;
    if (is_wet_towel(obj)) {
        const doubled = mon.data === state.mons[PM_IRON_GOLEM];
        hmd.dmg += obj.spe * (doubled ? 2 : 1);
        hmd.dmg = random.rnd(hmd.dmg);
        hmd.dryit = random.rn2(obj.spe + 1) > 0;
    }
    if (hmd.material === SILVER && mon_hates_silver(mon)) {
        hmd.dmg += random.rnd(20);
        hmd.silvermsg = hmd.silverobj = true;
    }
    if (obj.blessed && mon_hates_blessings(mon)) hmd.dmg += random.rnd(4);
}


// C ref: uhitm.c hmon_hitmon_potion() (1095-1117). A potion thrown or
// applied at a monster is split out of a stack, removed from hero inventory,
// and handed to potionhit(). The potion owner may kill the target, in which
// case hmon_hitmon() must return immediately with FALSE.
async function hmon_hitmon_potion(hmd, mon, obj, state, env) {
    if (obj.quan > 1)
        obj = splitobj(obj, 1, { ...env, state });
    else
        setuwep(null, { ...env, state });
    // freeinv() is the source extraction before potionhit(), including the
    // stack and worn-slot bookkeeping owned by invent.c/worn.c.
    freeinv(obj, { ...env, state });
    await potionhit(
        mon,
        obj,
        hmd.hand_to_hand ? POTHIT_HERO_BASH : POTHIT_HERO_THROW,
        { ...env, state },
    );
    if (mon.mhp < 1) {
        hmd.doreturn = true;
        hmd.retval = false;
        return;
    }
    hmd.hittxt = true;
    hmd.mdat = mon.data;
    hmd.dmg = hmd.mdat === state.mons[PM_SHADE] ? 0 : 1;
}

// C ref: uhitm.c hmon_hitmon_do_hit() (1386-1433). Rolls the blow's base
// damage, dispatching on what the hero swung.
//
// The stone missile and potion arms stop early; the non-weapon switch carries
// the remaining object families through their source damage and lifetime
// paths.
//
//   1398-1406 a thrown or kicked stone missile against a rock-passing target.
//   1412-1413 bare_artifactname(), for a lit Sunsword whose name the messages
//             need after the object may have been destroyed.
//   1420-1431 hmon_hitmon_potion(), which returns when potionhit() kills;
//             shade_aware() protects the dedicated misc-object arms below.
async function hmon_hitmon_do_hit(hmd, mon, obj, state, env, random) {
    if (!obj) { /* attack with bare hands */
        await hmon_hitmon_barehands(hmd, mon, state, env, random);
    } else {
        /* A rock missile passes through a wall-walking target and is consumed
           by this hit path without dealing damage. */
        if ((hmd.thrown === HMON_THROWN || hmd.thrown === HMON_KICKED)
            && stone_missile(obj) && passes_rocks(hmd.mdat)) {
            await hit(
                mshot_xname(obj, state),
                mon,
                ' but does no harm.',
                state,
                env,
            );
            await wakeup(mon, true, { ...env, state });
            hmd.doreturn = true;
            hmd.retval = true;
            return;
        }
        /* remember obj's name since it might end up being destroyed and
           we'll want to use it after that */
        if (!(artifact_light(obj) && obj.lamplit))
            hmd.saved_oname = cxname(obj, state);
        else
            hmd.saved_oname = bare_artifactname(obj, state);

        if (obj.oclass === WEAPON_CLASS || is_weptool(obj, state)
            || obj.oclass === GEM_CLASS) {
            await hmon_hitmon_weapon(hmd, mon, obj, state, env, random);
            if (hmd.doreturn) return;
        } else if (obj.oclass === POTION_CLASS) {
            await hmon_hitmon_potion(hmd, mon, obj, state, env);
            if (hmd.doreturn) return;
        /* attacking with non-weapons */
        } else if (hmd.mdat === state.mons[PM_SHADE]
                   && !shade_aware(obj, state)) {
            hmd.dmg = 0;
        } else if (obj.otyp === CREAM_PIE) {
            await hmon_hitmon_misc_obj(hmd, mon, obj, state, env, random);
        } else {
            await hmon_hitmon_misc_obj(hmd, mon, obj, state, env, random);
        }
    }
}

// C ref: uhitm.c hmon_hitmon_dmg_recalc() (1435-1507). Adds the damage-ring,
// strength and weapon-skill bonuses, and trains the skill.
//
// The propeller exemption and weapon-skill choice below are decided by
// `hmd->thrown`; cream pies leave get_dmg_bonus false, while ranged weapons
// retain the source branches until their separate damage helper is ported.
function hmon_hitmon_dmg_recalc(hmd, obj, state, env) {
    let dmgbonus = 0;

    /*
     * Potential bonus (or penalty) from worn ring of increase damage
     * (or intrinsic bonus from eating same) or from strength.  Strength
     * bonus is increased for melee with two-handed weapons and decreased
     * for dual attacks (but when both hit, the total for the two is more
     * than the bonus for a regular single hit).
     */
    if (hmd.get_dmg_bonus) {
        /* for dual attacks, udaminc applies to both, and two-handed
           weapons use it as-is */
        dmgbonus = state.u.udaminc;
        /* throwing using a propellor gets an increase-damage bonus
           but not a strength one; other attacks get both;
           for dual attacks, 3/4 of the strength bonus is used; when
           both attacks hit, overall bonus is 3/2 rather than doubled;
           melee hit with two-handed weapon uses 3/2 strength bonus to
           approximately match double hit with two-weapon ('approximate'
           because udaminc skews in favor of two-weapon); the 3/2 factor
           for two-handed strength does not apply to polearms unless
           hero is simply bashing with one of those and does not apply
           to jousting because lances are one-handed */
        const propelled = hmd.thrown === HMON_THROWN
            && obj && state.uwep
            && ammo_and_launcher(obj, state.uwep, state);
        if (!propelled) {
            let strbonus = dbon(state);
            const absbonus = Math.abs(strbonus);
            if (hmd.twohits)
                strbonus = Math.trunc((3 * absbonus + 2) / 4) * sgn(strbonus);
            else if (hmd.thrown === HMON_MELEE && state.uwep
                     && bimanual(state.uwep, state))
                strbonus = Math.trunc((3 * absbonus + 1) / 2) * sgn(strbonus);
            dmgbonus += strbonus;
        }
    }

    /*
     * Potential bonus (or penalty) from weapon skill.
     * 'use_weapon_skill' is True for hand-to-hand ordinary weapon,
     * applied or jousting polearm or lance, thrown missile (dart,
     * shuriken, boomerang), or shot ammo (arrow, bolt, rock/gem when
     * wielding corresponding launcher).
     * It is False for hand-to-hand or thrown non-weapon, hand-to-hand
     * polearm or lance when not mounted, hand-to-hand missile or ammo
     * or launcher, thrown non-missile, or thrown ammo (including rocks)
     * when not wielding corresponding launcher.
     */
    if (hmd.use_weapon_skill) {
        /* PROJECTILE(obj) trains with the launcher, while the damage die
           still belongs to the projectile.  C's `skillwep` substitution is
           also what keeps thrown ammo's skill bonus source-ordered. */
        const skillwep = obj && is_ammo(obj, state)
            && ammo_and_launcher(obj, state.uwep, state)
            ? state.uwep : obj;

        dmgbonus += weapon_dam_bonus(skillwep, state);

        /* hit for more than minimal damage (before being adjusted
           for damage or skill bonus) trains the skill toward future
           enhancement */
        if (hmd.train_weapon_skill) {
            /* [this assumes that `!thrown' implies wielded...] */
            try {
                const skill = hmd.thrown
                    ? weapon_type(skillwep, state)
                    : uwep_skill_type(state);
                use_skill(skill, 1, state);
            } catch (error) {
                if (!(error instanceof UnsupportedWeaponSkillError)) throw error;
                // C discards the optional "may advance" notification's
                // return; keep the practice update and record only that
                // notification as an unported void consequence.
                note_unported(`weapon.c ${error.branch}`);
            }
        }
    }

    /* apply combined damage+strength and skill bonuses */
    hmd.dmg += dmgbonus;
    /* don't let penalty, if bonus is negative, turn a hit into a miss */
    if (hmd.dmg < 1) hmd.dmg = 1;
}

// C ref: uhitm.c hmon_hitmon_poison() (1509-1567). Poison is evaluated after
// the base damage, and its two result flags are consumed by hmon_hitmon's
// post-hit return path. The alignment messages and object-clearing draw stay
// in this owner; no caller may replace the poison result with a note gap.
async function hmon_hitmon_poison(hmd, mon, obj, state, env, random) {
    let nopoison = 10 - Math.trunc((obj.owt ?? 0) / 10);
    if (nopoison < 2) nopoison = 2;
    const message = requireAttackOperation(env, 'message');
    if (state.urole?.mnum === PM_SAMURAI) {
        await message('You dishonorably use a poisoned weapon!', state);
        adjalign(-sgn(state.u.ualign?.type ?? 0), state);
    } else if (state.u.ualign?.type === A_LAWFUL
               && (state.u.ualign.record ?? 0) > -10) {
        await message(
            'You feel like an evil coward for using a poisoned weapon.',
            state,
        );
        adjalign(-1, state);
    }
    if (!permapoisoned(obj) && !random.rn2(nopoison)) {
        obj.opoisoned = false;
        hmd.unpoisonmsg = true;
    }
    if (monster_resists_element(mon, POISON_RES, state)) {
        hmd.needpoismsg = true;
    } else if (random.rn2(10)) {
        hmd.dmg += random.rnd(6);
    } else {
        hmd.poiskilled = true;
    }
}

// C ref: uhitm.c hmon_hitmon_stagger() (1569-1585). The helper's result is
// discarded by hmon_hitmon(); its mhurtle_to_doom() return dependency remains
// outside this source slice, so the caller records the named void gap.
// C ref: uhitm.c hmon_hitmon_pet() (1587-1601). Hitting a pet costs tameness
// and sends it fleeing.
//
// abuse_dog() runs even for a pet that this blow has already killed or sent
// off the map, because tameness is part of the corpse's revival state; only
// the monflee() that follows is gated on the pet surviving and still being
// tame. rnd() there is on the core stream, so the flee timer costs a draw
// whenever that gate opens.
async function hmon_hitmon_pet(hmd, mon, state, random, env) {
    if (mon.mtame && hmd.dmg > 0) {
        /* do this even if the pet is being killed or migrating
           (affects revival) */
        await abuse_dog(mon, state, random); /* reduces tameness */
        /* flee if still alive and still tame; if already suffering from
           untimed fleeing, no effect, otherwise increases timed fleeing */
        if (mon.mtame && !hmd.destroyed)
            await monflee(mon, 10 * random.rnd(hmd.dmg), false, false,
                          { ...env, state, random });
    }
}

// C ref: uhitm.c hmon_hitmon_splitmon() (1603-1634). An iron or metal melee
// weapon divides a pudding: clone_mon() creates the new half and mintrap()
// checks whether it landed on a trap.
async function hmon_hitmon_splitmon(hmd, mon, obj, state, env) {
    if ((hmd.mdat === state.mons[PM_BLACK_PUDDING]
         || hmd.mdat === state.mons[PM_BROWN_PUDDING])
        /* pudding is alive and healthy enough to split */
        && mon.mhp > 1 && !mon.mcan && !hmd.offmap
        /* iron weapon using melee or polearm hit [3.6.1: metal weapon too;
           also allow either or both weapons to cause split when twoweap] */
        && obj && (obj === state.uwep
                   || (state.u.twoweap && obj === state.uswapwep))
        && ((hmd.material === IRON
             /* allow scalpel and tsurugi to split puddings */
             || hmd.material === METAL)
            /* but not bashing with darts, arrows or ya */
            && !(is_ammo(obj, state) || is_missile(obj, state)))
        && hmd.hand_to_hand) {
        const mclone = await clone_mon(mon, 0, 0, state);
        if (mclone) {
            const message = requireAttackOperation(env, 'message');
            let withwhat = '';
            if (state.u.twoweap && state.flags?.verbose)
                withwhat = ` with ${yname(obj, state)}`;
            await message(
                `${capitalizedMonsterName(mon, state)} divides as you hit it${withwhat}!`,
                state,
            );
            hmd.hittxt = true;
            await mintrap(mclone, NO_TRAP_FLAGS, { ...env, state });
        }
    }
}

// C ref: uhitm.c hmon_hitmon_msg_hit() (1636-1660). "You hit the lichen!" and
// its variants. Nothing is printed when the blow killed the target: the guard
// at 1641-1645 requires !destroyed, and killed() speaks for that case instead.
//
// The `thrown` arm at 1646-1647 needs mshot_xname(); cream pies set hittxt in
// their misc-object helper, while other ranged objects retain this message
// path for when their damage helpers land.
//
// The bash and wet-towel lash terms are selected here even though their
// object-specific effects remain ordinary non-weapon arms in do_hit().
async function hmon_hitmon_msg_hit(hmd, mon, obj, state, env) {
    const shotContinues = hmd.thrown && obj
        && (state.m_shot?.n ?? 0) > 1
        && state.m_shot.o === obj.otyp;
    if (!hmd.hittxt /*( thrown => obj exists )*/
        && (!hmd.destroyed || shotContinues)) {
        const message = requireAttackOperation(env, 'message');
        if (hmd.thrown) {
            await hit(mshot_xname(obj, state), mon, exclam(hmd.dmg), state, env);
        } else if (!state.flags?.verbose) {
            await message('You hit it.', state);
        } else { /* hand_to_hand */
            const verb = obj && (is_shield(obj, state)
                || obj.otyp === HEAVY_IRON_BALL) ? 'bash'
                : obj && (objectType(obj, state).oc_subtyp === P_WHIP
                    || is_wet_towel(obj)) ? 'lash'
                    : state.urole?.mnum === PM_BARBARIAN ? 'smite'
                        : 'hit';
            await message(
                `You ${verb} ${monsterCommonName(mon, state)}`
                    + `${canSeeMonster(mon, state) ? exclam(hmd.dmg) : '.'}`,
                state,
            );
        }
    }
}

// C ref: uhitm.c hmon_hitmon() (1752-1935), the guts of hmon(). Everything
// between the decision that a blow landed and the target's reaction to it.
//
// `hmd` is C's `struct _hitmon_data`, allocated on the stack at 1760 and
// threaded through the helpers by reference. All 27 fields are set here in the
// order include/you.h:511-552 declares them, because the comment above that
// declaration records that the struct exists to fix the order of
// first_weapon_hit() against the hit-point decrement.
//
// These source calls stop or annotate the common path:
//
//   1821-1822 shade_miss() feedback, for a shade that took no damage.
//   1826      hmon_hitmon_jousting(), a discarded helper whose movement
//             dependency remains unported.
//   1874-1877 hmon_hitmon_msg_silver() and hmon_hitmon_msg_lightobj(), the
//             two "sears" messages a silver or Sunsword hit adds.
//   1898-1907 the poison messages and xkilled(); hmon_hitmon_poison() sets
//             those flags before this tail.
//   1911      killed(), the kill itself, which mon.c owns.
//   1914-1919 the confused-touch arm behind u.umconf.
//
// ispoisoned, dryit and unpoisonmsg are all live flags: their writers are the
// weapon/misc/poison owners above, and their common-tail consumers preserve
// C's message and cleanup order. dry_a_towel() itself remains a named void
// dependency after the wetness draw.
//
// doreturn and retval carry C's abort of a blow that finished early. Of C's
// three `if (hmd->doreturn)` guards only 1806-1807's is executable: the two at
// 1090-1091 and 1418-1419 end their own function, so the `return` they guard
// reaches the same next statement the fall-through does. The one below is
// therefore the whole of that control flow. Artifact, potion, misc-object and
// stone-missile arms set the flags before their respective early exits.
//
// maybe_knockback is computed at 1829-1831 but read at 1927, inside a block
// C skips whenever the target died, so mhitm_knockback()'s two draws must not
// be made eagerly.
//
// The `!Upolyd` term is retained in both arms; polymorphed heroes use a
// different attack path and must not enter these human-hero reactions.
async function hmon_hitmon(mon, obj, thrown, dieroll, state = game, env = {}) {
    const random = env.random ?? { d, rn1, rn2, rnd };
    const hmd = {
        dmg: 0,
        thrown,
        /* gt.twohits is turn-scoped state that hitum() owns; a ranged hit
           reads 0 so it cannot take the two-weapon damage branches */
        twohits: thrown ? 0 : state.twohits,
        dieroll,
        mdat: mon.data,
        use_weapon_skill: false,
        train_weapon_skill: false,
        barehand_silver_rings: 0,
        silvermsg: false,
        silverobj: false,
        lightobj: false,
        material: obj ? objectType(obj, state).oc_material : NO_MATERIAL,
        jousting: 0,
        hittxt: false,
        get_dmg_bonus: true,
        unarmed: !state.uwep && !state.uarm && !state.uarms,
        hand_to_hand: (thrown === HMON_MELEE
                       /* not grapnels; applied implies uwep */
                       || (thrown === HMON_APPLIED
                           && is_pole(state.uwep, state))),
        ispoisoned: false,
        unpoisonmsg: false,
        needpoismsg: false,
        poiskilled: false,
        already_killed: false,
        offmap: false,
        destroyed: false,
        dryit: false,
        doreturn: false,
        retval: false,
        saved_oname: '',
    };
    let maybe_knockback = false;

    await hmon_hitmon_do_hit(hmd, mon, obj, state, env, random);
    if (hmd.doreturn) return hmd.retval;

    /*
     ***** NOTE: perhaps obj is undefined! (if !thrown && BOOMERANG)
     *      *OR* if attacking bare-handed!
     * Note too: the cases where obj might get destroyed do not
     *      set 'use_weapon_skill', bare-handed does.
     */

    if (hmd.dmg > 0) hmon_hitmon_dmg_recalc(hmd, obj, state, env);

    if (hmd.ispoisoned)
        await hmon_hitmon_poison(hmd, mon, obj, state, env, random);

    if (hmd.dmg < 1) {
        const mon_is_shade = (mon.data === state.mons[PM_SHADE]);

        /* make sure that negative damage adjustment can't result
           in inadvertently boosting the victim's hit points */
        hmd.dmg = (hmd.get_dmg_bonus && !mon_is_shade) ? 1 : 0;
        if (mon_is_shade && !hmd.hittxt
            && thrown !== HMON_THROWN && thrown !== HMON_KICKED)
            hmd.hittxt = shade_miss(
                state.youmonst,
                mon,
                obj,
                false,
                true,
                state,
                env,
            );
    }

    if (hmd.jousting) {
        // hmon_hitmon_jousting() is a discarded void helper whose
        // mhurtle_to_doom() return dependency remains outside this slice.
        note_unported('uhitm.c hmon_hitmon_jousting');
    } else if (hmd.unarmed && hmd.dmg > 1 && !thrown && !obj
               && !Upolyd(state.u)) {
        note_unported('uhitm.c hmon_hitmon_stagger');
    } else if (!hmd.unarmed && hmd.dmg > 1 && !thrown
               && !Upolyd(state.u)
               && !state.u.twoweap && state.uwep) {
        maybe_knockback = true;
    }

    if (!hmd.already_killed) {
        if (obj && (obj === state.uwep
                    || (obj === state.uswapwep && state.u.twoweap))
            /* known_hitum 'what counts as a weapon' criteria */
            && (obj.oclass === WEAPON_CLASS || is_weptool(obj, state))
            && (thrown === HMON_MELEE || thrown === HMON_APPLIED)
            /* if jousting, the hit was already logged */
            && !hmd.jousting
            /* note: caller has already incremented u.uconduct.weaphit
               so we test for 1; 0 shouldn't be able to happen here... */
            && hmd.dmg > 0 && state.u.uconduct.weaphit <= 1)
            first_weapon_hit(obj, state);
        mon.mhp -= hmd.dmg;
    }
    /* adjustments might have made tmp become less than what
       a level-draining artifact has already done to max HP */
    if (mon.mhp > mon.mhpmax) mon.mhp = mon.mhpmax;
    if (mon.mx === 0) {
        /*
         * jousting can lead to:
         *     mhurtle_to_doom()
         *      mhurtle()
         *       mintrap()
         *        trapeffect_hole()
         *         trapeffect_level_telep()
         *          migrate_to_level()
         * Set offmap in that situation so code to follow can test for it.*/
        hmd.offmap = true;
    }
    if (mon.mhp < 1) hmd.destroyed = true; /* DEADMONSTER() */

    await hmon_hitmon_pet(hmd, mon, state, random, env);

    await hmon_hitmon_splitmon(hmd, mon, obj, state, env);

    await hmon_hitmon_msg_hit(hmd, mon, obj, state, env);

    if (hmd.dryit) {
        /* apply.c dry_a_towel() changes wetness after the hit message.  The
           consumed result is void and that owner remains outside this span;
           retain the source call boundary without inventing a state update. */
        note_unported('apply.c dry_a_towel');
    }

    if (hmd.silvermsg)
        note_unported('uhitm.c hmon_hitmon_msg_silver');

    if (hmd.lightobj)
        note_unported('uhitm.c hmon_hitmon_msg_lightobj');

    const postMessage = requireAttackOperation(env, 'message');
    if (hmd.needpoismsg)
        await postMessage(
            `The poison doesn't seem to affect ${mon_nam(mon, state)}.`,
            state,
        );
    if (hmd.poiskilled) {
        await postMessage('The poison was deadly...', state);
        if (!hmd.already_killed)
            await xkilled(mon, XKILL_NOMSG, state, env);
        hmd.destroyed = true;
    } else if (hmd.destroyed) {
        if (!hmd.already_killed) {
            /* monst.h troll_baned() (246-247). Only Trollsbane sets
               gm.mkcorpstat_norevive, and js/corpstat.js mkcorpstat() reads
               it; a hero not wielding that artifact leaves it FALSE. */
            if (mon.data.mlet === S_TROLL && obj
                && obj.oartifact === ART_TROLLSBANE) {
                state.gm ??= {};
                state.gm.mkcorpstat_norevive = true;
            }
            await killed(mon, state, env); /* "takes care of most messages" */
            state.gm ??= {};
            state.gm.mkcorpstat_norevive = false;
        }
    } else if (state.u.umconf && hmd.hand_to_hand) {
        /* nohandglow() is a discarded visual effect, but the source still
           applies the canonical spellbook resistance before setting mconf. */
        note_unported('uhitm.c nohandglow');
        if (!mon.mconf
            && !await resist(mon, SPBOOK_CLASS, 0, NOTELL, state, random)) {
            mon.mconf = 1;
            if (!mon.mstun && !helpless(mon) && canseemon(mon, state)) {
                await postMessage(
                    `${Monnam(mon, state)} appears confused.`,
                    state,
                );
            }
        }
    }

    if (hmd.unpoisonmsg) {
        /* hmon_hitmon_do_hit() captured cxname() before poison/killed can
           destroy or detach obj, matching uhitm.c:1886-1889. */
        await postMessage(
            `Your ${hmd.saved_oname} ${vtense(hmd.saved_oname, 'are')}`
                + ' no longer poisoned.',
            state,
        );
    }

    if (!hmd.destroyed && !hmd.offmap) {
        await wakeup(mon, true, { ...env, state });
        /* C's `hitflags` local starts at M_ATTK_HIT.  mhitm_knockback()
           separately updates its DEF_DIED bit; the boolean only says that
           the knockback operation itself was accepted. */
        if (maybe_knockback) {
            const hitflags = { value: M_ATTK_HIT };
            const knocked = await mhitm_knockback(
                state.youmonst,
                mon,
                state.youmonst.data.mattk[0],
                hitflags,
                true,
                state,
                env,
                random,
            );
            if (knocked && (hitflags.value & M_ATTK_DEF_DIED))
                hmd.destroyed = true;
        }
    }
    return !hmd.destroyed;
}

// C ref: uhitm.c first_weapon_hit() (1962-1990). The whole body builds a
// livelog line for the first hit with a wielded weapon. pline.c
// livelog_printf() appends to the in-memory chronicle and to the external
// live log; only the latter sink remains unavailable here. Nothing else in
// the function changes state or draws.
function first_weapon_hit(weapon, state = game) {
    let text = '';
    // C includes a known cursed prefix but intentionally leaves blessed out.
    if (weapon.cursed && weapon.bknown) text += 'cursed ';
    if (obj_is_pname(weapon, state)) {
        text += weapon.oextra?.oname ?? '';
    } else {
        text += simpleonames(weapon, state);
        if (weapon.oartifact && weapon.dknown)
            text += ` named ${bare_artifactname(weapon, state)}`;
    }
    livelog_printf(
        LL_CONDUCT,
        `hit with a wielded weapon (${text}) for the first time`,
        state,
    );
}

// C ref: uhitm.c mhitm_ad_sedu() (4623-4748). Seduction / item theft attack.
// Three arms: hero attacks monster (uhitm, still delegated to steal_it()),
// monster attacks hero (mhitu, ported below), and monster attacks monster
// (mhitm, ported below).
//
// The mhitu arm: if the attacker is an animal, it acts like a hit message then
// falls through to steal(). If the hero's own species seduces, the attacker
// brags and teleports away. If canceled, "plain" message and maybe teleport.
// Otherwise steal() runs and the attacker teleports away on success.
async function mhitm_ad_sedu(magr, mattk, mdef, mhm, state = game, env = {}) {
    const random = env.random ?? { d, rn2, rnd };
    const message = requireAttackOperation(env, 'message');

    if (magr === state.youmonst) {
        // uhitm: steal_it() is a void callee whose result C discards. Keep
        // the source call boundary visible while the hero-versus-monster
        // theft operation remains outside this span.
        note_unported('uhitm.c steal_it');
        mhm.damage = 0;
        return;
    }

    if (mdef === state.youmonst) {
        // mhitu: monster seduces hero.
        const is_anml = is_animal(magr.data);
        // C ref: teleport.c rloc() with RLOC_MSG. The rloc env threads the
        // display and movement hooks that preflightOrdinaryRloc() requires
        // alongside the attack env's message function.
        const rlocEnv = {
            state,
            random: env.random,
            newsym,
            onscary: (x, y, mon, normEnv) =>
                onscary(x, y, mon, normEnv.state),
            setApparxy: set_apparxy,
            message,
        };

        if (is_anml) {
            await hitmsg(magr, mattk, state, env);
            if (magr.mcan) return;
            // Continue below to steal()
        } else if (dmgtype(state.youmonst?.data, AD_SEDU)
                   || dmgtype(state.youmonst?.data, AD_SSEX)) {
            // Hero's own species is seductive; attacker brags and teleports.
            const deaf = Boolean(
                state.u?.uprops?.[DEAF]?.intrinsic
                || state.u?.uprops?.[DEAF]?.extrinsic,
            );
            const bragMsg = deaf
                ? 'says something but you can\'t hear it'
                : magr.minvent
                    ? 'brags about the goods some dungeon explorer provided'
                    : 'makes some remarks about how difficult theft is lately';
            await message(
                `${capitalizedMonsterName(magr, state)} ${bragMsg}.`, state,
            );
            if (!(await tele_restrict(magr, state, { ...env, message })))
                await rloc(magr, RLOC_MSG, rlocEnv);
            mhm.hitflags = M_ATTK_AGR_DONE;
            mhm.done = true;
            return;
        } else if (magr.mcan) {
            const blind = Boolean(
                state.u?.uprops?.[BLINDED]?.intrinsic
                || state.u?.uprops?.[BLINDED]?.extrinsic,
            );
            if (!blind) {
                const adj = Adjmonnam(magr, 'plain', state);
                const verb = state.flags?.female ? 'charm' : 'seduce';
                const seem = state.flags?.female ? 'unaffected' : 'uninterested';
                await message(
                    `${adj} tries to ${verb} you, but you seem ${seem}.`,
                    state,
                );
            }
            if (random.rn2(3)) {
                if (!(await tele_restrict(magr, state, { ...env, message })))
                    await rloc(magr, RLOC_MSG, rlocEnv);
                mhm.hitflags = M_ATTK_AGR_DONE;
                mhm.done = true;
                return;
            }
            return;
        }

        const result = await steal(magr, state, env);
        switch (result) {
        case -1:
            mhm.hitflags = M_ATTK_AGR_DIED;
            mhm.done = true;
            return;
        case 0:
            return;
        default:
            if (!is_anml
                && !(await tele_restrict(magr, state, { ...env, message })))
                await rloc(magr, RLOC_MSG, rlocEnv);
            if (is_anml) {
                // Animal tried to run off with item; message handled
                // if canseemon. Not ported: locomotion() message for animal.
            }
            await monflee(magr, 0, false, false, state, env);
            mhm.hitflags = M_ATTK_AGR_DONE;
            mhm.done = true;
            return;
        }
    }

    // mhitm: monster seduces another monster. C cancels the attack before it
    // looks for an object, so a canceled aggressor keeps the damage that
    // mdamagem() initialized on entry.
    if (magr.mcan) return;

    // Find the first object that a tame aggressor may take. C's loop reads
    // the live nobj chain in order and leaves cursed objects eligible only to
    // a wild aggressor.
    let obj = mdef.minvent;
    if (magr.mtame) {
        while (obj && obj.cursed) obj = obj.nobj;
    }

    if (obj) {
        // C names the defender before extraction, because x_monnam() can
        // inspect the defender's saddle and other current state.
        const mdefnambuf = x_monnam(
            mdef,
            ARTICLE_THE,
            null,
            0,
            false,
            state,
            env,
        );

        if (state.u?.usteed === mdef
            && obj === which_armor(mdef, W_SADDLE, state)) {
            // steed.c dismount_steed() is a void callee and its
            // DISMOUNT_POLY arm remains outside this span. Preserve the call
            // boundary without replacing it with a throw that stops theft.
            if (typeof env.dismountSteed === 'function') {
                await env.dismountSteed(DISMOUNT_POLY, state, env);
            } else {
                note_unported('steed.c dismount_steed');
            }
        }

        // The W_WEP hook is already source-backed; provide it here so a
        // stolen wielded object clears the defender's weapon slot in the same
        // extraction operation. Other equipped-item hooks remain explicit
        // gaps in worn.c and are not invented here.
        const extractionEnv = {
            ...env,
            state,
            hooks: {
                ...(env.hooks ?? {}),
                mwepgone: env.hooks?.mwepgone
                    ?? ((mon, actionEnv) => mwepgone(mon, actionEnv)),
            },
        };
        extract_from_minvent(mdef, obj, true, false, extractionEnv);

        // add_to_minv() may merge and free obj, so C obtains its display name
        // before adding it to the aggressor's inventory.
        const onambuf = state.gv?.vis ? donameFresh(obj, state) : '';
        add_to_minv(magr, obj, { ...env, state });
        const buf = Monnam(magr, state, env);
        if (state.gv?.vis && canseemon(mdef, state)) {
            await message(
                `${buf} steals ${onambuf} from ${mdefnambuf}!`,
                state,
            );
        }

        // Both calls are void source callees. Existing partial ports are
        // safe no-ops when extraction cleared the weapon; retain their source
        // order and leave their still-unported effect paths explicit.
        possibly_unwield(mdef, false, env);
        mdef.mstrategy &= ~STRAT_WAITFORU;
        mselftouch(mdef, null, false, { ...env, state });

        if (mdef.mhp < 1) {
            const grew = grow_up(magr, mdef, { ...env, state });
            mhm.hitflags = M_ATTK_DEF_DIED
                | (grew ? 0 : M_ATTK_AGR_DIED);
            mhm.done = true;
            return;
        }
        if (magr.data.mlet === S_NYMPH
            && !(await tele_restrict(magr, state, { ...env, message }))) {
            const couldspot = canSpotMonster(magr, state);
            mhm.hitflags = M_ATTK_AGR_DONE;
            const rlocEnv = {
                ...env,
                state,
                random,
                newsym,
                onscary: (x, y, mon, normalized) =>
                    onscary(x, y, mon, normalized.state),
                setApparxy: set_apparxy,
            };
            await rloc(magr, RLOC_NOMSG, rlocEnv);
            if (state.gv?.vis && couldspot
                && !canSpotMonster(magr, state)) {
                await message(`${buf} suddenly disappears!`, state);
            }
        }
    }
    mhm.damage = 0;
}

// C ref: uhitm.c mhitm_ad_cold() (2625-2681). A cold-damage attack across
// all three combat directions. The mhitu arm (monster attacks hero) is fully
// ported: it prints hitmsg, checks magic cancellation, reports frost,
// applies Cold_resistance, and may call destroy_items(AD_COLD) on the hero's
// inventory when the attacker's level beats rn2(20). The uhitm (hero attacks
// monster) and mhitm (monster attacks monster) arms use unsupported().
export async function mhitm_ad_cold(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2 };
    const message = requireAttackOperation(env, 'message');
    const unsupported = requireAttackOperation(env, 'unsupported');
    const orig_dmg = mhm.damage;

    if (magr === state.youmonst) {
        /* uhitm */
        unsupported("the hero's own cold attack");
    } else if (mdef === state.youmonst) {
        /* mhitu */
        await hitmsg(magr, mattk, state, env);
        if (!await mhitm_mgc_atk_negated(magr, mdef, true, state, env)) {
            await message("You're covered in frost!", state);
            if (Cold_resistance(state)) {
                await message("The frost doesn't seem cold!", state);
                monstseesu(M_SEEN_COLD, state);
                mhm.damage = 0;
            } else {
                monstunseesu(M_SEEN_COLD, state);
            }
            if (magr.m_lev > random.rn2(20)) {
                await destroy_items(state.youmonst, AD_COLD, orig_dmg, env);
            }
        } else {
            mhm.damage = 0;
        }
    } else {
        /* mhitm */
        unsupported('one monster freezing another');
    }
}

// C ref: uhitm.c mhitm_ad_elec() (2683-2739), the `mdef == &gy.youmonst` arm.
// A shock attack landing on the hero: the attack's own message, the magic
// cancellation test, and the item destruction a high-level attacker adds.
//
// C's other two arms refuse. The hero's own shock attack (uhitm) has no caller
// here, because js/uhitm.js damageum() is unported. One monster shocking
// another (mhitm) does: js/mhitm.js mdamagem() reaches mhitm_adtyping(), which
// dispatches AD_ELEC here, so a pet that fights a shocking monster stops at
// that arm.
export async function mhitm_ad_elec(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2 };
    const message = requireAttackOperation(env, 'message');
    const unsupported = requireAttackOperation(env, 'unsupported');
    // C's `orig_dmg` is the damage as it stood on entry, which only the three
    // destroy_items() calls read. All three refuse below, so nothing here
    // outlives mhm.damage.

    if (magr === state.youmonst) {
        /* uhitm */
        unsupported("the hero's own shock attack");
    } else if (mdef === state.youmonst) {
        /* mhitu */
        await hitmsg(magr, mattk, state, env);
        if (!await mhitm_mgc_atk_negated(magr, mdef, true, state, env)) {
            await message('You get zapped!', state);
            if (propertyPresent(state.u, SHOCK_RES)) {
                // youprop.h:44 Shock_resistance. The arm prints "The zap
                // doesn't shock you!" and then records the resistance through
                // mondata.c monstseesu(), which is unported -- js/mondata.js
                // carries monstunseesu() alone -- so the whole arm stops
                // before its first line rather than printing and forgetting.
                unsupported('a shock-resistant hero shrugging off an attack');
            } else {
                monstunseesu(M_SEEN_ELEC, state);
            }
            if (magr.m_lev > random.rn2(20)) {
                // zap.c destroy_items() for the hero's own pack. Only the
                // monster half is ported (js/zap_destroy_items.js), and it
                // covers fire alone.
                unsupported("electricity destroying the hero's items");
            }
        } else {
            mhm.damage = 0;
        }
    } else {
        /* mhitm */
        unsupported('one monster shocking another');
    }
}

// C ref: uhitm.c mhitm_ad_drst() (3122-3163), the bounded monster-versus-
// hero arm. The shared magic-cancellation roll is made first, then a landed
// poison attack prints hitmsg() and spends the 1/8 poison-effect roll. The
// current development boundary has a poison-resistant hero, so the
// resistance response is complete. The non-resistant continuation calls
// attrib.c poisoned(), whose lethal, hit-point, and attribute-loss branches
// still need a monster-turn planning owner; it remains fail-closed after its
// source-side poison trigger.
function monsterPoisonSubject(monster, attack) {
    if (attack.aatyp === AT_WEAP)
        return monster.mw?.opoisoned ? 'weapon' : 'attack';
    if (attack.aatyp === AT_TUCH) return 'contact';
    if (attack.aatyp === AT_GAZE) return 'gaze';
    if (attack.aatyp === AT_BITE) return 'bite';
    return 'sting';
}

export async function mhitm_ad_drst(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2 };
    const unsupported = requireAttackOperation(env, 'unsupported');
    const negated = await mhitm_mgc_atk_negated(
        magr, mdef, false, state, env,
    );

    if (magr === state.youmonst) {
        /* uhitm */
        if (!negated && !random.rn2(8))
            unsupported('the hero poisoning a monster');
    } else if (mdef === state.youmonst) {
        /* mhitu */
        await hitmsg(magr, mattk, state, env);
        if (!negated && !random.rn2(8)) {
            const message = requireAttackOperation(env, 'message');
            const reason = `${monsterPossessive(magr, state, true)} `
                + `${monsterPoisonSubject(magr, mattk)}`;
            const resistance = state.u?.uprops?.[POISON_RES];
            if (!(resistance?.intrinsic || resistance?.extrinsic)) {
                unsupported('a non-resistant hero poisoned by a monster');
            }
            // attrib.c poisoned() prints this before checking
            // Poison_resistance, and then reports that the poison had no
            // effect. No further random draw or state change occurs here.
            await message(`${reason} was poisoned!`, state);
            await message("The poison doesn't seem to affect you.", state);
        }
    } else {
        /* mhitm */
        unsupported('one monster poisoning another');
    }
}

// C ref: uhitm.c mhitm_ad_phys() (3980-4200), its three arms: the
// `mdef == &gy.youmonst` one (4021-4127), including an ordinary weapon hit,
// and the mhitm one (4128-4200). An ordinary blow landing on the hero prints
// its line and records the hit. A wielded ordinary weapon first adds dmgval()
// to the damage hitmu() rolled. One monster's blow on another adjusts the
// damage mdamagem() rolled and prints nothing, because mhitm.c hitmm() has
// already printed.
//
// The hero's own physical arm is used by dokick.c's polymorphed kick path.
//
// Two pieces of the hero's arm stop where C acts:
//
//   AT_HUGS (4023-4037) sets u.ustuck and holds the hero. mhitu.c mattacku()
//     refuses its own AT_HUGS arm first, at js/mhitu.js:626, so no ported path
//     spells this attack. C's whole condition is kept rather than a bare aatyp
//     test, so the stop sits exactly where C's branch begins.
//   AT_WEAP with something wielded (4041-4121) admits the ordinary nonfatal
//     arm through dmgval() and hitmsg(). A petrifying corpse, gauntlets of
//     power, artifact, silver, pudding split, effective rust, poison, or a
//     potentially fatal total still stops before its unported continuation.
//
// An AT_WEAP attacker holding nothing is not that edge. It falls to the last
// arm with everyone else and prints hitmsg()'s default verb, which is what
// mattacku()'s AT_WEAP arm leaves behind when mon_wield_item() finds it no
// weapon to wield.
//
// Neither gm.mhitu_dieroll is read on the admitted path. mhm->specialdmg's
// readers sit inside the hero-attacker arm.
// The dieroll's readers, 4069 and 4107, sit in the artifact and poison paths,
// which remain refusal boundaries.
export async function mhitm_ad_phys(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const unsupported = requireAttackOperation(env, 'unsupported');
    const pa = magr.data;
    const pd = mdef.data;

    if (magr === state.youmonst) {
        /* uhitm */
        if (pd === state.mons[PM_SHADE]) {
            mhm.damage = 0;
            if (!mhm.specialdmg)
                unsupported('a shade attack without special damage');
        }
        mhm.damage += mhm.specialdmg;

        if (mattk.aatyp === AT_WEAP) {
            /* hmonas() deals the ordinary physical weapon damage itself;
               damageum() contributes nothing for this unusual arm. */
            mhm.damage = 0;
        } else if (mattk.aatyp === AT_KICK
                   || mattk.aatyp === AT_CLAW
                   || mattk.aatyp === AT_TUCH
                   || mattk.aatyp === AT_HUGS) {
            if (thick_skinned(pd)) {
                mhm.damage = mattk.aatyp === AT_KICK
                    ? 0 : Math.trunc((mhm.damage + 1) / 2);
            }
            /* Ring(s) of increase damage apply even when damage is zero. */
            const udaminc = state.u.udaminc ?? 0;
            if (udaminc > 0) {
                mhm.damage += udaminc;
            } else if (mhm.damage > 0) {
                mhm.damage += udaminc;
                if (mhm.damage < 1) mhm.damage = 1;
            }
        }
    } else if (mdef === state.youmonst) {
        /* mhitu */
        if (mattk.aatyp === AT_HUGS && !sticks(pd)) {
            unsupported('a monster grabbing the hero');
        } else { /* hand to hand weapon */
            const otmp = magr.mw; /* MON_WEP(magr) */

            if (mattk.aatyp === AT_WEAP && otmp) {
                if (otmp.otyp === CORPSE
                    && touch_petrifies(state.mons?.[otmp.corpsenm])) {
                    unsupported('a petrifying corpse weapon');
                }
                if (!(otmp.oclass === WEAPON_CLASS || is_weptool(otmp, state)))
                    unsupported('a non-weapon object hitting the hero');

                const gloves = which_armor(magr, W_ARMG, state);
                if (gloves?.otyp === GAUNTLETS_OF_POWER) {
                    unsupported('gauntlets of power adding weapon damage');
                }
                if (otmp.oartifact)
                    unsupported('an artifact weapon hitting the hero');

                const material = objectType(otmp, state).oc_material;
                if (material === SILVER
                    && (state.u.ulycn >= 0 || hates_silver(pd)))
                    unsupported('a silver weapon hitting the hero');
                if ((material === IRON || material === METAL)
                    && (pd === state.mons[PM_BLACK_PUDDING]
                        || pd === state.mons[PM_BROWN_PUDDING])) {
                    unsupported('an iron or metal weapon splitting the hero');
                }
                if (dmgtype(pd, AD_CORR) || dmgtype(pd, AD_RUST)
                    || (dmgtype(pd, AD_FIRE)
                        && pd !== state.mons[PM_STEAM_VORTEX])) {
                    unsupported('the hero eroding a monster weapon');
                }
                if (otmp.opoisoned || permapoisoned(otmp))
                    unsupported('a poisoned weapon hitting the hero');

                mhm.damage += dmgval(otmp, mdef, state, env);
                if (mhm.damage <= 0) mhm.damage = 1;

                await hitmsg(magr, mattk, state, env);
                mhm.hitflags |= M_ATTK_HIT;
            } else if (mattk.aatyp !== AT_TUCH || mhm.damage !== 0
                       || magr !== state.u.ustuck) {
                await hitmsg(magr, mattk, state, env);
                /* C's mhitm_knockback() reads this at 5338, past the stop at
                   js/uhitm.js:1689, and hitmu() returns it only for a `done`
                   this arm never sets. It is written because C writes it, and
                   because the two callers that will read it are the next work
                   on this function. */
                mhm.hitflags |= M_ATTK_HIT;
            }
        }
    } else {
        /* mhitm */
        let mwep = magr.mw; /* MON_WEP(magr) */
        /* C's own local, not gv.vis: this arm asks whether the hero sees both
           combatants, while mhitm.c's gv.vis asks whether it sees either. */
        const vis = canSeeMonster(magr, state) && canSeeMonster(mdef, state);

        if (mattk.aatyp !== AT_WEAP && mattk.aatyp !== AT_CLAW) mwep = null;

        if (shade_miss(magr, mdef, mwep, false, vis, state, env)) {
            mhm.damage = 0;
        } else if (mattk.aatyp === AT_KICK && thick_skinned(pd)) {
            /* [no 'kicking boots' check needed; monsters with kick attacks
               can't wear boots and monsters that wear boots don't kick] */
            mhm.damage = 0;
        } else if (mwep) { /* non-Null 'mwep' implies AT_WEAP || AT_CLAW */
            // uhitm.c:4145-4188 is the armed blow: a cockatrice corpse
            // wielded as a club, dmgval(), the gauntlets of power,
            // artifact_hit() with the grow_up() that follows it, rustm() and
            // the poison tail. mhitm.c mattackm() refuses AT_WEAP outright,
            // so the only way in is an AT_CLAW attacker holding a weapon.
            unsupported("a monster's wielded weapon landing on another");
        } else if (pa === state.mons[PM_PURPLE_WORM]
                   && pd === state.mons[PM_SHRIEKER]) {
            /* hack to enhance mm_aggression(); we don't want purple
               worm's bite attack to kill a shrieker because then it
               won't swallow the corpse; but if the target survives,
               the subsequent engulf attack should accomplish that */
            if (mhm.damage >= mdef.mhp && mdef.mhp > 1)
                mhm.damage = mdef.mhp - 1;
        }
    }
}

// C ref: uhitm.c shade_miss() (2013-2050). "used for hero vs monster and
// monster vs monster; also handles monster vs hero but that won't happen
// because hero can't be a shade".
//
// Partial: the head is the whole answer for every defender that is not a
// shade, and it is FALSE. C's `||` short-circuits on the species test, so
// dmgval() is not reached for one and is called here only when it is.
//
// A shade defender refuses. Everything below the head prints -- through
// objnam.c cxname() and hacklib.c vtense(), neither of them ported for this
// line -- and then marks the square and clears the shade's msleeping. The
// refusal sits above all of it, and above the TRUE that would tell the caller
// the blow passed harmlessly through.
export function shade_miss(
    magr,
    mdef,
    obj,
    thrown,
    verbose,
    state = game,
    env = {},
) {
    /* we're using dmgval() for zero/not-zero, not for actual damage amount */
    if (mdef.data !== state.mons[PM_SHADE]
        || (obj && dmgval(obj, mdef, state, env)))
        return false;

    const youagr = magr === state.youmonst;
    const youdef = mdef === state.youmonst;
    const message = env.message
        ?? (env.planning ? () => {} : ttyPline);
    const visible = youdef
        || cansee(mdef.mx, mdef.my, state)
        || sensesMonster(mdef, state)
        || (youagr && m_next2u(mdef, state));
    if (verbose && visible) {
        const what = !obj || shade_glare(obj, state)
            ? 'attack' : cxname(obj, state);
        const target = youdef ? 'you' : mon_nam(mdef, state);
        if (!thrown) {
            const whose = youagr
                ? 'Your' : s_suffix(Monnam(magr, state, env));
            void message(
                `${whose} ${what} ${vtense(what, 'pass')}`
                + ` harmlessly through ${target}.`,
                state,
                env,
            );
        } else {
            void message(
                `${The(what, state)} ${vtense(what, 'pass')}`
                + ` harmlessly through ${target}.`,
                state,
                env,
            );
        }
        if (!youdef && !canSpotMonster(mdef, state))
            map_invisible(mdef.mx, mdef.my, state);
    }
    if (!youdef) mdef.msleeping = 0;
    return true;
}

// C ref: uhitm.c mhitm_ad_blnd() (2958-3008). Apply one landed blinding
// attack in source order: hero versus monster, monster versus hero, then
// monster versus monster. `make_blinded()` remains the sole owner of the
// hero's timed blindness transition; passing the attack environment through
// it keeps the planning clone's status and vision state separate from the
// live game.
export async function mhitm_ad_blnd(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const message = requireAttackOperation(env, 'message');
    const random = env.random ?? { d, rn1, rn2, rnd };

    if (magr === state.youmonst) {
        /* uhitm */
        if (can_blnd(magr, mdef, mattk.aatyp, null, state)) {
            if (!heroIsBlind(state) && mdef.mcansee)
                await message(`${Monnam(mdef, state, env)} is blinded.`, state);
            mdef.mcansee = 0;
            mhm.damage += mdef.mblinded;
            if (mhm.damage > 127) mhm.damage = 127;
            mdef.mblinded = mhm.damage;
        }
        mhm.damage = 0;
    } else if (mdef === state.youmonst) {
        /* mhitu */
        if (can_blnd(magr, mdef, mattk.aatyp, null, state)) {
            if (!heroIsBlind(state))
                await message(`${Monnam(magr, state, env)} blinds you!`, state);
            const blindedTimeout = (state.u.uprops?.[BLINDED]?.intrinsic ?? 0)
                & TIMEOUT;
            await make_blinded(blindedTimeout + mhm.damage, false, state, env);
            // The source immediately checks Blind again. Eyes of the
            // Overworld may preserve sight while the property still changes.
            if (!heroIsBlind(state)) {
                await message('Your vision quickly clears.', state);
            }
        }
        mhm.damage = 0;
    } else {
        /* mhitm */
        if (can_blnd(magr, mdef, mattk.aatyp, null, state)) {
            if (state.gv?.vis && mdef.mcansee && canSpotMonster(mdef, state)) {
                let text = `${Monnam(mdef, state, env)} is blinded`;
                if (mdef.data?.pmidx === PM_ARCHON
                    && canSeeMonster(mdef, state)) {
                    text += ` by ${s_suffix(mon_nam(magr, state, env))} radiance`;
                }
                await message(`${text}.`, state);
            }
            const blinded = random.d(mattk.damn, mattk.damd) + mdef.mblinded;
            mdef.mblinded = blinded > 127 ? 127 : blinded;
            mdef.mcansee = 0;
            mdef.mstrategy &= ~STRAT_WAITFORU;
        }
        if (mhm) mhm.damage = 0;
    }
}

// C ref: uhitm.c mhitm_adtyping() (4781-4832). One landed blow's damage type
// selects the function that applies it. C's switch is written out in full so
// that the arms this port has not reached name the uhitm.c function a later
// slice puts in their place, and so that adding one is a one-line edit.
//
// C's `default` is not a refusal. An adtyp with no arm -- AD_MAGM, AD_DISN,
// AD_SPC1, AD_SPC2, AD_CLRC, AD_SPEL and AD_RBRE -- silently loses its damage,
// and mhitu.c hitmu() then lands a blow that prints nothing and costs no hit
// points. That is C's behavior, not a gap, so it is ported.
export async function mhitm_adtyping(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const unsupported = requireAttackOperation(env, 'unsupported');
    const unported = (name) => unsupported(`uhitm.c ${name}()`);

    switch (mattk.adtyp) {
    case AD_STUN: unported('mhitm_ad_stun'); break;
    case AD_LEGS: unported('mhitm_ad_legs'); break;
    case AD_WERE: unported('mhitm_ad_were'); break;
    case AD_HEAL: unported('mhitm_ad_heal'); break;
    case AD_PHYS:
        await mhitm_ad_phys(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_FIRE: unported('mhitm_ad_fire'); break;
    case AD_COLD:
        await mhitm_ad_cold(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_ELEC:
        await mhitm_ad_elec(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_ACID: unported('mhitm_ad_acid'); break;
    case AD_STON: unported('mhitm_ad_ston'); break;
    case AD_SSEX: unported('mhitm_ad_ssex'); break;
    case AD_SITM:
    case AD_SEDU:
        await mhitm_ad_sedu(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_SGLD: unported('mhitm_ad_sgld'); break;
    case AD_TLPT: unported('mhitm_ad_tlpt'); break;
    case AD_BLND:
        await mhitm_ad_blnd(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_CURS: unported('mhitm_ad_curs'); break;
    case AD_DRLI: unported('mhitm_ad_drli'); break;
    case AD_RUST: unported('mhitm_ad_rust'); break;
    case AD_CORR: unported('mhitm_ad_corr'); break;
    case AD_DCAY: unported('mhitm_ad_dcay'); break;
    case AD_DREN: unported('mhitm_ad_dren'); break;
    case AD_DRST:
    case AD_DRDX:
    case AD_DRCO:
        await mhitm_ad_drst(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_DRIN: unported('mhitm_ad_drin'); break;
    case AD_STCK: unported('mhitm_ad_stck'); break;
    case AD_WRAP: unported('mhitm_ad_wrap'); break;
    case AD_PLYS: unported('mhitm_ad_plys'); break;
    case AD_SLEE: unported('mhitm_ad_slee'); break;
    case AD_SLIM: unported('mhitm_ad_slim'); break;
    case AD_ENCH: unported('mhitm_ad_ench'); break;
    case AD_SLOW: unported('mhitm_ad_slow'); break;
    case AD_CONF: unported('mhitm_ad_conf'); break;
    case AD_POLY: unported('mhitm_ad_poly'); break;
    case AD_DISE: unported('mhitm_ad_dise'); break;
    case AD_SAMU: unported('mhitm_ad_samu'); break;
    case AD_DETH: unported('mhitm_ad_deth'); break;
    case AD_PEST: unported('mhitm_ad_pest'); break;
    case AD_FAMN: unported('mhitm_ad_famn'); break;
    case AD_DGST: unported('mhitm_ad_dgst'); break;
    case AD_HALU: unported('mhitm_ad_halu'); break;
    default:
        mhm.damage = 0;
    }
}

// C ref: uhitm.c damageum() (4835-4883). Resolve one polymorphed hero attack,
// including its physical damage arm and death handling. The other damage-type
// arms remain explicit uhitm.c operation boundaries in mhitm_adtyping().
export async function damageum(
    mdef,
    mattk,
    specialdmg,
    state = game,
    env = {},
) {
    const unsupported = requireAttackOperation(env, 'unsupported');
    const message = requireAttackOperation(env, 'message');
    const random = env.random ?? { d, rn1, rn2, rnd };
    const mhm = {
        damage: random.d(mattk.damn, mattk.damd),
        hitflags: M_ATTK_MISS,
        permdmg: 0,
        specialdmg,
        done: false,
    };

    if (is_demon(state.youmonst?.data)
        && !random.rn2(13)
        && !state.uwep
        && state.u.umonnum !== PM_AMOROUS_DEMON
        && state.u.umonnum !== PM_BALROG) {
        // demonpet() has no return value used by damageum().
        note_unported('demon.c demonpet');
        return M_ATTK_MISS;
    }

    await mhitm_adtyping(state.youmonst, mattk, mdef, mhm, state, {
        ...env,
        random,
    });
    if (mhm.done) return mhm.hitflags;

    mdef.mstrategy &= ~STRAT_WAITFORU;
    mdef.mhp -= mhm.damage;
    if (mdef.mhp < 1) {
        if (mdef.mtame && !cansee(mdef.mx, mdef.my, state)) {
            await message('You feel embarrassed for a moment.', state);
            if (mhm.damage)
                await xkilled(mdef, XKILL_NOMSG, state, {
                    ...env,
                    random,
                    message,
                    unsupported,
                });
        } else if (!state.flags?.verbose) {
            await message('You destroy it!', state);
            if (mhm.damage)
                await xkilled(mdef, XKILL_NOMSG, state, {
                    ...env,
                    random,
                    message,
                    unsupported,
                });
        } else if (mhm.damage) {
            await killed(mdef, state, {
                ...env,
                random,
                message,
                unsupported,
            });
        }
        return M_ATTK_DEF_DIED;
    }
    return M_ATTK_HIT;
}

// C ref: uhitm.c missum() (5197-5214). Reports a swing that did not land and
// wakes the target.
//
// mhitu.c could_seduce() at 5206 is constantly 0 here. Its last test rejects
// any aggressor that is neither an S_NYMPH nor PM_AMOROUS_DEMON, and the
// aggressor is gy.youmonst, whose data is the role's own species while
// Upolyd() is false. No role is either, so the call is left out rather than
// restated.
export async function missum(
    mdef,
    mattk,
    wouldhavehit,
    state = game,
    env = {},
) {
    const message = requireAttackOperation(env, 'message');

    if (wouldhavehit) /* monk is missing due to penalty for wearing suit */
        await message('Your armor is rather cumbersome...', state);

    if (canSpotMonster(mdef, state) && state.flags?.verbose)
        await message(`You miss ${monsterCommonName(mdef, state)}.`, state);
    else
        await message('You miss it.', state);
    if (!helpless(mdef)) await wakeup(mdef, true, { ...env, state });
}

// C ref: uhitm.c m_is_steadfast() (5218-5245). This is a pure equipment and
// terrain predicate shared by the three mhitm_knockback callers. It must read
// the caller's state, so planning clones cannot accidentally inspect the live
// hero's level or inventory.
export function m_is_steadfast(mon, state = game) {
    const isHero = mon === state.youmonst;
    const weapon = isHero ? state.uwep : mon?.mw;
    const flying = isHero
        ? Flying(state) || Levitation(state)
        : is_flyer(mon?.data) || is_floater(mon?.data);
    if (flying
        || Is_airlevel(state.u?.uz)
        || (Is_waterlevel(state.u?.uz)
            && !is_pool(state.u?.ux, state.u?.uy, state))) {
        return false;
    }
    if (weapon?.oartifact === ART_GIANTSLAYER) return true;
    if (m_carrying(mon, LOADSTONE, state)) return true;
    if (state.u?.usteed && mon === state.u.usteed
        && carrying(LOADSTONE, state)) return true;
    return false;
}

// C ref: uhitm.c mhitm_knockback() (5247-5420). The boolean answers whether
// the knockback arm was accepted; `hitflags.value` carries the independent
// attacker/defender death bits. The actual hurtle/mhurtle and dismount effects
// are void calls outside this owner, so their boundaries are recorded without
// fabricating movement or a death result.
export async function mhitm_knockback(
    magr,
    mdef,
    mattk,
    hitflags,
    weapon_used,
    state,
    env,
    random,
) {
    const flags = hitflags ?? { value: 0 };
    const rng = random ?? env?.random ?? { rn2 };
    rng.rn2(3); /* knockdistance: 67%: 1 step, 33%: 2 steps */
    let chance = 6; /* 1/6 chance of attack knocking back a monster */
    const u_agr = (magr === state.youmonst);
    let u_def = (mdef === state.youmonst);
    let was_u = false;
    let dismount = false;
    /* MON_WEP(magr) is magr->mw */
    const wep = weapon_used ? (u_agr ? state.uwep : magr.mw) : null;

    if (wep?.oartifact === ART_OGRESMASHER) chance = 2;

    if (rng.rn2(chance)) return false;

    /* only certain attacks qualify for knockback */
    if (!((mattk.adtyp === AD_PHYS)
          && (mattk.aatyp === AT_CLAW
              || mattk.aatyp === AT_KICK
              || mattk.aatyp === AT_BUTT
              || mattk.aatyp === AT_WEAP)))
        return false;

    /* don't knockback if attacker also wants to grab or engulf */
    if (attacktype(magr.data, AT_ENGL)
        || attacktype(magr.data, AT_HUGS)
        || sticks(magr.data))
        return false;

    /* decide where the first step will place the target; not accurate
       for being knocked out of saddle but doesn't need to be; used for
       test_move() and for message before actual hurtle */
    const defx = u_def ? state.u.ux : mdef.mx;
    const defy = u_def ? state.u.uy : mdef.my;
    const dx = sgn(defx - (u_agr ? state.u.ux : magr.mx));
    const dy = sgn(defy - (u_agr ? state.u.uy : magr.my));

    /* can't move most targets into or out of a doorway diagonally */
    if (u_def) {
        // C tests hack.c test_move(..., TEST_MOVE) here. The actual hurtle is
        // still outside this slice, but a failed probe must return FALSE so
        // the caller continues the ordinary hit path.
        if (!await test_move(defx, defy, dx, dy, TEST_MOVE, state, env))
            return false;
    } else {
        /* C's subset of test_move() is only for monster defenders. */
        if (!isok(defx + dx, defy + dy)) return false;
        const here = state.level?.at(defx, defy);
        if (IS_DOOR(here?.typ)
            && (defx - (magr.mx ?? 0)) && (defy - (magr.my ?? 0))
            && !doorless_door(here, state))
            return false;
    }

    /* A non-cursed saddle lets the hero be dismounted; a cursed saddle makes
       the steed itself the defender, while preserving the source hit flags. */
    if (u_def && state.u?.usteed) {
        const saddle = which_armor(state.u.usteed, W_SADDLE);
        if (saddle?.cursed) {
            mdef = state.u.usteed;
            was_u = true;
            u_def = false;
        } else {
            dismount = true;
        }
    }

    /* monsters must be alive */
    if ((!u_agr && magr.mhp < 1) || mdef.mhp < 1) return false;

    /* attacker must be much larger than defender */
    if (!(magr.data.msize > (mdef.data.msize + 1))) return false;

    if (wep && (is_flimsy(wep, state)
                || !((wep.oclass === WEAPON_CLASS || is_weptool(wep, state))
                     && (objectType(wep, state).oc_dir & WHACK)))) {
        return false;
    }
    if (unsolid(magr.data)) return false;
    if ((u_agr || u_def) && !(flags.value & M_ATTK_HIT)) return false;

    if (m_is_steadfast(mdef, state)) {
        const message = requireAttackOperation(env, 'message');
        if (u_def || (state.u?.usteed && mdef === state.u.usteed)) {
            const suffix = state.u?.usteed
                ? `and ${monsterCommonName(state.u.usteed, state)} ` : '';
            await message(`${suffix}don't budge.`, state);
        } else if (canseemon(mdef, state)) {
            await message(`${Monnam(mdef, state)} doesn't budge.`, state);
        }
        return false;
    }

    const knockedhow = dismount ? 'out of your saddle'
        : will_hurtle(mdef, defx + dx, defy + dy, state, env)
            ? 'backward' : 'back';
    const message = requireAttackOperation(env, 'message');
    if (u_def || canseemon(mdef, state)) {
        const attacker = u_agr ? 'You' : Monnam(magr, state);
        const defender = u_def || was_u ? 'you' : monsterCommonName(mdef, state);
        const extra = was_u && state.u?.usteed
            ? ` and ${monsterCommonName(state.u.usteed, state)}` : '';
        const adjective = rng.rn2(2) ? 'forceful' : 'powerful';
        const noun = rng.rn2(2) ? 'blow' : 'strike';
        await message(
            `${attacker} ${vtense(attacker, 'knock')} ${defender}${extra}`
                + ` ${knockedhow} with a ${adjective} ${noun}!`,
            state,
        );
    } else if (u_agr) {
        await message(
            `You feel ${monsterCommonName(mdef, state)} be knocked ${knockedhow}!`,
            state,
        );
    }

    if (state.u?.ustuck && (u_def || u_agr))
        set_ustuck(null, state);

    if (u_def) {
        if (dismount) {
            state.u.dx = dx;
            state.u.dy = dy;
            note_unported('steed.c dismount_steed DISMOUNT_KNOCKED');
        } else {
            note_unported('uhitm.c hurtle');
            flags.value |= M_ATTK_HIT;
        }
        set_apparxy(magr, { ...env, state });
        if (!state.u?.uprops?.[STUNNED]?.intrinsic
            && !rng.rn2(4)) {
            note_unported('timeout.c make_stunned');
        }
    } else {
        note_unported('uhitm.c mhurtle');
        if (!u_agr) flags.value |= M_ATTK_HIT;
        if (mdef.mhp < 1) {
            if (!was_u) flags.value |= M_ATTK_DEF_DIED;
        } else if (!rng.rn2(4)) {
            mdef.mstun = 1;
            if (mdef === state.u?.usteed)
                set_apparxy(magr, { ...env, state });
        }
    }
    if (!u_agr && magr.mhp < 1) flags.value |= M_ATTK_AGR_DIED;
    return true;
}

// C ref: uhitm.c passive() (5863-6120). The target's passive counter-attack
// against the hero who just swung at it. C's return value is discarded by both
// of hitum()'s calls, so nothing is returned here.
//
// `i` lands on the first empty attack slot, whose damage dice decide `tmp` and
// whose damage type selects the arms below. A species whose attack list is
// full has no such slot and returns at 5876-5877.
//
// Every damage type but AD_PHYS stops. The first switch (5893-6011) needs
// passive_obj(), mdamageu(), erode_obj(), erode_armor() or done_in_by(); the
// second (6014-6109) needs mdamageu(), nomul(), make_stunned(), healmon() or
// split_mon(). AD_PHYS is the empty slot's own damage type and takes the
// default arm of both, so an ordinary monster's whole live contribution is the
// rn2(3) that guards the second switch, and only while it is alive.
export function passive(
    mon,
    weapon,
    mhitb,
    maliveb,
    aatyp,
    wep_was_destroyed,
    state = game,
    env = {},
) {
    const random = env.random ?? { d, rn2, rnd };
    const ptr = mon.data;
    let i = 0;

    for (;; i++) {
        if (i >= NATTK) return; /* no passive attacks */
        if (ptr.mattk[i].aatyp === AT_NONE) break; /* try this one */
    }
    /* Note: tmp not always used. Its value feeds only arms that stop, but the
       draw is C's and has to happen where C makes it. */
    if (ptr.mattk[i].damn) random.d(ptr.mattk[i].damn, ptr.mattk[i].damd);
    else if (ptr.mattk[i].damd) random.d(mon.m_lev + 1, ptr.mattk[i].damd);

    if (ptr.mattk[i].adtyp !== AD_PHYS)
        requireAttackOperation(env, 'unsupported')('passive counter-attack');

    /* 6013. C's guard is `malive && !mon->mcan && rn2(3)`, and with every
       damage type but AD_PHYS stopped above, the switch it guards has only its
       do-nothing default arm left. The draw happens exactly where C makes it
       and its value decides nothing. */
    if (maliveb && !mon.mcan) random.rn2(3);
}

// C ref: uhitm.c passive_obj() (6122-6190), the no-passive-attack arm used
// when a monster-thrown ordinary weapon lands on the unpolymorphed hero. The
// first AT_NONE slot is C's passive-attack slot; ordinary human form leaves its
// damage type at AD_PHYS, whose switch arm changes neither object nor state.
export function passive_obj(mon, obj, mattk, state = game, env = {}) {
    if (!obj)
        return requireAttackOperation(env, 'unsupported')(
            'passive object lookup without an object',
        );
    if (!mattk) {
        for (let i = 0; i < NATTK; ++i) {
            if (mon.data.mattk[i].aatyp === AT_NONE) {
                mattk = mon.data.mattk[i];
                break;
            }
        }
        if (!mattk) return;
    }
    if (mattk.adtyp !== AD_PHYS) {
        return requireAttackOperation(env, 'unsupported')(
            'passive object damage',
        );
    }
    // C calls update_inventory() only when the affected object is carried.
    // The ranged-settlement caller has just placed it on the floor.
    if (carried(obj)) {
        return requireAttackOperation(env, 'unsupported')(
            'carried passive object inventory update',
        );
    }
}
