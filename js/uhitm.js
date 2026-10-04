// Hero-versus-monster interaction owned by uhitm.c.

import {
    ART_CLEAVER,
    ART_GIANTSLAYER,
    ART_OGRESMASHER,
    ART_STORMBRINGER,
    ART_SNICKERSNEE,
    ART_TROLLSBANE,
    artifact_hit,
    artifact_light,
    defends,
    is_art,
    permapoisoned,
    shade_glare,
} from './artifacts.js';
import {
    is_pool,
} from './dbridge.js';
import { isok } from './cmd_isok.js';
import { adjalign, exercise } from './attrib.js';
import { some_armor, setwornEnv } from './do_wear.js';
import {
    A_CON,
    A_DEX,
    A_LAWFUL,
    A_STR,
    A_WIS,
    ACID_RES,
    ANTIMAGIC,
    ARTICLE_A,
    ARTICLE_THE,
    ARTICLE_YOUR,
    BLINDED,
    COLD_RES,
    CONFUSION,
    DEAF,
    DRAIN_RES,
    DISP_ALWAYS,
    DISP_END,
    DISMOUNT_POLY,
    FACE,
    HALLUC,
    HALLUC_RES,
    FUMBLING,
    HMON_APPLIED,
    HMON_MELEE,
    HMON_KICKED,
    HMON_THROWN,
    INVIS,
    KILLED_BY,
    KILLED_BY_AN,
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
    M_SEEN_SLEEP,
    FAST,
    MON_EXPLODE,
    MSLOW,
    NATTK,
    NOTELL,
    NEED_WEAPON,
    NO_KILLER_PREFIX,
    NO_NC_FLAGS,
    P_BARE_HANDED_COMBAT,
    P_BASIC,
    P_KNIFE,
    P_LANCE,
    P_NONE,
    P_ISRESTRICTED,
    P_TWO_WEAPON_COMBAT,
    POTHIT_HERO_BASH,
    POTHIT_HERO_THROW,
    P_SKILLED,
    P_UNSKILLED,
    P_WHIP,
    POISON_RES,
    STONE_RES,
    SHOCK_RES,
    DETECT_MONSTERS,
    ECMD_TIME,
    EXACT_NAME,
    IS_OBSTRUCTED,
    MMOVE_DIED,
    MIM_REVEAL,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    M_AP_NOTHING,
    PROT_FROM_SHAPE_CHANGERS,
    SEE_INVIS,
    SICK,
    SICK_RES,
    SLEEP_RES,
    SLOW_DIGESTION,
    STOMACH,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    SUPPRESS_NAME,
    STONED,
    STUNNED,
    TIMEOUT,
    FIRE_RES,
    FREE_ACTION,
    TEST_MOVE,
    LEG,
    LOW_PM,
    LEFT_SIDE,
    RIGHT_SIDE,
    UNCHANGING,
    W_ARM,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_RINGL,
    W_RINGR,
    W_SADDLE,
    W_ARMU,
    engulfing_u,
    helpless,
    ismnum,
    M_AP_TYPE,
    HAND,
    NO_TRAP_FLAGS,
    MAX_EGG_HATCH_TIME,
    NEW_MOON,
    NEUTRAL,
    PARANOID_HIT,
    ROOMOFFSET,
    SHOPBASE,
    CXN_ARTICLE,
    CXN_PFX_THE,
    XKILL_NOMSG,
    XKILL_GIVEMSG,
    XKILL_NOCORPSE,
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
    Mgender,
    monsterCommonName,
    monsterPossessive,
    pmname,
    some_mon_nam,
    x_monnam,
    y_monnam,
} from './do_name.js';
import { livelog_printf, verbalize } from './pline.js';
import {
    displayPendingTtyMessageWindow,
    ttyPline,
    ttyUrgentPline,
} from './tty_message.js';
import { makeplural } from './fruit.js';
import {
    glyph_at,
    glyph_is_cmap,
    glyph_is_invisible,
    glyph_is_monster,
    glyph_is_object,
    glyph_is_warning,
    glyph_to_cmap,
    glyph_to_mon,
    glyph_to_obj,
    map_invisible,
    map_location,
    mon_to_glyph,
    newsym,
    shieldeff,
    tmp_at,
    tp_sensemon,
} from './display.js';
import { u_wipe_engr } from './engrave.js';
import { game } from './gstate.js';
import {
    check_capacity,
    doorless_door,
    end_running,
    nh_delay_output,
    near_capacity,
    nomul,
    overexertion,
    test_move,
    You_can_move_again,
} from './hack.js';
import { in_rooms } from './rooms.js';
import { dopay, tended_shop } from './shk.js';
import { paranoid_query } from './cmd.js';
import { Punished } from './steed.js';
import { dist2, ing_suffix, s_suffix, sgn } from './hacklib.js';
import { change_luck } from './moveloop_preamble.js';
import { hurtle, mhurtle, will_hurtle } from './dothrow.js';
// js/mhitu.js imports mhitm_adtyping() and mhitm_knockback() from this file,
// so this edge closes an import cycle, exactly as mhitu.c and uhitm.c call
// into each other. Both bindings are hoisted function declarations, which an
// ES module cycle initializes before either module body runs, and nothing here
// reads them at module scope.
import {
    could_seduce,
    diseasemu,
    getmattk,
    hitmsg,
    m_next2u,
    magic_negation,
    mpoisons_subj,
    mtrapped_in_pit,
    mdamageu,
    Protection_from_shape_changers,
    u_slow_down,
} from './mhitu.js';
import { abuse_dog } from './dog.js';
import { losexp } from './exper.js';
import {
    angry_guards,
    killed,
    m_carrying,
    mongone,
    mlifesaver,
    mon_give_prop,
    mondied,
    newcham,
    corpse_chance,
    golemeffects,
    seemimic,
    setmangry,
    set_ustuck,
    unstuck,
    wakeup,
    wake_nearto,
    monkilled,
    shieldeff_mon,
    xkilled,
    were_change,
} from './mon.js';
import {
    amorphous,
    amphibious,
    bigmonst,
    breathless,
    attacktype,
    can_blnd,
    can_be_strangled,
    defended,
    dmgtype,
    dmgtype_fromattack,
    flaming,
    gender,
    has_head,
    haseyes,
    hides_under,
    is_animal,
    is_demon,
    is_elf,
    is_floater,
    is_flyer,
    locomotion,
    is_orc,
    is_undead,
    is_vampshifter,
    is_were,
    is_rider,
    is_watch,
    is_whirly,
    humanoid,
    mindless,
    mon_hates_blessings,
    mon_hates_light,
    mon_hates_silver,
    hates_silver,
    monsndx,
    monstseesu,
    monstunseesu,
    noncorporeal,
    nonliving,
    resists_drli,
    Resists_Elem,
    noattacks,
    passes_walls,
    passes_rocks,
    resists_blnd,
    resists_blnd_by_arti,
    stagger,
    sticks,
    thick_skinned,
    touch_petrifies,
    poly_when_stoned,
    unsolid,
    type_is_pname,
} from './mondata.js';
import {
    monflee,
    monfleeMessage,
    onscary,
    set_apparxy,
    youHear,
} from './monmove.js';
import {
    isolatePlannedVision,
    moveSimpleOrdinary,
} from './unported_monster_actions.js';
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
    AD_SPEL,
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
    AT_BUTT,
    AT_BITE,
    AT_BREA,
    AT_BOOM,
    AT_CLAW,
    AT_ENGL,
    AT_EXPL,
    AT_SPIT,
    AT_GAZE,
    AT_HUGS,
    AT_KICK,
    AT_MAGC,
    AT_NONE,
    AT_STNG,
    AT_TENT,
    AT_TUCH,
    AT_WEAP,
    G_UNIQ,
    G_NOCORPSE,
    PM_BARBARIAN,
    PM_BLACK_PUDDING,
    PM_BROWN_PUDDING,
    PM_ELF,
    PM_BABY_LONG_WORM,
    PM_LONG_WORM,
    PM_LONG_WORM_TAIL,
    PM_GREMLIN,
    PM_HEALER,
    PM_KNIGHT,
    PM_MONK,
    PM_AMOROUS_DEMON,
    PM_ARCHON,
    PM_BALROG,
    PM_FOG_CLOUD,
    PM_GREEN_SLIME,
    PM_CLAY_GOLEM,
    PM_FLOATING_EYE,
    PM_IRON_GOLEM,
    PM_MEDUSA,
    PM_PYROLISK,
    PM_PURPLE_WORM,
    PM_ROPE_GOLEM,
    PM_ROGUE,
    PM_SAMURAI,
    PM_SHADE,
    PM_SHRIEKER,
    PM_STONE_GOLEM,
    PM_STEAM_VORTEX,
    NON_PM,
    S_LIGHT,
    S_BLOB,
    S_EEL,
    S_EYE,
    S_FUNGUS,
    S_HUMAN,
    S_LEPRECHAUN,
    S_MIMIC,
    S_NYMPH,
    S_TROLL,
    S_GNOME,
    S_KOBOLD,
    S_LICH,
    S_MUMMY,
    S_ORC,
    S_ZOMBIE,
} from './monsters.js';
import {
    engulf_target,
    failed_grab,
    paralyze_monst,
    sleep_monst,
    slept_monst,
} from './mhitm.js';
import { fall_asleep } from './timeout.js';
import { set_ulycn } from './were.js';
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
    is_axe,
    is_blade,
    is_wet_towel,
    place_object,
    splitobj,
    objectType,
    stone_missile,
    weight,
} from './obj.js';
import {
    add_to_minv, carrying, freeinv, obfree, update_inventory, useup, useupall,
} from './invent.js';
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
    Yname2,
    vtense,
    yname,
    Yobjnam2,
    ysimple_name as ysimpleName,
    mshot_xname,
    isPoisonable,
    the,
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
    WAN_LIGHT,
    GAUNTLETS_OF_POWER,
    GEM_CLASS,
    HEAVY_IRON_BALL,
    IRON,
    IRON_SHOES,
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
    ARMOR_CLASS,
    WEAPON_CLASS,
    LOW_BOOTS,
    WHACK,
    YA,
    YUMI,
} from './objects.js';
import { acurr } from './attrib.js';
import { set_wounded_legs } from './do.js';
import { encumber_msg } from './pickup.js';
import {
    make_blinded, make_confused, make_sick, make_slimed, make_stunned,
    potionhit,
} from './potion.js';
import { d, rn1, rn2, rne, rnl, rnd, rnz } from './rng.js';
import { night } from './calendar.js';
import { heroIsBlind, messageAt } from './startup_a11y.js';
import { P_SKILL, weapon_type } from './startup_skills.js';
import {
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
import {
    can_twoweapon,
    cantwield,
    drop_uswapwep,
    untwoweapon,
    uwepgone,
} from './wield.js';
import {
    bimanual,
    extract_from_minvent,
    find_mac,
    is_pole,
    mon_adjust_speed,
    set_twoweap,
    setuwep,
    which_armor,
} from './worn.js';
import { steal } from './steal.js';
import { rloc, tele_restrict } from './teleport.js';
import {
    Flying,
    Levitation,
    unconscious,
} from './trap.js';
import { mintrap } from './trap_effects.js';
import { mselftouch } from './trap_effects.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { destroy_items } from './zap_destroy_items.js';
import {
    Cold_resistance, drain_item, exclam, hit, resist,
} from './zap.js';
import { Finish_digestion, eating_conducts, is_fainted, newuhs } from './eat.js';
import { note_unported } from './unported.js';
import { m_useup } from './mthrowu.js';
import { explode, adtyp_to_expltype } from './explode.js';
import { cansee } from './vision.js';
import { body_part, mbodypart, polymon, rehumanize, uunstick } from './polyself.js';
import { observe_object } from './o_init.js';
import { obj_resists } from './bury.js';
import { mhidden_description } from './pager.js';
import { cutworm } from './worm.js';
import { canseemon, canspotmon, sensemon } from './display.js';

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

// C ref: youprop.h Deaf.  The role-play flag is part of the macro even when
// no timed deafness property is active.
function Deaf(state) {
    return propertyPresent(state?.u, DEAF)
        || Boolean(state?.u?.uroleplay?.deaf);
}

// C ref: uhitm.c flash_hits_mon(). The result is consumed by zap.c:bhitm()
// for a broken WAN_LIGHT, while camera callers discard it. Keep the not-on-head
// guard, mimic reveal, wake-up, blindness and artifact-resistance branches in
// source order because each can change both the message and later RNG calls.
export async function flash_hits_mon(
    monster,
    object,
    state = game,
    random = { d, rn2, rnd },
    rawEnv = {},
) {
    if (state.gn?.notonhead) return 0;
    const x = monster.mx;
    const y = monster.my;
    const location = state.level?.at(x, y);
    const useeit = canseemon(monster, state);
    let result = 0;

    if (M_AP_TYPE(monster) !== M_AP_NOTHING) {
        const oldGlyph = glyph_at(x, y, state);
        const description = mhidden_description(monster, state, {
            showAlternateMonster: true,
        });
        await wakeup(monster, false, { ...rawEnv, state, random });
        if (glyph_at(x, y, state) !== oldGlyph) {
            const article = monster.mtame ? ARTICLE_YOUR : ARTICLE_A;
            const realName = x_monnam(
                monster, article, null, 0, false, state, rawEnv,
            );
            await ttyPline(
                `That ${description} is really ${realName}`
                    + `${monster.mtame ? '.' : '!'}`,
                state,
                rawEnv,
            );
            result = 1;
        }
    }

    if (monster.msleeping && haseyes(monster.data)) {
        monster.msleeping = false;
        if (useeit) {
            await ttyPline(
                `The flash awakens ${mon_nam(monster, state, rawEnv)}.`,
                state,
                rawEnv,
            );
            result = 1;
        }
    } else if (monster.data?.mlet !== S_LIGHT) {
        if (!resists_blnd(monster, state)) {
            const distance = dist2(object.ox, object.oy, x, y);
            if (useeit) {
                await ttyPline(
                    `${Monnam(monster, state, rawEnv)} is blinded by the flash!`,
                    state,
                    rawEnv,
                );
                result = 1;
            }
            if (monster.data === state.mons?.[PM_GREMLIN]) {
                // Rule #1: Keep them out of the light. Cameras and broken
                // light wands share light_hits_gremlin() but use different
                // source dice exactly as uhitm.c does.
                const amount = object.otyp === WAN_LIGHT
                    ? random.d(1 + object.spe, 4)
                    : random.rnd(Math.min(monster.mhp, 4));
                await light_hits_gremlin(
                    monster, amount, state, { ...rawEnv, random },
                );
            }
            if (monster.mhp >= 1) {
                if (!state.context?.mon_moving)
                    await setmangry(monster, true, { ...rawEnv, state });
                if (distance < 9 && !monster.isshk && random.rn2(4)) {
                    const fleeTime = random.rn2(4) ? random.rnd(100) : 0;
                    await monflee(monster, fleeTime, false, true, {
                        ...rawEnv,
                        state,
                        random,
                        canSeeMonster: rawEnv.canSeeMonster
                            ?? ((subject) => canseemon(subject, state)),
                        fleeMessage: rawEnv.fleeMessage ?? monfleeMessage,
                    });
                }
                monster.mcansee = false;
                monster.mblinded = distance < 3
                    ? 0
                    : random.rnd(1 + Math.trunc(50 / distance));
            }
        } else if (useeit) {
            if (resists_blnd_by_arti(monster, state))
                await shieldeff_mon(monster, { ...rawEnv, state });
            if (state.flags?.verbose) {
                if (location?.lit) {
                    await ttyPline(
                        `The flash of light shines on ${mon_nam(monster, state, rawEnv)}.`,
                        state,
                        rawEnv,
                    );
                } else {
                    await ttyPline(
                        `${Monnam(monster, state, rawEnv)} is illuminated.`,
                        state,
                        rawEnv,
                    );
                }
                result = 2;
            }
        }
    }

    if (result) {
        if (!location?.lit)
            await displayPendingTtyMessageWindow(state);
        result &= 1;
    }
    return result;
}

// C ref: uhitm.c light_hits_gremlin(). This is also used by read.c:litroom,
// so its wake radius, moving-monster death owner and unseen-glyph repair stay
// shared with camera and wand flashes.
export async function light_hits_gremlin(
    monster,
    damage,
    state = game,
    rawEnv = {},
) {
    const random = rawEnv.random ?? { rn2, rnd };
    const distance = dist2(state.u.ux, state.u.uy, monster.mx, monster.my);
    if (!Deaf(state) && distance <= 90) {
        await ttyPline(
            `${Monnam(monster, state, rawEnv)} `
                + `${damage > monster.mhp / 2 ? 'wails in agony' : 'cries out in pain'}!`,
            state,
            rawEnv,
        );
    } else if (canseemon(monster, state)) {
        await ttyPline(
            `${Monnam(monster, state, rawEnv)} recoils from the light!`,
            state,
            rawEnv,
        );
    }
    monster.mhp -= damage;
    await wake_nearto(monster.mx, monster.my, 30, {
        ...rawEnv, state, random,
    });
    if (monster.mhp < 1) {
        if (state.context?.mon_moving) {
            await monkilled(monster, null, AD_BLND, state, {
                ...rawEnv, random,
            });
        } else {
            await killed(monster, state, { ...rawEnv, random });
        }
    } else if (cansee(monster.mx, monster.my, state)
        && !canspotmon(monster, state)) {
        map_invisible(monster.mx, monster.my, state);
    }
}

// C ref: display.h is_safemon().
export function is_safemon(monster, state = game) {
    const hero = state.u;
    return Boolean(
        state.flags?.safe_dog
        && monster?.mpeaceful
        && canspotmon(monster, state)
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
// C's; mhitm_ad_dren():2422 and mhitm_ad_stck():3310 are arms that pass FALSE
// and remain outside this span.
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
            if (mdef === state.youmonst) {
                await message('You avoid harm.', state);
            } else if (state.gv?.vis && canseemon(mdef, state)) {
                // C uses pline_mon() for a visible monster defender, carrying
                // its location through set_msg_xy(); canspotmon() is broader
                // because detection and telepathy also count as sensing.
                await message(
                    messageAt(
                        `${Monnam(mdef, state, env)} avoids harm.`,
                        mdef.mx,
                        mdef.my,
                        state,
                    ),
                    state,
                );
            }
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

    if (!canspotmon(mtmp, state)
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
export async function attack_checks(mtmp, wep, state = game, env = {}) {
    const message = env.message ?? ttyPline;

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

    // 230-252: a target the hero cannot spot, not hidden under something.
    if (!canspotmon(mtmp, state)
        && !glyph_is_warning(glyph)
        && !glyph_is_invisible(glyph)
        && !(!(heroIsBlind(state)) && mtmp.mundetected
            && hides_under(mtmp.data))) {
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
        && !glyph_is_warning(glyph)
        && !sensemon(mtmp, state)) {
        if (glyph_is_invisible(glyph)) {
            // If a hidden mimic was where the player remembers an unseen
            // monster, the player is in luck -- attacks it even though hidden.
            seemimic(mtmp, state);
            return false;
        }
        await stumble_onto_mimic(mtmp, state, {
            ...env,
            message,
            pline: message,
        });
        return true;
    }

    // 268-297: a hidden or submerged monster the hero cannot see.
    if (mtmp.mundetected && !canseemon(mtmp, state)
        && !glyph_is_warning(glyph)
        && (hides_under(mtmp.data) || mtmp.data?.mlet === S_EEL)) {
        mtmp.mundetected = 0;
        mtmp.msleeping = 0;
        newsym(mtmp.mx, mtmp.my);
        if (glyph_is_invisible(glyph)) {
            seemimic(mtmp, state);
            return false;
        }
        if (!tp_sensemon(mtmp, state)
            && !propertyPresent(state.u, DETECT_MONSTERS)) {
            const lmonbuf = l_monnam(mtmp, state);
            const notseen = lmonbuf === 'it';
            if (!heroIsBlind(state) && Hallucination(state)) {
                await message(`A ${mtmp.mtame ? 'tame' : 'wild'} `
                    + `${notseen ? 'creature' : lmonbuf} `
                    + `${notseen ? 'is present' : 'appears'}!`, state);
            } else if (heroIsBlind(state)
                || (is_pool(mtmp.mx, mtmp.my, state)
                    && !state.u.uinwater)) {
                await message("Wait!  There's a hidden monster there!", state);
            } else {
                const obj = state.level?.objects?.[mtmp.mx]?.[mtmp.my];
                if (obj) {
                    const name = notseen
                        ? something : an(lmonbuf);
                    await message(`Wait!  There's ${name} hiding under `
                        + `${donameFresh(obj, state)}!`, state);
                }
            }
            return true;
        }
    }

    // 303-306: wake up a disguised or hidden monster the hero can sense.
    if ((mtmp.mundetected || M_AP_TYPE(mtmp)) && sensemon(mtmp, state)) {
        mtmp.mundetected = 0;
        await wakeup(mtmp, true, env);
    }

    if (state.flags?.confirm && mtmp.mpeaceful
        && !intrinsicProperty(state.u, CONFUSION)
        && !Hallucination(state)
        && !intrinsicProperty(state.u, STUNNED)) {
        if (is_art(wep, ART_STORMBRINGER)) {
            state.go ??= {};
            state.go.override_confirmation = true;
            return false;
        }
        if (canspotmon(mtmp, state)) {
            const prompt = `Really attack ${mon_nam(mtmp, state)}?`;
            if (!await (env.paranoidQuery ?? paranoid_query)(
                Boolean(state.flags?.paranoia_bits & PARANOID_HIT),
                prompt,
                state,
            )) {
                state.context.move = 0;
                return true;
            }
        }
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

    const message = env.message ?? ttyPline;
    const role = state.urole?.mnum;
    if (role === PM_KNIGHT && u.ualign.type === A_LAWFUL
        && !is_undead(mtmp.data)
        && (helpless(mtmp) || (mtmp.mflee && !mtmp.mavenge))) {
        await message('You caitiff!', state);
        adjalign(-1, state);
    } else if (role === PM_SAMURAI && mtmp.mpeaceful) {
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
// Its maybe_polyd() reads at 378 and 404 select the current form while the
// hero is polymorphed, and the ordinary level or race otherwise. The newly
// wired hmonas() path consumes this result while the hero is polymorphed.
// The Monk adjustment at 397 is likewise limited to the unpolymorphed hero.
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
        + (Upolyd(u) ? state.youmonst.data.mlevel : u.ulevel);

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
    if (state.urole?.mnum === PM_MONK && !Upolyd(u)) {
        if (state.uarm) {
            counters.role_roll_penalty = state.urole.spelarmr;
            tmp -= counters.role_roll_penalty;
        } else if (!state.uwep && !state.uarms) {
            tmp += Math.trunc(u.ulevel / 3) + 2;
        }
    }
    if (is_orc(mtmp.data)
        && (Upolyd(u) ? is_elf(state.youmonst.data)
            : state.urace?.mnum === PM_ELF)) {
        tmp++;
    }

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

export function heroSick(state) {
    return Boolean(state.u?.uprops?.[SICK]?.intrinsic);
}

export function heroSickResistance(state) {
    const property = state.u?.uprops?.[SICK_RES];
    return Boolean(property?.intrinsic || property?.extrinsic
        || defended(state.youmonst, AD_DISE, state));
}

export function heroStoneResistance(state) {
    const property = state.u?.uprops?.[STONE_RES];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

export function heroInvisible(state) {
    const invis = state.u?.uprops?.[INVIS];
    const seeInvisible = state.u?.uprops?.[SEE_INVIS];
    return Boolean((invis?.intrinsic || invis?.extrinsic) && !invis?.blocked
        && !(seeInvisible?.intrinsic || seeInvisible?.extrinsic));
}

export function heroSlowDigestion(state) {
    const property = state.u?.uprops?.[SLOW_DIGESTION];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

export function heroUnchanging(state) {
    const property = state.u?.uprops?.[UNCHANGING];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

export function heroHatesSilver(state) {
    return state.u?.ulycn >= LOW_PM || hates_silver(state.youmonst?.data);
}

export function digests(species) {
    return Boolean(dmgtype_fromattack(species, AD_DGST, AT_ENGL));
}

export function enfolds(species) {
    return Boolean(dmgtype_fromattack(species, AD_WRAP, AT_ENGL));
}

export function hugThrottles(species, state) {
    return species === state.mons?.[PM_ROPE_GOLEM];
}

async function youFeel(line, state, env) {
    const unaware = Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || is_fainted(state));
    await requireAttackOperation(env, 'message')(
        `${unaware ? 'You dream that you feel ' : 'You feel '}${line}`,
        state,
    );
}

// C ref: uhitm.c explum() (4891-4928). The return is consumed by hmonas().
export async function explum(mdef, mattk, state = game, env = {}) {
    const random = env.random ?? { d };
    let damage = random.d(mattk.damn, mattk.damd);
    const message = requireAttackOperation(env, 'message');

    switch (mattk.adtyp) {
    case AD_BLND:
        if (mdef && !resists_blnd(mdef, state)) {
            await message(
                `${Monnam(mdef, state, env)} is blinded by your flash of light!`,
                state,
            );
            mdef.mblinded = Math.min((mdef.mblinded ?? 0) + damage, 127);
            mdef.mcansee = 0;
        }
        break;
    case AD_HALU:
        if (mdef && haseyes(mdef.data) && mdef.mcansee) {
            await message(
                `${Monnam(mdef, state, env)} is affected by your flash of light!`,
                state,
            );
            mdef.mconf = 1;
        }
        break;
    case AD_COLD:
    case AD_FIRE:
    case AD_ELEC:
        await explode(
            state.u.ux,
            state.u.uy,
            (mattk.adtyp - 1) + 20,
            damage,
            MON_EXPLODE,
            adtyp_to_expltype(mattk.adtyp),
            state,
            { ...env, random },
        );
        if (mdef && mdef.mhp < 1)
            return M_ATTK_DEF_DIED;
        break;
    default:
        break;
    }
    await wake_nearto(state.u.ux, state.u.uy, 7 * 7, {
        ...env, state, random,
    });
    return M_ATTK_HIT;
}

// C ref: uhitm.c start_engulf() (4931-4946), including its transient display
// glyph and two source-ordered output delays.
export async function start_engulf(mdef, state = game, env = {}) {
    const message = requireAttackOperation(env, 'message');
    const uDigest = digests(state.youmonst.data);
    const uEnfold = enfolds(state.youmonst.data);
    if (!heroInvisible(state)) {
        map_location(state.u.ux, state.u.uy, true, state);
        await tmp_at(
            DISP_ALWAYS,
            mon_to_glyph(state.youmonst, state),
            state,
        );
        await tmp_at(mdef.mx, mdef.my, state);
    }
    const verb = uDigest ? 'swallow' : uEnfold ? 'enclose' : 'engulf';
    await message(
        `You ${verb} ${mon_nam(mdef, state, env)}${uDigest ? ' whole' : ''}!`,
        state,
    );
    await nh_delay_output(state);
    await nh_delay_output(state);
}

// C ref: uhitm.c end_engulf() (4949-4955).
export async function end_engulf(state = game) {
    if (!heroInvisible(state)) {
        await tmp_at(DISP_END, 0, state);
        await newsym(state.u.ux, state.u.uy, state);
    }
}

// C ref: uhitm.c gulpum() (4958-5195). Its result is consumed by hmonas();
// deferred corpse effects use eat.c:Finish_digestion through state.afternmv.
export async function gulpum(mdef, mattk, state = game, env = {}) {
    const random = env.random ?? { d, rn2, rnd };
    const message = requireAttackOperation(env, 'message');
    const uDigest = digests(state.youmonst.data);
    const uEnfold = enfolds(state.youmonst.data);
    const expelVerb = uDigest ? 'regurgitate' : uEnfold ? 'release' : 'expel';
    const pd = mdef.data;
    let damage = random.d(mattk.damn, mattk.damd);

    if (!engulf_target(state.youmonst, mdef, state))
        return M_ATTK_MISS;

    if (!(uDigest && state.u.uhunger >= 1500) && !state.u.uswallow) {
        if (!flaming(state.youmonst.data)) {
            for (let obj = mdef.minvent; obj; obj = obj.nobj)
                note_unported('apply.c snuff_lit');
        }

        if (is_vampshifter(mdef)
            && await newcham(mdef, state.mons?.[mdef.cham], {
                ...env, state, ncflags: NO_NC_FLAGS,
            })) {
            const verb = uDigest ? 'swallow' : uEnfold ? 'enclose' : 'engulf';
            await message(
                `You ${verb} it, then ${expelVerb} it.`,
                state,
            );
            if (canspotmon(mdef, state)) {
                await message(
                    `It turns into ${x_monnam(
                        mdef,
                        ARTICLE_A,
                        null,
                        SUPPRESS_NAME | SUPPRESS_IT | SUPPRESS_INVISIBLE,
                        false,
                        state,
                        env,
                    )}.`,
                    state,
                );
            } else {
                map_invisible(mdef.mx, mdef.my, state);
            }
            return M_ATTK_HIT;
        }

        const fatalGulp = (touch_petrifies(pd) && !heroStoneResistance(state))
            || (mattk.adtyp === AD_DGST
                && (is_rider(pd)
                    || (pd === state.mons?.[PM_MEDUSA]
                        && !heroStoneResistance(state))));

        if (mattk.adtyp === AD_DGST
            && (!heroSlowDigestion(state) || fatalGulp)) {
            await eating_conducts(pd, state);
        }

        if (fatalGulp && !is_rider(pd)) {
            await message(
                `You ${uDigest ? 'englut' : 'engulf'} ${mon_nam(mdef, state, env)}.`,
                state,
            );
            // trap.c instapetrify() is a discarded void death transition.
            note_unported('trap.c instapetrify');
        } else {
            await start_engulf(mdef, state, { ...env, random, message });
            switch (mattk.adtyp) {
            case AD_DGST:
                if (is_rider(pd)) {
                    await message(
                        'Unfortunately, digesting any of it is fatal.', state,
                    );
                    await end_engulf(state);
                    state.killer ??= {};
                    state.killer.name = `unwisely tried to eat ${pmname(pd, Mgender(mdef, state))}`;
                    state.killer.format = NO_KILLER_PREFIX;
                    note_unported('end.c done');
                    return M_ATTK_MISS;
                }
                if (heroSlowDigestion(state)) {
                    damage = 0;
                    break;
                }
                {
                    const lifesaver = mlifesaver(mdef, state);
                    if (lifesaver)
                        await m_useup(mdef, lifesaver, { ...env, state });
                }
                await newuhs(false, state, env);
                state.gm ??= {};
                state.gm.mswallower = state.youmonst;
                await xkilled(
                    mdef,
                    XKILL_GIVEMSG | XKILL_NOCORPSE,
                    state,
                    { ...env, random, message },
                );
                if (mdef.mhp >= 1) {
                    await message(
                        `You hurriedly regurgitate the sizzling in your ${body_part(STOMACH, state.youmonst)}.`,
                        state,
                    );
                } else {
                    let turns = 1 + (Math.trunc(pd.cwt) >> 8);
                    const canLeaveCorpse = await corpse_chance(
                        mdef, state.youmonst, true, state,
                        { ...env, random, message },
                    );
                    if (canLeaveCorpse
                        && !((state.mvitals?.[monsndx(pd)]?.mvflags ?? 0)
                            & G_NOCORPSE)) {
                        state.u.uhunger += Math.trunc((pd.cnutrit + 1) / 2);
                    } else {
                        turns = 0;
                    }
                    const totalMessage = `You totally digest ${mon_nam(mdef, state, env)}.`;
                    if (turns !== 0) {
                        await message(`You digest ${mon_nam(mdef, state, env)}.`, state);
                        if (heroSlowDigestion(state)) turns *= 2;
                        nomul(-turns, state);
                        state.multi_reason = 'digesting something';
                        state.nomovemsg = totalMessage;
                        state.gc ??= {};
                        state.gc.corpsenm_digested = monsndx(pd);
                        state.afternmv = (callbackState = state) =>
                            Finish_digestion(callbackState, env);
                    } else {
                        await message(totalMessage, state);
                    }
                    if (pd === state.mons?.[PM_GREEN_SLIME]) {
                        const slimeMessage = `${The(pmname(pd, Mgender(mdef, state)))} isn't sitting well with you.`;
                        // C rewrites its static msgbuf after assigning that same
                        // buffer to nomovemsg, so an active delayed message sees
                        // the new text. With no delay the overwritten buffer is
                        // not displayed.
                        if (turns !== 0) state.nomovemsg = slimeMessage;
                        if (!heroUnchanging(state))
                            await make_slimed(5, null, state, env);
                    } else {
                        await exercise(A_CON, true, state, random, env);
                    }
                }
                state.gm.mswallower = null;
                await end_engulf(state);
                return M_ATTK_DEF_DIED;
            case AD_PHYS:
                if (state.youmonst.data === state.mons?.[PM_FOG_CLOUD]) {
                    await message(`${Monnam(mdef, state, env)} is laden with your moisture.`, state);
                    if ((breathless(pd) || amphibious(pd)) && !flaming(pd)) {
                        damage = 0;
                        await message(`${Monnam(mdef, state, env)} seems unharmed.`, state);
                    }
                } else {
                    await message(
                        `${Monnam(mdef, state, env)} is ${uEnfold ? 'being squashed' : 'pummeled with your debris'}!`,
                        state,
                    );
                }
                break;
            case AD_ACID:
                await message(`${Monnam(mdef, state, env)} is covered with your goo!`, state);
                if (Resists_Elem(mdef, ACID_RES, state)) {
                    await message(`It seems harmless to ${mon_nam(mdef, state, env)}.`, state);
                    damage = 0;
                }
                break;
            case AD_BLND:
                if (can_blnd(state.youmonst, mdef, mattk.aatyp, null, state)) {
                    if (mdef.mcansee)
                        await message(`${Monnam(mdef, state, env)} can't see in there!`, state);
                    mdef.mcansee = 0;
                    damage = Math.min(damage + (mdef.mblinded ?? 0), 127);
                    mdef.mblinded = damage;
                }
                damage = 0;
                break;
            case AD_ELEC:
                if (random.rn2(2)) {
                    await message(`The air around ${mon_nam(mdef, state, env)} crackles with electricity.`, state);
                    if (Resists_Elem(mdef, SHOCK_RES, state)) {
                        await message(`${Monnam(mdef, state, env)} seems unhurt.`, state);
                        damage = 0;
                    }
                    await golemeffects(mdef, mattk.adtyp, damage, { ...env, state, random });
                } else damage = 0;
                break;
            case AD_COLD:
                if (random.rn2(2)) {
                    if (Resists_Elem(mdef, COLD_RES, state)) {
                        await message(`${Monnam(mdef, state, env)} seems mildly chilly.`, state);
                        damage = 0;
                    } else {
                        await message(`${Monnam(mdef, state, env)} is freezing to death!`, state);
                    }
                    await golemeffects(mdef, mattk.adtyp, damage, { ...env, state, random });
                } else damage = 0;
                break;
            case AD_FIRE:
                if (random.rn2(2)) {
                    if (Resists_Elem(mdef, FIRE_RES, state)) {
                        await message(`${Monnam(mdef, state, env)} seems mildly hot.`, state);
                        damage = 0;
                    } else {
                        await message(`${Monnam(mdef, state, env)} is burning to a crisp!`, state);
                    }
                    await golemeffects(mdef, mattk.adtyp, damage, { ...env, state, random });
                } else damage = 0;
                break;
            case AD_DREN:
                if (!random.rn2(4)) note_unported('mhitm.c xdrainenergym');
                damage = 0;
                break;
            default:
                break;
            }
            await end_engulf(state);
            mdef.mhp -= damage;
            if (mdef.mhp < 1) {
                await killed(mdef, state, { ...env, random, message });
                if (mdef.mhp < 1) return M_ATTK_DEF_DIED;
            }
            await message(`You ${expelVerb} ${mon_nam(mdef, state, env)}!`, state);
            if ((heroSlowDigestion(state) || is_animal(state.youmonst.data))
                && uDigest) {
                await message(
                    `Obviously, you didn't like ${s_suffix(mon_nam(mdef, state, env))} taste.`,
                    state,
                );
            }
        }
    }
    return M_ATTK_MISS;
}

// C ref: uhitm.c hmonas() (5424-5860). This is the source-ordered attack
// loop for a polymorphed hero striking a monster. Its caller has already set
// gb.bhitpos and gn.notonhead, just as do_attack() does before hitum().
export async function hmonas(mon, state = game, env = {}) {
    const random = env.random ?? { d, rn1, rn2, rne, rnd, rnz };
    const attackEnv = { ...env, state, random };
    const message = requireAttackOperation(attackEnv, 'message');
    const sums = new Array(NATTK).fill(M_ATTK_MISS);
    let altAttack = {};
    let altWeapon = false;
    let weaponUsed = false;
    let oddClaw = true;
    let dhit = 0;
    let attackNumber = 0;
    let multiClaw = 0;
    let multiWeapon = 0;

    state.gv ??= {};
    state.gt ??= {};
    state.gs ??= {};
    state.gv.vis = canseemon(mon, state) || m_next2u(mon, state);

    // Count weapon/claw attacks first: both rings apply to a single claw,
    // while multiple claw-like attacks alternate which ring is checked.
    for (let i = 0; i < NATTK; i++) {
        const mattk = getmattk(state.youmonst, mon, i, sums, { state });
        if (mattk.aatyp === AT_WEAP) multiWeapon++;
        if (mattk.aatyp === AT_WEAP || mattk.aatyp === AT_CLAW
            || mattk.aatyp === AT_TUCH) multiClaw++;
    }
    multiClaw = multiClaw > 1;
    state.gt.twohits = 0;
    state.gs.skipdrin = false;

    for (let i = 0; i < NATTK; i++) {
        if (i > 0
            && (m_at(state.gb.bhitpos.x, state.gb.bhitpos.y, state) !== mon
                || mon.mhp < 1)) {
            continue;
        }

        let mattk = getmattk(state.youmonst, mon, i, sums, { state });
        if (state.gs.skipdrin && mattk.aatyp === AT_TENT
            && mattk.adtyp === AD_DRIN) {
            continue;
        }

        let weapon = null;
        let originalSlot = null;
        let useWeapon = mattk.aatyp === AT_WEAP;
        if (mattk.aatyp === AT_CLAW && state.uwep
            && !cantwield(state.youmonst.data) && !weaponUsed) {
            useWeapon = true;
        }
        if (mattk.aatyp === AT_TUCH && state.uwep
            && state.youmonst.data.mlet === S_LICH && !weaponUsed) {
            useWeapon = true;
        }
        if (mattk.aatyp === AT_KICK && mtrapped_in_pit(state.youmonst, state))
            continue;
        if (mattk.aatyp === AT_MAGC
            && [S_KOBOLD, S_ORC, S_GNOME].includes(state.youmonst.data.mlet)
            && !weaponUsed) {
            useWeapon = true;
        }

        if (useWeapon) {
            oddClaw = !oddClaw;
            if (weaponUsed && sums[i - 1] > M_ATTK_MISS
                && state.uwep && bimanual(state.uwep, state)) {
                continue;
            }
            weaponUsed = true;
            originalSlot = altWeapon && state.uswapwep ? 'uswapwep' : 'uwep';
            if (state.uswapwep && state.uwep
                && (state.uwep.oclass === WEAPON_CLASS
                    || is_weptool(state.uwep, state))
                && !bimanual(state.uwep, state)
                && !state.uarms && !state.uswapwep.oartifact
                && (state.uswapwep.oclass === WEAPON_CLASS
                    || is_weptool(state.uswapwep, state))
                && !is_launcher(state.uswapwep, state)
                && !is_ammo(state.uswapwep, state)
                && !is_missile(state.uswapwep, state)
                && !bimanual(state.uswapwep, state)
                && !(objectType(state.uswapwep, state).oc_material === SILVER
                    && heroHatesSilver(state))) {
                altWeapon = !altWeapon;
            }
            weapon = state[originalSlot];
            if (!weapon) originalSlot = 'uarmg';

            const counters = { attknum: attackNumber, role_roll_penalty: 0 };
            const rollNeeded = await find_roll_to_hit(
                mon, AT_WEAP, weapon, counters, state, attackEnv,
            );
            attackNumber = counters.attknum;
            const armorPenalty = counters.role_roll_penalty;
            mon_maybe_unparalyze(mon, random);
            const dieRoll = random.rnd(20);
            dhit = rollNeeded > dieRoll || state.u.uswallow;
            if (multiWeapon) state.gt.twohits++;
            const hit = { value: dhit };
            const monsterSurvived = await known_hitum(
                mon, weapon, hit, rollNeeded, armorPenalty, mattk, dieRoll,
                state, attackEnv,
            );
            dhit = hit.value;
            weapon = state[originalSlot];
            if (!monsterSurvived) {
                sums[i] = M_ATTK_DEF_DIED;
            } else {
                sums[i] = dhit ? M_ATTK_HIT : M_ATTK_MISS;
            }
            if (monsterSurvived
                && m_at(state.u.ux + state.u.dx, state.u.uy + state.u.dy, state)
                    !== mon) {
                i = NATTK;
            } else if (monsterSurvived && dhit
                && mattk.adtyp !== AD_SPEL && mattk.adtyp !== AD_PHYS) {
                sums[i] = await damageum(mon, mattk, 0, state, attackEnv);
            }
        } else {
            switch (mattk.aatyp) {
            case AT_CLAW:
            case AT_TUCH:
            case AT_KICK:
            case AT_BITE:
            case AT_STNG:
            case AT_BUTT:
            case AT_TENT: {
                const counters = { attknum: attackNumber, role_roll_penalty: 0 };
                const rollNeeded = await find_roll_to_hit(
                    mon, mattk.aatyp, null, counters, state, attackEnv,
                );
                attackNumber = counters.attknum;
                const armorPenalty = counters.role_roll_penalty;
                mon_maybe_unparalyze(mon, random);
                const dieRoll = random.rnd(20);
                dhit = rollNeeded > dieRoll || state.u.uswallow;
                if (dhit) {
                    const compatibility = !state.u.uswallow
                        ? could_seduce(state.youmonst, mon, mattk, attackEnv)
                        : 0;
                    if (compatibility) {
                        await message(
                            `${mon.mcansee && haseyes(mon.data) ? 'You smile at' : 'You talk to'} ${mon_nam(mon, state, env)} ${compatibility === 2 ? 'engagingly' : 'seductively'}.`,
                            state,
                        );
                        sums[i] = await damageum(mon, mattk, 0, state, attackEnv);
                        break;
                    }
                    await wakeup(mon, true, attackEnv);
                    let specialDamage = 0;
                    const silverHit = { silverhit: 0 };
                    let verb;
                    switch (mattk.aatyp) {
                    case AT_CLAW:
                    case AT_TUCH:
                        verb = mattk.aatyp === AT_TUCH ? 'touch' : 'claws';
                        oddClaw = !oddClaw;
                        specialDamage = special_dmgval(
                            state.youmonst,
                            mon,
                            W_ARMG
                                | ((oddClaw || !multiClaw) ? W_RINGL : 0)
                                | ((!oddClaw || !multiClaw) ? W_RINGR : 0),
                            silverHit,
                            state,
                            attackEnv,
                        );
                        break;
                    case AT_TENT: verb = 'tentacles'; break;
                    case AT_KICK:
                        verb = 'kick';
                        specialDamage = special_dmgval(
                            state.youmonst, mon, W_ARMF, silverHit, state, attackEnv,
                        );
                        break;
                    case AT_BUTT:
                        verb = 'head butt';
                        specialDamage = special_dmgval(
                            state.youmonst, mon, W_ARMH, silverHit, state, attackEnv,
                        );
                        break;
                    case AT_BITE: verb = 'bite'; break;
                    case AT_STNG: verb = 'sting'; break;
                    default: verb = 'hit'; break;
                    }
                    if (mon.data === state.mons?.[PM_SHADE] && !specialDamage) {
                        if (verb === 'hit'
                            || (mattk.aatyp === AT_CLAW && humanoid(mon.data))) {
                            verb = 'attack';
                        }
                        await message(
                            `Your ${verb} ${vtense(verb, 'pass')} harmlessly through ${mon_nam(mon, state, env)}.`,
                            state,
                        );
                    } else if (failed_grab(state.youmonst, mon, mattk, attackEnv)) {
                        break;
                    } else {
                        if (mattk.aatyp === AT_TENT) {
                            await message(`Your tentacles suck ${mon_nam(mon, state, env)}.`, state);
                        } else {
                            if (mattk.aatyp === AT_CLAW) verb = 'hit';
                            await message(`You ${verb} ${mon_nam(mon, state, env)}.`, state);
                            if (silverHit.silverhit && state.flags?.verbose)
                                note_unported('weapon.c silver_sears');
                        }
                        sums[i] = await damageum(mon, mattk, specialDamage, state, attackEnv);
                    }
                } else {
                    await missum(mon, mattk, rollNeeded + armorPenalty > dieRoll, state, attackEnv);
                }
                break;
            }
            case AT_HUGS: {
                const byHand = hugThrottles(state.youmonst.data, state);
                let unconcerned = byHand && !can_be_strangled(mon, state);
                if (sticks(mon.data) || state.u.uswallow || state.gn?.notonhead
                    || (byHand && (state.uwep || !has_head(mon.data)))) {
                    if (byHand && state.uwep && state.u.ustuck
                        && !(sticks(state.u.ustuck.data) || state.u.uswallow)) {
                        await uunstick(state);
                    }
                    continue;
                }
                dhit = 1;
                await wakeup(mon, true, attackEnv);
                const silverHit = { silverhit: 0 };
                const specialDamage = special_dmgval(
                    state.youmonst,
                    mon,
                    byHand ? (W_ARMG | W_RINGL | W_RINGR)
                        : (W_ARMC | W_ARM | W_ARMU),
                    silverHit,
                    state,
                    attackEnv,
                );
                if (unconcerned) {
                    if (mattk !== altAttack) {
                        altAttack = { ...mattk };
                        mattk = altAttack;
                    }
                    mattk.damn = 1;
                    mattk.damd = 1;
                    if (specialDamage || mindless(mon.data)
                        || mon.mhp <= 1 + Math.max(state.u.udaminc ?? 0, 1)) {
                        unconcerned = false;
                    }
                }
                if (mon.data === state.mons?.[PM_SHADE]) {
                    const verb = byHand ? 'grasp' : 'hug';
                    if (specialDamage) {
                        await message(
                            `You ${verb} ${mon_nam(mon, state, env)}${exclam(specialDamage)}`,
                            state,
                        );
                        if (silverHit.silverhit && state.flags?.verbose)
                            note_unported('weapon.c silver_sears');
                        sums[i] = await damageum(mon, mattk, specialDamage, state, attackEnv);
                    } else {
                        await message(`Your ${verb} passes harmlessly through ${mon_nam(mon, state, env)}.`, state);
                    }
                    break;
                }
                if (failed_grab(state.youmonst, mon, mattk, attackEnv)) break;
                if (mon === state.u.ustuck) {
                    await message(
                        `${Monnam(mon, state, env)} is being ${byHand ? 'throttled' : 'crushed'}${unconcerned ? ' but doesn\'t seem concerned' : ''}.`,
                        state,
                    );
                    if (silverHit.silverhit && state.flags?.verbose)
                        note_unported('weapon.c silver_sears');
                    sums[i] = await damageum(mon, mattk, specialDamage, state, attackEnv);
                } else if (i >= 2 && sums[i - 1] > M_ATTK_MISS
                    && sums[i - 2] > M_ATTK_MISS) {
                    if (state.u.ustuck && state.u.ustuck !== mon)
                        await uunstick(state);
                    await message(`You grab ${mon_nam(mon, state, env)}!`, state);
                    set_ustuck(mon, state);
                    if (silverHit.silverhit && state.flags?.verbose)
                        note_unported('weapon.c silver_sears');
                    sums[i] = await damageum(mon, mattk, specialDamage, state, attackEnv);
                }
                break;
            }
            case AT_EXPL:
                dhit = -1;
                await wakeup(mon, true, attackEnv);
                await message('You explode!', state);
                sums[i] = await explum(mon, mattk, state, attackEnv);
                break;
            case AT_ENGL: {
                const counters = { attknum: attackNumber, role_roll_penalty: 0 };
                const rollNeeded = await find_roll_to_hit(
                    mon, mattk.aatyp, null, counters, state, attackEnv,
                );
                attackNumber = counters.attknum;
                mon_maybe_unparalyze(mon, random);
                dhit = rollNeeded > random.rnd(20 + i);
                if (dhit) {
                    await wakeup(mon, true, attackEnv);
                    if (mon.data === state.mons?.[PM_SHADE]) {
                        await message(`Your attempt to surround ${mon_nam(mon, state, env)} is harmless.`, state);
                    } else if (!failed_grab(state.youmonst, mon, mattk, attackEnv)) {
                        sums[i] = await gulpum(mon, mattk, state, attackEnv);
                        if (sums[i] === M_ATTK_DEF_DIED
                            && [S_ZOMBIE, S_MUMMY].includes(mon.data.mlet)
                            && random.rn2(5) && !heroSickResistance(state)) {
                            await youFeel(
                                `${heroSick(state) ? 'very ' : ''}sick.`,
                                state,
                                attackEnv,
                            );
                            await mdamageu(mon, random.rnd(8), state, attackEnv);
                        }
                    }
                } else {
                    await missum(mon, mattk, false, state, attackEnv);
                }
                break;
            }
            case AT_MAGC:
            case AT_NONE:
            case AT_BOOM:
                continue;
            case AT_BREA:
            case AT_SPIT:
            case AT_GAZE:
                dhit = 0;
                break;
            default:
                note_unported('pline.c impossible');
                break;
            }
        }

        if (dhit === -1) {
            state.u.mh = -1;
            await rehumanize(state, attackEnv);
        }
        if (sums[i] === M_ATTK_DEF_DIED) {
            await passive(mon, weapon, 1, 0, mattk.aatyp, false, state, attackEnv);
        } else {
            await passive(
                mon,
                weapon,
                sums[i] !== M_ATTK_MISS,
                1,
                mattk.aatyp,
                false,
                state,
                attackEnv,
            );
        }
        const hitflags = { value: sums[i] };
        if (await mhitm_knockback(
            state.youmonst, mon, mattk, hitflags, weaponUsed, state, attackEnv, random,
        )) {
            sums[i] = hitflags.value;
            break;
        }
        sums[i] = hitflags.value;

        if (state.uswapwep && weapon === state.uswapwep && weapon.cursed) {
            await drop_uswapwep(state, attackEnv);
            break;
        }
        if (mon.mhp < 1) break;
        if (!Upolyd(state.u)) break;
        if (state.multi < 0) break;
    }

    state.gv.vis = false;
    state.gt.twohits = 0;
    return mon.mhp >= 1;
}

// C ref: uhitm.c do_attack() (448-583). A step into a monster's square either
// declines so hack.c can displace, or consumes the attempted attack.
export async function do_attack(monster, state = game, env = {}) {
    const random = env.random ?? { d, rn1, rn2, rne, rnd, rnz };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('do_attack random injection requires rn2');
    const message = env.message ?? ttyPline;
    const stopRunning = env.endRunning
        ? (gameState) => env.endRunning(gameState)
        : (gameState) => end_running(true, gameState);

    if (is_safemon(monster, state) && !state.context?.forcefight) {
        const makeFlee = env.monFlee ?? monflee;
        let foo = Punished(state)
            || !random.rn2(7)
            || ([PM_BABY_LONG_WORM, PM_LONG_WORM, PM_LONG_WORM_TAIL]
                .includes(monster.data?.pmidx) && monster.wormno)
            || (IS_OBSTRUCTED(state.level.at(state.u.ux, state.u.uy).typ)
                && !passes_walls(monster.data));
        let inShop = false;

        if (!foo) {
            for (const roomNumber of in_rooms(
                monster.mx, monster.my, SHOPBASE, state,
            )) {
                const room = state.level.rooms[roomNumber - ROOMOFFSET];
                if (tended_shop(room, state)) {
                    inShop = true;
                    break;
                }
            }
        }

        if (inShop || foo) {
            if (!state.context?.travel && !state.context?.run
                && canspotmon(monster, state) && monster.isshk) {
                return ECMD_TIME | await dopay(state, {
                    ...env,
                    state,
                    random,
                    message,
                });
            }

            // uhitm.c:497 only frightens a tame pet. A peaceful non-pet uses
            // the same safety stop without a flee-duration roll.
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

        if (monster.mfrozen || helpless(monster)
            || (monster.data?.mmove === 0 && random.rn2(6))) {
            await message(`${Monnam(monster, state)} doesn't seem to move!`, state);
            stopRunning(state);
            return true;
        }
        return false;
    }

    state.go ??= {};
    state.go.override_confirmation = false;
    state.gb ??= {};
    state.gb.bhitpos = { x: state.u.ux + state.u.dx, y: state.u.uy + state.u.dy };
    state.gn ??= {};
    state.gn.notonhead = state.gb.bhitpos.x !== monster.mx
        || state.gb.bhitpos.y !== monster.my;
    const attackEnv = {
        ...env,
        state,
        random,
        message,
        nearCapacity: env.nearCapacity
            ?? (() => near_capacity(state)),
        unsupported: env.unsupported
            ?? ((reason) => { throw new Error(`uhitm.c: ${reason}`); }),
    };
    if (await attack_checks(monster, state.uwep, state, attackEnv)) return true;

    let swing = true;
    if (Upolyd(state.u) && noattacks(state.youmonst.data)) {
        await message('You have no way to attack monsters physically.', state);
        monster.mstrategy &= ~STRAT_WAITMASK;
        swing = false;
    } else if (await (env.checkCapacity ?? check_capacity)(
        'You cannot fight while so heavily loaded.', state,
    ) || await (env.overexertion ?? overexertion)(state)) {
        swing = false;
    }

    if (swing) {
        if (state.u.twoweap
            && !(await can_twoweapon(state, attackEnv)))
            await untwoweapon(state);

        if (state.unweapon) {
            state.unweapon = false;
            if (state.flags?.verbose) {
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

        await exercise(A_STR, true, state, random, {
            encumberMessage: env.encumberMessage ?? encumber_msg,
        });
        u_wipe_engr(3, { ...env, state, random });

        const species = monster.data;
        if (species.mlet === S_LEPRECHAUN
            && !monster.mfrozen && !helpless(monster)
            && !monster.mconf && monster.mcansee && !random.rn2(7)) {
        const moveResult = await (env.moveMonster ?? moveSimpleOrdinary)(monster, {
                ...attackEnv,
                state,
                random,
            });
            if (moveResult === MMOVE_DIED
                || monster.mx !== state.u.ux + state.u.dx
                || monster.my !== state.u.uy + state.u.dy) {
                await message('You miss wildly and stumble forwards.', state);
                return false;
            }
        }

        if (Upolyd(state.u)) {
            await hmonas(monster, state, attackEnv);
        } else {
            await hitum(
                monster, state.youmonst.data.mattk[0], state, attackEnv,
            );
        }
        monster.mstrategy &= ~STRAT_WAITMASK;
    }

    const x = state.u.ux + state.u.dx;
    const y = state.u.uy + state.u.dy;
    if (state.context?.forcefight && monster.mhp >= 1
        && !canspotmon(monster, state)
        && !glyph_is_invisible(glyph_at(x, y, state))
        && !engulfing_u(monster, state)) {
        map_invisible(x, y, state);
    }
    return true;
}

// C ref: uhitm.c force_attack() (432-448). Temporarily override the safe-pet
// protection for hostiles and, when requested, pets, then return do_attack()'s
// boolean result to callers such as apply.c:use_whip().
export async function force_attack(monster, pets_too, state = game, env = {}) {
    const previous = state.context?.forcefight;
    const owned = Object.hasOwn(state.context ?? {}, 'forcefight');
    if (pets_too || !monster.mtame) {
        state.context ??= {};
        state.context.forcefight = true;
    }
    try {
        return await do_attack(monster, state, env);
    } finally {
        if (state.context) {
            if (owned) state.context.forcefight = previous;
            else delete state.context.forcefight;
        }
    }
}

// C ref: uhitm.c known_hitum() (585-646). Delivers one already-decided swing.
// `mhit` carries the hit-or-miss decision in and back out, because the hit arm
// can downgrade a hit to a miss; the miss arm never does. C returns whether
// the target still lives, which is TRUE for every miss.
//
// `slice_or_chop` is captured before hmon() can consume the weapon; the hit
// coordinate and gn.notonhead are set immediately before that call.
// go.override_confirmation at 601 is constantly FALSE; see do_attack().
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
    const sliceOrChop = Boolean(weapon
        && (is_blade(weapon, state) || is_axe(weapon, state)));
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
        state.gb ??= {};
        state.gn ??= {};
        state.gn.notonhead = state.gb.bhitpos.x !== mon.mx
            || state.gb.bhitpos.y !== mon.my;
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
                        ?? ((subject) => canseemon(subject, state)),
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
                await cutworm(
                    mon,
                    state.gb.bhitpos.x,
                    state.gb.bhitpos.y,
                    sliceOrChop,
                    { ...env, state, random },
                );
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
        && canseemon(mon, state)
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
//   1043-1049 joust(), whose consumed result selects the mounted-lance tail.
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
        if (canseemon(mon, state)) {
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
        hmd.jousting = joust(mon, obj, state, random, env);
        if (hmd.jousting) hmd.train_weapon_skill = true;
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
                note_unported('trap.c minstapetrify');
            if (!Resists_Elem(mon, STONE_RES, state)) {
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
                note_unported('trap.c minstapetrify');
            if (!Resists_Elem(mon, STONE_RES, state)) {
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
        if (Resists_Elem(mon, ACID_RES, state)) {
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
    else {
        // C uhitm.c:1100 calls setuwep(NULL), whose worn.c setworn() path
        // needs do_wear.c cancel_doff() and the other canonical worn hooks.
        // Preserve caller-specific hooks such as artifact-light cleanup.
        const worn = setwornEnv(state);
        setuwep(null, {
            ...env,
            state,
            hooks: { ...(env.hooks ?? {}), ...worn.hooks },
        });
    }
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
            const skill = hmd.thrown
                ? weapon_type(skillwep, state)
                : uwep_skill_type(state);
            use_skill(skill, 1, state);
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
    if (Resists_Elem(mon, POISON_RES, state)) {
        hmd.needpoismsg = true;
    } else if (random.rn2(10)) {
        hmd.dmg += random.rnd(6);
    } else {
        hmd.poiskilled = true;
    }
}

// C ref: uhitm.c joust() (2098-2133). The -1/0/1 result selects the mounted
// lance branch in hmon_hitmon_weapon_melee(); its RNG order is observable.
function joust(mon, obj, state, random, env) {
    if (state.u?.uprops?.[FUMBLING]?.intrinsic
        || state.u?.uprops?.[FUMBLING]?.extrinsic
        || state.u?.uprops?.[STUNNED]?.intrinsic)
        return 0;
    if (obj !== state.uwep
        && (obj !== state.uswapwep || !state.u.twoweap))
        return 0;
    if (state.u.utrap) return 0;

    let skillRating = P_SKILL(weapon_type(obj, state), state);
    if (state.u.twoweap) {
        const twoWeaponSkill = P_SKILL(P_TWO_WEAPON_COMBAT, state);
        if (twoWeaponSkill < skillRating) skillRating = twoWeaponSkill;
    }
    if (skillRating === P_ISRESTRICTED) skillRating = P_UNSKILLED;

    const joustDieroll = random.rn2(5);
    if (joustDieroll < skillRating) {
        if (joustDieroll === 0 && random.rnl(50) === 49
            && !unsolid(mon.data, state)
            && !obj_resists(obj, 0, 100, { ...env, state, random }))
            return -1;
        return 1;
    }
    return 0;
}

// C ref: uhitm.c mhurtle_to_doom() (1942-1957). Its return controls whether
// the caller skips later damage; the monster's cached species pointer is
// refreshed after mhurtle because a trap may polymorph or revert it.
async function mhurtle_to_doom(mon, damage, hmd, state, env, random) {
    if (damage < mon.mhp) {
        await mhurtle(mon, state.u.dx, state.u.dy, 1, {
            ...env, state, random,
        });
        hmd.mdat = mon.data;
        if (mon.mhp < 1) return true;
    }
    return false;
}

// C ref: uhitm.c hmon_hitmon_stagger() (1570-1585).
async function hmon_hitmon_stagger(hmd, mon, state, env, random) {
    if (random.rnd(100) < P_SKILL(P_BARE_HANDED_COMBAT, state)
        && !bigmonst(hmd.mdat) && !thick_skinned(hmd.mdat)) {
        if (canspotmon(mon, state)) {
            await (env.message ?? ttyPline)(
                `${Monnam(mon, state)} ${makeplural(stagger(mon.data, 'stagger'))}`
                + ' from your powerful strike!',
                state,
            );
        }
        if (await mhurtle_to_doom(
            mon, hmd.dmg, hmd, state, env, random,
        ))
            hmd.already_killed = true;
        hmd.hittxt = true;
    }
}

// C ref: uhitm.c hmon_hitmon_jousting() (1540-1567). Joust damage and
// feedback precede the optional lance break; mhurtle_to_doom's consumed
// result then controls the later damage path in hmon_hitmon().
async function hmon_hitmon_jousting(hmd, mon, obj, state, env, random) {
    hmd.dmg += random.d(2, obj === state.uwep ? 10 : 2);
    await (env.message ?? ttyPline)(
        `You joust ${mon_nam(mon, state)}${canseemon(mon, state)
            ? exclam(hmd.dmg) : '.'}`,
        state,
    );
    if ((state.u.uconduct?.weaphit ?? 0) <= 1)
        first_weapon_hit(obj, state);

    if (hmd.jousting < 0) {
        set_twoweap(false, state);
        if (obj === state.uwep)
            uwepgone({ ...env, state });
        await (env.message ?? ttyPline)(
            `${Yname2(obj, state)} shatters on impact!`, state,
        );
        await useup(obj, { ...env, state });
        obj = null;
    }
    if (await mhurtle_to_doom(
        mon, hmd.dmg, hmd, state, env, random,
    ))
        hmd.already_killed = true;
    hmd.hittxt = true;
}

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
        const mclone = await clone_mon(mon, 0, 0, state, {
            ...env,
            state,
        });
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
                    + `${canseemon(mon, state) ? exclam(hmd.dmg) : '.'}`,
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
//   1826      hmon_hitmon_jousting(), which can move a mounted target through
//             the return-valued mhurtle_to_doom() helper.
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
    const random = env.random ?? { d, rn1, rn2, rnl, rnd };
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
            hmd.hittxt = await shade_miss(
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
        await hmon_hitmon_jousting(
            hmd, mon, obj, state, env, random,
        );
    } else if (hmd.unarmed && hmd.dmg > 1 && !thrown && !obj
               && !Upolyd(state.u)) {
        await hmon_hitmon_stagger(hmd, mon, state, env, random);
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

        // C passes a caller-owned char buf to steal(); the return remains a
        // separate numeric status. The animal follow-up reads that same text.
        const stolenName = { value: '' };
        const result = await steal(magr, state, env, stolenName);
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
            if (is_anml && stolenName.value && canseemon(magr, state)) {
                // uhitm.c:mhitm_ad_sedu() reports the stolen name before
                // monflee(), using the same caller-filled buffer as steal().
                await message(
                    `${Monnam(magr, state, env)} tries to `
                        + `${locomotion(magr.data, 'run')} away with `
                        + `${stolenName.value}.`,
                    state,
                );
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
        // update_mon_extrinsics() may suspend for its source message/state
        // transition.  C completes extraction before add_to_minv() can
        // inspect or merge the object, so keep that continuation ordered.
        await extract_from_minvent(mdef, obj, true, false, extractionEnv);

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
            const couldspot = canspotmon(magr, state);
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
                && !canspotmon(magr, state)) {
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

// C's helper is used only when a poison attack has already passed its own
// magic-cancellation and chance gates. It deliberately does not spend either
// gate again. `gv.vis` is the combat visibility result computed by mhitm.c;
// canSpotMonster supplies each source canspotmon() check.
export async function mhitm_really_poison(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = { rn1, ...(env.random ?? {}) };
    const message = requireAttackOperation(env, 'message');
    const visible = Boolean(state.gv?.vis);

    if (visible && canspotmon(magr, state)) {
        await message(
            `${s_suffix(Monnam(magr, state, env))} `
                + `${mpoisons_subj(magr, mattk, state)} was poisoned!`,
            state,
        );
    }
    if (Resists_Elem(mdef, POISON_RES, state)) {
        if (visible && canspotmon(mdef, state)
            && canspotmon(magr, state)) {
            await message(
                `The poison doesn't seem to affect ${mon_nam(mdef, state, env)}.`,
                state,
            );
        }
        return;
    }

    mhm.damage += random.rn1(10, 6);
    if (mhm.damage >= mdef.mhp && visible && canspotmon(mdef, state))
        await message('The poison was deadly...', state);
}

export async function mhitm_ad_drst(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = { rn2, rn1, ...(env.random ?? {}) };
    const negated = await mhitm_mgc_atk_negated(
        magr, mdef, false, state, env,
    );

    if (magr === state.youmonst) {
        /* uhitm */
        if (!negated && !random.rn2(8)) {
            const message = requireAttackOperation(env, 'message');
            const subject = mpoisons_subj(magr, mattk, state);
            await message(`Your ${subject} was poisoned!`, state);
            if (Resists_Elem(mdef, POISON_RES, state)) {
                await message(
                    `The poison doesn't seem to affect ${mon_nam(mdef, state, env)}.`,
                    state,
                );
            } else if (!random.rn2(10)) {
                await message('Your poison was deadly...', state);
                mhm.damage = mdef.mhp;
            } else {
                mhm.damage += random.rn1(10, 6);
            }
        }
    } else if (mdef === state.youmonst) {
        /* mhitu */
        await hitmsg(magr, mattk, state, env);
        if (!negated && !random.rn2(8)) {
            const reason = `${s_suffix(Monnam(magr, state, env))} `
                + `${mpoisons_subj(magr, mattk, state)}`;
            const poison = requireAttackOperation(env, 'poisoned');
            await poison(
                reason,
                mattk.adtyp === AD_DRDX ? A_DEX
                    : mattk.adtyp === AD_DRCO ? A_CON : A_STR,
                pmname(magr.data, Mgender(magr, state)),
                30,
                false,
                env,
            );
        }
    } else {
        /* mhitm */
        if (!negated && !random.rn2(8))
            await mhitm_really_poison(magr, mattk, mdef, mhm, state, env);
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
//   AT_WEAP with something wielded (4041-4121) admits the ordinary arm
//     through dmgval() and hitmsg(). The petrifying-corpse pre-arm is also
//     complete through do_stone_u() and the corpse's fall-through to
//     dmgval()/hitmsg(); the later artifact, silver, pudding split, effective
//     rust, poison, and potentially fatal branches remain explicit boundaries.
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
                const petrifyingCorpse = otmp.otyp === CORPSE
                    && touch_petrifies(state.mons?.[otmp.corpsenm]);
                if (petrifyingCorpse) {
                    // uhitm.c:4047-4059.  This damage is established before
                    // do_stone_u(), and a successful petrification consumes
                    // the rest of the attack through mhm.done.
                    mhm.damage = 1;
                    const message = requireAttackOperation(env, 'message');
                    await message(
                        `${Monnam(magr, state, env)} hits you with the `
                        + `${pmname(state.mons[otmp.corpsenm], NEUTRAL)} corpse.`,
                        state,
                        env,
                    );
                    const stoned = Boolean(
                        (state.u?.uprops?.[STONED]?.intrinsic ?? 0) & TIMEOUT,
                    );
                    if (!stoned && await do_stone_u(magr, state, env)) {
                        mhm.hitflags = M_ATTK_HIT;
                        mhm.done = true;
                        return;
                    }
                }
                // C4047-4061 continues through dmgval()/hitmsg() for the
                // petrifying corpse even when do_stone_u() returns false
                // (resistance, existing Stoned, or a golem transition).
                // Keep the ordinary non-weapon boundary for every other
                // object, whose later C arms remain outside this span.
                if (!petrifyingCorpse
                    && !(otmp.oclass === WEAPON_CLASS
                         || is_weptool(otmp, state)))
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
        const vis = canseemon(magr, state) && canseemon(mdef, state);

        if (mattk.aatyp !== AT_WEAP && mattk.aatyp !== AT_CLAW) mwep = null;

        if (await shade_miss(magr, mdef, mwep, false, vis, state, env)) {
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
// The head is the whole answer for every defender that is not a shade, and it
// is FALSE. C's `||` short-circuits on the species test, so dmgval() is not
// reached for one and is called here only when it is.
//
// A shade defender that takes no damage is reported through the supplied
// message operation, then its square is marked and its msleeping is cleared.
// The message operation may suspend for live TTY input or a planning clone
// (whose default is a no-op), so every caller awaits this source result before
// consuming its TRUE pass-through answer.
export async function shade_miss(
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
        || sensemon(mdef, state)
        || (youagr && m_next2u(mdef, state));
    if (verbose && visible) {
        const what = !obj || shade_aware(obj, state)
            ? 'attack' : cxname(obj, state);
        const target = youdef ? 'you' : mon_nam(mdef, state);
        if (!thrown) {
            const whose = youagr
                ? 'Your' : s_suffix(Monnam(magr, state, env));
            await message(
                `${whose} ${what} ${vtense(what, 'pass')}`
                + ` harmlessly through ${target}.`,
                state,
                env,
            );
        } else {
            await message(
                `${The(what, state)} ${vtense(what, 'pass')}`
                + ` harmlessly through ${target}.`,
                state,
                env,
            );
        }
        if (!youdef && !canspotmon(mdef, state))
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
            if (state.gv?.vis && mdef.mcansee && canspotmon(mdef, state)) {
                let text = `${Monnam(mdef, state, env)} is blinded`;
                if (mdef.data?.pmidx === PM_ARCHON
                    && canseemon(mdef, state)) {
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

// C ref: uhitm.c do_stone_u() (3924-3942). Return TRUE exactly when the
// hero's petrification has been started. A successful poly_when_stoned()
// transition to a stone golem returns FALSE, because polymon() handled the
// petrification and C continues without make_stoned(). The make_stoned() call
// has no return value; its potion.c owner is still outside this span, so retain
// the source call as an explicit gap.
export async function do_stone_u(mtmp, state = game, env = {}) {
    const stoned = Boolean(
        (state.u?.uprops?.[STONED]?.intrinsic ?? 0) & TIMEOUT,
    );
    if (!stoned
        && !propertyPresent(state.u, STONE_RES)
        && !(poly_when_stoned(state.youmonst?.data, state)
            && await polymon(PM_STONE_GOLEM, state, env))) {
        let kformat = KILLED_BY_AN;
        // Mgender() reads the attacking monster instance's female bit; the
        // species record alone is not the source value here.
        let kname = pmname(mtmp.data, Mgender(mtmp, state));

        if ((mtmp.data?.geno ?? 0) & G_UNIQ) {
            if (!type_is_pname(mtmp.data))
                kname = the(kname, state);
            kformat = KILLED_BY;
        }
        // C: make_stoned(5L, NULL, kformat, kname).  The return is void and
        // no local state may be invented for this unported owner.
        note_unported('potion.c make_stoned');
        // Keep the arguments evaluated in C order for future owner wiring.
        void kformat;
        void kname;
        void env;
        return true;
    }
    return false;
}

// C ref: uhitm.c mhitm_ad_ston() (4203-4263). A cockatrice-style damage
// type has three distinct directions: the hero attacks a monster, a monster
// attacks the hero, or one monster attacks another. Damage is zero only in
// the hero attacker arm; the monster-to-hero arm can instead mark the blow as
// handled when do_stone_u() starts petrification.
export async function mhitm_ad_ston(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2 };
    const message = requireAttackOperation(env, 'message');

    if (magr === state.youmonst) {
        // C's munstone() return is used to decide whether minstapetrify()
        // runs. The latter is a discarded void call and remains an explicit
        // source gap until trap.c is ported.
        const { munstone } = await import('./muse.js');
        if (!await munstone(mdef, true, state, env))
            note_unported('trap.c minstapetrify');
        mhm.damage = 0;
    } else if (mdef === state.youmonst) {
        await hitmsg(magr, mattk, state, env);
        if (!random.rn2(3)) {
            if (magr.mcan) {
                if (!Deaf(state)) {
                    const heard = youHear(
                        `a cough from ${mon_nam(magr, state, env)}!`, state);
                    if (heard) await message(heard, state, env);
                }
            } else {
                if (Hallucination(state) && !heroIsBlind(state)) {
                    // Soundeffect(se_cockatrice_hiss, 50) is a no-op in the
                    // recorder's nosound backend, while You_hear is visible.
                    const heard = youHear('hissing.', state);
                    if (heard) await message(heard, state, env);
                    await message(
                        `${Monnam(magr, state, env)} appears to be blowing you a kiss...`,
                        state,
                        env,
                    );
                } else if (!Deaf(state)) {
                    const heard = youHear(
                        `${s_suffix(mon_nam(magr, state, env))} hissing!`, state);
                    if (heard) await message(heard, state, env);
                } else if (!heroIsBlind(state)) {
                    await message(
                        `${Monnam(magr, state, env)} seems to grimace.`,
                        state,
                        env,
                    );
                }

                // C always draws rn2(10) before checking the new-moon
                // fallback; only the moonphase term itself is short-circuited.
                if (!random.rn2(10)
                    || state.flags?.moonphase === NEW_MOON) {
                    if (await do_stone_u(magr, state, env)) {
                        mhm.hitflags = M_ATTK_HIT;
                        mhm.done = true;
                        return;
                    }
                }
            }
        }
    } else {
        // C discards do_stone_mon()'s void result. Keep this call boundary
        // explicit until that source function is ported; do not use a gap's
        // return as hitflags or damage data.
        if (magr.mcan)
            return;
        note_unported('uhitm.c do_stone_mon');
        return;
    }
}

// C ref: uhitm.c mhitm_ad_legs() (4425-4490).  The three source arms share
// the same damage object: the hero's arm delegates to physical damage, a
// monster attacking the hero can wound either leg, and a monster attacking a
// monster delegates after the cancelled-attacker guard.  The side draw is
// deliberately before the mounted, cancelled, and footwear predicates.
export async function mhitm_ad_legs(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2, rnd };
    const message = requireAttackOperation(env, 'message');

    if (magr === state.youmonst) {
        // uhitm.c:4427-4435.  This arm is the ordinary hero physical blow;
        // mhitm_ad_phys() owns its source-specific damage and done result.
        await mhitm_ad_phys(magr, mattk, mdef, mhm, state, env);
        if (mhm.done) return;
    } else if (mdef === state.youmonst) {
        // uhitm.c:4437-4480.  C chooses the side even when the attack is
        // cancelled or cannot reach a mounted/flying hero.
        const side = random.rn2(2) ? RIGHT_SIDE : LEFT_SIDE;
        const sidestr = side === RIGHT_SIDE ? 'right' : 'left';
        const monsterName = Monnam(magr, state, env);
        const leg = body_part(LEG, state.youmonst);

        if ((state.u?.usteed || Levitation(state) || Flying(state))
            && !is_flyer(magr.data)) {
            await message(
                `${monsterName} tries to reach your ${sidestr} ${leg}!`,
                state,
                env,
            );
            mhm.damage = 0;
        } else if (magr.mcan) {
            // uhitm.c evaluates Monnam() a second time for this pline_mon()
            // call.  Keep that display-RNG evaluation separate from the
            // initial Monst_name assignment above, even though the ordinary
            // (non-hallucinating) text is usually identical.
            const cancelledName = Monnam(magr, state, env);
            await message(
                messageAt(
                    `${cancelledName} nuzzles against your ${sidestr} ${leg}!`,
                    magr.mx,
                    magr.my,
                    state,
                ),
                state,
                env,
            );
            mhm.damage = 0;
        } else {
            const boots = state.uarmf;
            if (boots) {
                if (random.rn2(2)
                    && (boots.otyp === LOW_BOOTS || boots.otyp === IRON_SHOES)) {
                    await message(
                        `${monsterName} pricks the exposed part of your `
                            + `${sidestr} ${leg}!`,
                        state,
                        env,
                    );
                } else if (!random.rn2(5)) {
                    await message(
                        `${monsterName} pricks through your ${sidestr} boot!`,
                        state,
                        env,
                    );
                } else {
                    await message(
                        `${monsterName} scratches your ${sidestr} boot!`,
                        state,
                        env,
                    );
                    mhm.damage = 0;
                    return;
                }
            } else {
                await message(
                    `${monsterName} pricks your ${sidestr} ${leg}!`,
                    state,
                    env,
                );
            }

            await set_wounded_legs(
                side,
                random.rnd(60 - acurr(state, A_DEX)),
                state,
                env,
            );
            const encumberMessage = env.encumberMessage
                ?? ((subject) => encumber_msg(subject, {
                    message: env.message ?? ttyPline,
                }));
            await exercise(A_STR, false, state, random, {
                encumberMessage,
            });
            await exercise(A_DEX, false, state, random, {
                encumberMessage,
            });
        }
    } else {
        // uhitm.c:4482-4490.  A cancelled attacker loses this effect without
        // a physical-damage call; otherwise preserve its done/hit flags.
        if (magr.mcan) {
            mhm.damage = 0;
            return;
        }
        await mhitm_ad_phys(magr, mattk, mdef, mhm, state, env);
        if (mhm.done) return;
    }
}

// C ref: uhitm.c mhitm_ad_curs() (3015-3096). Preserve its three attack
// directions because only monster-to-hero can call attrcurse(); the other two
// still cancel targets or handle clay-golem writing and death state.
export async function mhitm_ad_curs(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2, rnd };
    const message = requireAttackOperation(env, 'message');
    const pa = magr.data;
    const pd = mdef.data;

    if (magr === state.youmonst) {
        // uhitm.c hero-polymorph arm: cancellation is attempted only at night.
        if (night(state) && !random.rn2(10) && !mdef.mcan) {
            if (pd === state.mons?.[PM_CLAY_GOLEM]) {
                if (!heroIsBlind(state)) {
                    await message(
                        `Some writing vanishes from ${s_suffix(mon_nam(mdef, state, env))} head!`,
                        state,
                        env,
                    );
                }
                await xkilled(mdef, XKILL_NOMSG, state, {
                    ...env,
                    random,
                    message,
                });
                // Keep mhp below zero so the caller can still report the pet hit.
            } else {
                mdef.mcan = 1;
                await message('You chuckle.', state, env);
            }
        }
        mhm.damage = 0;
    } else if (mdef === state.youmonst) {
        // mhitu.c monster-to-hero arm: hitmsg precedes the daylight gremlin
        // immunity, then cancellation and the 1-in-10 effect roll.
        await hitmsg(magr, mattk, state, { ...env, random, message });
        if (!night(state) && pa === state.mons?.[PM_GREMLIN]) return;
        if (!magr.mcan && !random.rn2(10)) {
            if (!Deaf(state)) {
                // sound.h compiles Soundeffect() away in the reference tty build.
                if (heroIsBlind(state)) {
                    await message('You hear laughter.', state, env);
                } else {
                    await message(
                        messageAt(
                            `${Monnam(magr, state, env)} chuckles.`,
                            magr.mx,
                            magr.my,
                            state,
                        ),
                        state,
                        env,
                    );
                }
            }
            if (state.u.umonnum === PM_CLAY_GOLEM) {
                await message('Some writing vanishes from your head!', state, env);
                // uhitm.c: rehumanize() has no consumed result.
                await rehumanize(state, env);
                return;
            }
            const { attrcurse } = await import('./sit.js');
            await mon_give_prop(
                magr,
                await attrcurse(state, { ...env, random, message }),
                {
                    ...env,
                    state,
                    random,
                    message,
                },
            );
        }
    } else {
        // mhitm.c monster-to-monster arm: preserve the source early return
        // before its curse chance and every state update after the draw.
        if (!night(state) && pa === state.mons?.[PM_GREMLIN]) return;
        if (!magr.mcan && !random.rn2(10)) {
            mdef.mcan = 1; // C cancels even when the defender has life saving.
            mdef.mstrategy &= ~STRAT_WAITFORU;
            if (is_were(pd) && pd.mlet !== S_HUMAN)
                await were_change(mdef, { ...env, state, random, message });
            if (pd === state.mons?.[PM_CLAY_GOLEM]) {
                if (state.gv?.vis && canseemon(mdef, state)) {
                    await message(
                        `Some writing vanishes from ${s_suffix(mon_nam(mdef, state, env))} head!`,
                        state,
                        env,
                    );
                    await message(
                        messageAt(
                            `${Monnam(mdef, state, env)} is destroyed!`,
                            mdef.mx,
                            mdef.my,
                            state,
                        ),
                        state,
                        env,
                    );
                }
                await mondied(mdef, state, { ...env, random, message });
                if (mdef.mhp >= 1) {
                    mhm.hitflags = M_ATTK_MISS;
                    mhm.done = true;
                    return;
                } else if (mdef.mtame && !state.gv?.vis) {
                    await message(
                        'You have a strangely sad feeling for a moment, then it passes.',
                        state,
                        env,
                    );
                }
                mhm.hitflags = M_ATTK_DEF_DIED
                    | (grow_up(magr, mdef, { ...env, state })
                        ? 0 : M_ATTK_AGR_DIED);
                mhm.done = true;
                return;
            }
            if (!Deaf(state)) {
                if (!state.gv?.vis) {
                    await message('You hear laughter.', state, env);
                } else if (canseemon(magr, state)) {
                    await message(
                        messageAt(
                            `${Monnam(magr, state, env)} chuckles.`,
                            magr.mx,
                            magr.my,
                            state,
                        ),
                        state,
                        env,
                    );
                }
            }
        }
    }
}

// C ref: uhitm.c mhitm_ad_plys() (3431-3476). Preserve the three attack
// orientations and their separate paralysis gates. The hero-defender arm
// consumes dynamic_multi_reason's discarded void result as a named gap.
export async function mhitm_ad_plys(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2, rnd };
    const message = env.message ?? ttyPline;

    if (magr === state.youmonst) {
        // uhitm.c hero-polymorph arm checks damage before the magic gate.
        if (!random.rn2(3)
            && mhm.damage < mdef.mhp
            && !(await mhitm_mgc_atk_negated(
                magr, mdef, true, state, { ...env, random, message },
            ))) {
            if (!heroIsBlind(state)) {
                await message(
                    `${Monnam(mdef, state, env)} is frozen by you!`,
                    state,
                    env,
                );
            }
            paralyze_monst(mdef, random.rnd(10));
        }
    } else if (mdef === state.youmonst) {
        // mhitu.c prints the physical hit message before checking paralysis.
        await hitmsg(magr, mattk, state, { ...env, random, message });
        if (state.multi >= 0
            && !random.rn2(3)
            && !(await mhitm_mgc_atk_negated(
                magr, mdef, true, state, { ...env, random, message },
            ))) {
            if (state.u?.uprops?.[FREE_ACTION]?.extrinsic) {
                await message('You momentarily stiffen.', state, env);
            } else {
                if (heroIsBlind(state)) {
                    await message('You are frozen!', state, env);
                } else {
                    await message(
                        `You are frozen by ${mon_nam(magr, state, env)}!`,
                        state,
                        env,
                    );
                }
                state.nomovemsg = You_can_move_again;
                nomul(-random.rnd(10), state);
                note_unported('uhitm.c dynamic_multi_reason');
                await exercise(A_DEX, false, state, random);
            }
        }
    } else if (mdef.mcanmove
        && !random.rn2(3)
        && !(await mhitm_mgc_atk_negated(
            magr, mdef, true, state, { ...env, random, message },
        ))) {
        if (state.gv?.vis && canspotmon(mdef, state)) {
            await message(
                `${Monnam(mdef, state, env)} is frozen by ${mon_nam(magr, state, env)}.`,
                state,
                env,
            );
        }
        paralyze_monst(mdef, random.rnd(10));
    }
}

// C ref: uhitm.c mhitm_ad_were() (4265-4293). The hero's own blow and a
// monster-versus-monster blow delegate to physical damage; a monster's hit on
// the hero prints its hit message before the ordered lycanthropy gates.
async function mhitm_ad_were(magr, mattk, mdef, mhm, state = game, env = {}) {
    // C snapshots pa before hitmsg/urgent_pline may yield or change form data.
    const attackerData = magr.data;
    const random = env.random ?? { rn2 };

    if (magr === state.youmonst) {
        await mhitm_ad_phys(magr, mattk, mdef, mhm, state, env);
        if (mhm.done) return;
    } else if (mdef === state.youmonst) {
        await hitmsg(magr, mattk, state, env);
        if (!random.rn2(4) && state.u.ulycn === NON_PM
            && !Protection_from_shape_changers(state)
            && !defends(AD_WERE, state.uwep, state)
            && !(await mhitm_mgc_atk_negated(
                magr, mdef, true, state, { ...env, random },
            ))) {
            await (env.urgentMessage ?? ttyUrgentPline)(
                'You feel feverish.', state,
            );
            const encumberMessage = env.encumberMessage
                ?? ((subject) => encumber_msg(subject, {
                    message: env.message ?? ttyPline,
                }));
            await exercise(A_CON, false, state, random, {
                encumberMessage,
            });
            set_ulycn(monsndx(attackerData), state);
            // uhitm.c discards retouch_equipment()'s void result here.
            note_unported('artifact.c retouch_equipment');
        }
    } else {
        await mhitm_ad_phys(magr, mattk, mdef, mhm, state, env);
        if (mhm.done) return;
    }
}

// C ref: uhitm.c mhitm_ad_slee() (3478-3522). Preserve all three attack
// directions and the source's short-circuit/RNG order. In the monster-pair
// arm C calls sleep_monst() twice, although its first successful call makes
// the defender immobile and guarantees that the second returns false.
export async function mhitm_ad_slee(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2, rnd };
    const message = requireAttackOperation(env, 'message');
    const effectEnv = { ...env, state, random, message };

    if (magr === state.youmonst) {
        if (!mdef.msleeping
            && !await mhitm_mgc_atk_negated(
                magr, mdef, false, state, effectEnv,
            )
            && await sleep_monst(
                mdef, random.rnd(10), -1, effectEnv,
            )) {
            if (!heroIsBlind(state))
                await message(
                    `${Monnam(mdef, state)} is put to sleep by you!`,
                    state,
                    env,
                );
            await slept_monst(mdef, effectEnv);
        }
    } else if (mdef === state.youmonst) {
        await hitmsg(magr, mattk, state, effectEnv);
        if ((state.multi ?? 0) >= 0
            && !random.rn2(5)
            && !await mhitm_mgc_atk_negated(
                magr, mdef, true, state, effectEnv,
            )) {
            const sleepResistance = state.u?.uprops?.[SLEEP_RES];
            if (sleepResistance?.intrinsic || sleepResistance?.extrinsic) {
                monstseesu(M_SEEN_SLEEP, state);
                return;
            }
            monstunseesu(M_SEEN_SLEEP, state);
            await fall_asleep(-random.rnd(10), true, state, effectEnv);
            if (heroIsBlind(state)) {
                await message('You are put to sleep!', state, env);
            } else {
                await message(
                    `You are put to sleep by ${mon_nam(magr, state)}!`,
                    state,
                    env,
                );
            }
        }
    } else {
        if (!mdef.msleeping
            && await sleep_monst(
                mdef, random.rnd(10), -1, effectEnv,
            )
            && await sleep_monst(
                mdef, random.rnd(10), -1, effectEnv,
            )) {
            if (state.gv?.vis && canspotmon(mdef, state)) {
                await message(
                    `${Monnam(mdef, state)} is put to sleep by `
                    + `${mon_nam(magr, state)}.`,
                    state,
                    env,
                );
            }
            mdef.mstrategy &= ~STRAT_WAITFORU;
            await slept_monst(mdef, effectEnv);
        }
    }
}

// C ref: uhitm.c mhitm_ad_ench() (3602-3649). A disenchanter's blow has no
// effect on the hero attacker or another monster. Against the hero, preserve
// the magic-cancellation check, hit message, worn-armor selection, fallback
// accessory draw, drain, and success-only message in source order.
export async function mhitm_ad_ench(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    if (magr === state.youmonst || mdef !== state.youmonst) return;

    const random = { rn2, ...(env.random ?? {}) };
    const message = env.message
        ?? (env.planning ? async () => {} : ttyPline);
    const operationEnv = { ...env, random, message };
    const negated = await mhitm_mgc_atk_negated(
        magr, mdef, false, state, operationEnv,
    );
    await hitmsg(magr, mattk, state, operationEnv);
    if (negated) return;

    let obj = some_armor(mdef, state, random);
    if (!obj) {
        switch (random.rn2(5)) {
        case 0:
            break;
        case 1:
            obj = state.uright;
            break;
        case 2:
            obj = state.uleft;
            break;
        case 3:
            obj = state.uamul;
            break;
        case 4:
            obj = state.ublindf;
            break;
        }
    }
    if (obj && drain_item(obj, false, state, operationEnv)) {
        await message(
            `${Yobjnam2(obj, 'seem', state)} less effective.`,
            state,
            operationEnv,
        );
    }
}

// C ref: uhitm.c mhitm_ad_slow() (3652-3687). All three combat directions
// share the magic-cancellation and AD_SLOW defense gates, then preserve their
// distinct monster-speed or intrinsic hero-speed effects.
export async function mhitm_ad_slow(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2 };
    const message = requireAttackOperation(env, 'message');
    const effectEnv = { ...env, state, random, message };
    const negated = await mhitm_mgc_atk_negated(
        magr, mdef, false, state, effectEnv,
    );

    if (defended(mdef, AD_SLOW, state))
        return;

    if (magr === state.youmonst) {
        if (!negated && mdef.mspeed !== MSLOW) {
            const oldSpeed = mdef.mspeed;

            await mon_adjust_speed(mdef, -1, null, state, effectEnv);
            if (mdef.mspeed !== oldSpeed && canseemon(mdef, state))
                await message(`${Monnam(mdef, state)} slows down.`, state,
                    effectEnv);
        }
    } else if (mdef === state.youmonst) {
        await hitmsg(magr, mattk, state, effectEnv);
        if (!negated
            && state.u?.uprops?.[FAST]?.intrinsic
            && !random.rn2(4)) {
            await u_slow_down(state, effectEnv);
        }
    } else if (!negated && mdef.mspeed !== MSLOW) {
        const oldSpeed = mdef.mspeed;

        await mon_adjust_speed(mdef, -1, null, state, effectEnv);
        mdef.mstrategy &= ~STRAT_WAITFORU;
        if (mdef.mspeed !== oldSpeed && state.gv?.vis
            && canspotmon(mdef, state)) {
            await message(
                messageAt(
                    `${Monnam(mdef, state)} slows down.`,
                    mdef.mx,
                    mdef.my,
                    state,
                ),
                state,
                effectEnv,
            );
        }
    }
}

// C ref: uhitm.c mhitm_ad_drli() (2445-2518). Level-draining attacks have
// distinct hero-to-monster, monster-to-hero, and monster-to-monster arms.
// Keep each arm's chance, resistance, negation, output, and HP/level order
// separate; the direct Death caller now enters through mhitm_ad_deth().
export async function mhitm_ad_drli(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = { d, rn2, ...(env.random ?? {}) };
    const message = requireAttackOperation(env, 'message');
    const effectEnv = { ...env, state, random, message };

    if (magr === state.youmonst) {
        if (!random.rn2(3)
            && !(resists_drli(mdef, state) || defended(mdef, AD_DRLI, state))
            && !(await mhitm_mgc_atk_negated(
                magr, mdef, true, state, effectEnv,
            ))) {
            mhm.damage = random.d(2, 6);
            await message(`${Monnam(mdef, state, effectEnv)} becomes weaker!`,
                state, effectEnv);
            if (mdef.mhpmax - mhm.damage > mdef.m_lev) {
                mdef.mhpmax -= mhm.damage;
            } else if (mdef.mhpmax > mdef.m_lev) {
                mdef.mhpmax = mdef.m_lev + 1;
            }
            mdef.mhp -= mhm.damage;
            if (mdef.mhp < 1 || !mdef.m_lev) {
                await message(
                    `${Monnam(mdef, state, effectEnv)} `
                        + `${nonliving(mdef.data) ? 'expires' : 'dies'}!`,
                    state,
                    effectEnv,
                );
                // uhitm.c discards xkilled()'s void result; retain its current
                // source-backed owner for kill state/corpse processing.
                await xkilled(mdef, XKILL_NOMSG, state, effectEnv);
            } else {
                mdef.m_lev--;
            }
            // This helper applied the HP loss itself; damageum must not repeat it.
            mhm.damage = 0;
        }
    } else if (mdef === state.youmonst) {
        await hitmsg(magr, mattk, state, effectEnv);
        if (!random.rn2(3)
            && !propertyPresent(state.u, DRAIN_RES)
            && !(await mhitm_mgc_atk_negated(
                magr, mdef, true, state, effectEnv,
            ))) {
            if (env.planning && state.u.ulevel <= 1) {
                if (typeof env.planningDeath !== 'function') {
                    throw new TypeError(
                        'mhitm_ad_drli requires planningDeath for a fatal planned life drain',
                    );
                }
                // exper.c losexp() reaches end.c done(DIED) for a fatal
                // level-one drain. Planning runs against a clone, but done()
                // still paints the live status and enters terminal recovery;
                // hand the attacker to the live pass before that boundary.
                throw env.planningDeath(magr);
            }
            await losexp('life drainage', state, effectEnv);
        }
    } else {
        const isDeath = mattk.adtyp === AD_DETH;
        if (isDeath
            || (!random.rn2(3)
                && !(resists_drli(mdef, state)
                    || defended(mdef, AD_DRLI, state))
                && !(await mhitm_mgc_atk_negated(
                    magr, mdef, true, state, effectEnv,
                )))) {
            if (!isDeath)
                mhm.damage = random.d(2, 6);
            if (state.gv?.vis && canspotmon(mdef, state)) {
                const text = `${Monnam(mdef, state, effectEnv)} becomes weaker!`;
                await message(
                    messageAt(text, mdef.mx, mdef.my, state),
                    state,
                    effectEnv,
                );
            }
            if (mdef.mhpmax - mhm.damage > mdef.m_lev) {
                mdef.mhpmax -= mhm.damage;
            } else if (mdef.mhpmax > mdef.m_lev) {
                mdef.mhpmax = mdef.m_lev + 1;
            }
            if (mdef.m_lev === 0)
                mhm.damage = mdef.mhp;
            else
                mdef.m_lev--;
        }
    }
}

// C ref: uhitm.c mhitm_ad_conf() (3690-3725). Confusing attacks have three
// directions: the hero confuses a monster directly, a monster can inflict the
// hero's Confusion timeout after its one-in-four gate, and a monster can
// confuse another monster without a timer or random draw.
export async function mhitm_ad_conf(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2 };
    const message = requireAttackOperation(env, 'message');

    if (magr === state.youmonst) {
        if (!mdef.mconf) {
            if (canseemon(mdef, state)) {
                await message(
                    `${Monnam(mdef, state, env)} looks confused.`, state,
                );
            }
            mdef.mconf = 1;
        }
    } else if (mdef === state.youmonst) {
        await hitmsg(magr, mattk, state, env);
        if (!magr.mcan && !random.rn2(4) && !magr.mspec_used) {
            magr.mspec_used = magr.mspec_used + (mhm.damage + random.rn2(6));
            const confusion = state.u?.uprops?.[CONFUSION]?.intrinsic ?? 0;
            await message(
                confusion
                    ? 'You are getting even more confused.'
                    : 'You are getting confused.',
                state,
            );
            await make_confused(confusion + mhm.damage, false, state, env);
        }
        mhm.damage = 0;
    } else {
        if (!magr.mcan && !mdef.mconf && !magr.mspec_used) {
            if (state.gv?.vis && canseemon(mdef, state)) {
                await message(
                    messageAt(
                        `${Monnam(mdef, state, env)} looks confused.`,
                        mdef.mx,
                        mdef.my,
                        state,
                    ),
                    state,
                );
            }
            mdef.mconf = 1;
            mdef.mstrategy &= ~STRAT_WAITFORU;
        }
    }
}

// C ref: uhitm.c mhitm_ad_pest() (3808-3834). Snapshot the attacker's form
// before the awaited name/message path. The valid build has no hero form with
// AD_PEST; monster-to-monster disease effects remain at the exact discarded
// void call until mhitm_ad_dise() is ported.
export async function mhitm_ad_pest(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const pa = magr.data;

    if (magr === state.youmonst) {
        // uhitm.c documents that no valid polymorph form can select this arm.
        // Preserve the source's goto into the AD_DISE case at its void gap.
        note_unported('uhitm.c mhitm_ad_dise');
    } else if (mdef === state.youmonst) {
        const message = requireAttackOperation(env, 'message');
        await message(
            `${Monnam(magr, state, env)} reaches out, and you feel fever and chills.`,
            state,
            env,
        );
        // C discards diseasemu's Boolean here; its disease mutation is the
        // effect, and hitmu() still applies the ordinary attack damage.
        await diseasemu(pa, { ...env, state });
    } else {
        // uhitm.c copies mattk, changes adtyp to AD_DISE and discards the
        // mhitm_ad_dise result. Keep its unported effect at that call boundary.
        note_unported('uhitm.c mhitm_ad_dise');
    }
}

// C ref: uhitm.c mhitm_ad_deth() (3837-3893). Death's touch has a separate
// hero-defender outcome; against another monster it reuses the original hit
// through mhitm_ad_drli(). Snapshot the target form before the first awaited
// message, as C does before entering either direction.
export async function mhitm_ad_deth(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const defenderData = mdef.data;
    const random = env.random ?? { rn2, rnd };
    const message = requireAttackOperation(env, 'message');

    if (magr !== state.youmonst && mdef === state.youmonst) {
        const text = `${Monnam(magr, state, env)} reaches out with its deadly touch.`;
        await message(messageAt(text, magr.mx, magr.my, state), state, env);

        if (is_undead(defenderData)) {
            mhm.damage = Math.trunc((mhm.damage + 1) / 2);
            await message('Was that the touch of death?', state, env);
            return;
        }

        const roll = random.rn2(20);
        if (roll >= 17 && !propertyPresent(state.u, ANTIMAGIC)) {
            // C discards touch_of_death()'s void result; retain only its
            // source-named gap before applying C's explicit damage reset.
            note_unported('mcastu.c touch_of_death');
            mhm.damage = 0;
            return;
        }

        if (roll <= 4) {
            if (propertyPresent(state.u, ANTIMAGIC))
                await shieldeff(state.u.ux, state.u.uy, state);
            await message("Lucky for you, it didn't work!", state, env);
            mhm.damage = 0;
            return;
        }

        await message('You feel your life force draining away...', state, env);
        mhm.permdmg = 1;
        return;
    }

    // The hero-attacker AD_DETH form is excluded by the valid monsters, so C
    // shares this monster-target arm. Preserve its damage division and the
    // already-ported Death-specific AD_DRLI delegation.
    if (is_undead(defenderData) && mhm.damage > 1)
        mhm.damage = random.rnd(Math.trunc(mhm.damage / 2));
    await mhitm_ad_drli(magr, mattk, mdef, mhm, state, env);
}

// C ref: uhitm.c mhitm_ad_heal() (4296-4383). Hero attacks and
// monster-versus-monster attacks delegate physical state to mhitm_ad_phys()
// and immediately observe mhm.done. A monster attacking the hero either lands
// an ordinary hit, heals an unarmed and unarmored hero, or gives the Healer
// role's cooperation message.
export async function mhitm_ad_heal(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { d, rn2, rnd };
    const message = requireAttackOperation(env, 'message');
    const pd = mdef.data;
    const u = state.u;

    if (magr === state.youmonst) {
        // uhitm.c:4303-4307. Nurse is M2_NOPOLY; polyself.c's polyok()
        // rejects it as a player form in ordinary play.
        await mhitm_ad_phys(magr, mattk, mdef, mhm, state, env);
        if (mhm.done) return;
    } else if (mdef === state.youmonst) {
        // uhitm.c:4309-4316. C suppresses healing but keeps the ordinary hit
        // message if the Nurse is cancelled or the hero's polymorphed form
        // would petrify it.
        if (magr.mcan || (Upolyd(u) && touch_petrifies(pd))) {
            await hitmsg(magr, mattk, state, env);
            return;
        }

        // uhitm.c:4317-4366. Weapon, weapon-tool, or worn armor blocks the
        // healing routine; the listed worn slots mirror C's armor macros.
        if (!(state.uwep
              && (state.uwep.oclass === WEAPON_CLASS
                  || is_weptool(state.uwep, state)))
            && !state.uarmu && !state.uarm && !state.uarmc
            && !state.uarms && !state.uarmg && !state.uarmf
            && !state.uarmh) {
            let goaway = false;
            const line = Monnam(magr, state, env)
                + " hits!  (I hope you don't mind.)";
            await message(
                messageAt(line, magr.mx, magr.my, state),
                state,
                env,
            );

            if (Upolyd(u)) {
                u.mh += random.rnd(7);
                if (!random.rn2(7)) {
                    // C allows temporary monster-form HP to grow without a
                    // level-based ceiling.
                    u.mhmax++;
                    if (!random.rn2(13)) goaway = true;
                }
                if (u.mh > u.mhmax) u.mh = u.mhmax;
            } else {
                u.uhp += random.rnd(7);
                if (!random.rn2(7)) {
                    if (u.uhpmax < 5 * u.ulevel
                        + random.d(2 * u.ulevel, 10)) {
                        u.uhpmax++;
                        if (u.uhpmax > u.uhppeak) u.uhppeak = u.uhpmax;
                    }
                    if (!random.rn2(13)) goaway = true;
                }
                if (u.uhp > u.uhpmax) u.uhp = u.uhpmax;
            }

            if (!random.rn2(3)) {
                await exercise(A_STR, true, state, random, {
                    encumberMessage: env.encumberMessage ?? encumber_msg,
                });
            }
            if (!random.rn2(3)) {
                await exercise(A_CON, true, state, random, {
                    encumberMessage: env.encumberMessage ?? encumber_msg,
                });
            }
            if (heroSick(state))
                await make_sick(0, null, false, SICK_ALL, state, env);
            state.disp ??= {};
            state.disp.botl = true;

            if (goaway) {
                await mongone(magr, { ...env, state });
                mhm.done = true;
                mhm.hitflags = M_ATTK_DEF_DIED;
                return;
            } else if (!random.rn2(33)) {
                if (!await tele_restrict(magr, state, env))
                    await rloc(magr, RLOC_MSG, { ...env, state, random });
                await monflee(magr, random.d(3, 6), true, false, {
                    ...env,
                    state,
                    random,
                });
                mhm.done = true;
                mhm.hitflags = M_ATTK_HIT | M_ATTK_DEF_DIED;
                return;
            }
            mhm.damage = 0;
        } else if (state.urole?.mnum === PM_HEALER) {
            // sndprocs.h SetVoice is an empty macro in this build. Its only
            // runtime effect is the source verbalize() call below.
            if (!Deaf(state) && !(state.moves % 5)) {
                await verbalize(
                    "Doc, I can't help you unless you cooperate.",
                    state,
                    { message },
                );
            }
            mhm.damage = 0;
        } else {
            await hitmsg(magr, mattk, state, env);
        }
    } else {
        // uhitm.c:4376-4382. The physical helper is void, but its mhm
        // mutation is consumed by the following source done check.
        await mhitm_ad_phys(magr, mattk, mdef, mhm, state, env);
        if (mhm.done) return;
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
    case AD_LEGS:
        await mhitm_ad_legs(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_WERE:
        await mhitm_ad_were(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_HEAL:
        await mhitm_ad_heal(magr, mattk, mdef, mhm, state, env);
        break;
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
    case AD_STON:
        await mhitm_ad_ston(magr, mattk, mdef, mhm, state, env);
        break;
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
    case AD_CURS:
        await mhitm_ad_curs(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_DRLI:
        await mhitm_ad_drli(magr, mattk, mdef, mhm, state, env);
        break;
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
    case AD_PLYS:
        await mhitm_ad_plys(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_SLEE:
        await mhitm_ad_slee(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_SLIM: unported('mhitm_ad_slim'); break;
    case AD_ENCH:
        await mhitm_ad_ench(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_SLOW:
        await mhitm_ad_slow(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_CONF:
        await mhitm_ad_conf(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_POLY: unported('mhitm_ad_poly'); break;
    case AD_DISE: unported('mhitm_ad_dise'); break;
    case AD_SAMU: unported('mhitm_ad_samu'); break;
    case AD_DETH:
        await mhitm_ad_deth(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_PEST:
        await mhitm_ad_pest(magr, mattk, mdef, mhm, state, env);
        break;
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

    if (canspotmon(mdef, state) && state.flags?.verbose)
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
    const knockdistance = rng.rn2(3) ? 1 : 2;
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
    if ((!u_agr && magr.mhp < 1) || (!u_def && mdef.mhp < 1)) return false;

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
                ? `and ${y_monnam(state.u.usteed, state, env)} ` : '';
            await message(`You ${suffix}don't budge.`, state);
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
        const defender = u_def || was_u ? 'you' : y_monnam(mdef, state, env);
        const extra = was_u && state.u?.usteed
            ? ` and ${y_monnam(state.u.usteed, state, env)}` : '';
        const adjective = rng.rn2(2) ? 'forceful' : 'powerful';
        const noun = rng.rn2(2) ? 'blow' : 'strike';
        await message(
            `${attacker} ${vtense(attacker, 'knock')} ${defender}${extra}`
                + ` ${knockedhow} with a ${adjective} ${noun}!`,
            state,
        );
    } else if (u_agr) {
        await message(
            `You feel ${some_mon_nam(mdef, state, env)} be knocked ${knockedhow}!`,
            state,
        );
    }

    if (state.u?.ustuck && (u_def || u_agr))
        await unstuck(state.u.ustuck, state, { ...env, state, random: rng });

    if (u_def) {
        if (dismount) {
            state.u.dx = dx;
            state.u.dy = dy;
            note_unported('steed.c dismount_steed DISMOUNT_KNOCKED');
        } else {
            await hurtle(dx, dy, knockdistance, false, state, {
                planning: Boolean(env?.planning),
                random: rng,
                planningDeath: env?.planning
                    && typeof env.planningDeath === 'function'
                    ? () => env.planningDeath(magr)
                    : null,
                isolateVision: env?.planning
                    ? isolatePlannedVision : null,
            });
            flags.value |= M_ATTK_HIT;
        }
        set_apparxy(magr, { ...env, state });
        if (!state.u?.uprops?.[STUNNED]?.intrinsic
            && !rng.rn2(4)) {
            await make_stunned(
                knockdistance + 1, true, state, { ...env, message },
            );
        }
    } else {
        await mhurtle(mdef, dx, dy, knockdistance, {
            ...env, state, random: rng,
        });
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
// AD_ENCH also reaches passive_obj() under C's attack-type guards. The other
// nonphysical first-switch and second-switch effects remain source boundaries.
export async function passive(
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

    const passiveAttack = ptr.mattk[i];
    if (passiveAttack.adtyp === AD_ENCH) {
        if (mhitb) {
            const weaponlessKick = aatyp === AT_KICK && !weapon;
            const objectlessAttack = aatyp !== AT_KICK
                && (aatyp === AT_BITE || aatyp === AT_BUTT
                    || (aatyp >= AT_STNG && aatyp < AT_WEAP));
            if (!weaponlessKick && !objectlessAttack) {
                await passive_obj(mon, weapon, passiveAttack, state, env);
            }
        }
    } else if (passiveAttack.adtyp !== AD_PHYS) {
        requireAttackOperation(env, 'unsupported')('passive counter-attack');
    }

    /* 6013. C's guard is `malive && !mon->mcan && rn2(3)`. Its AD_PHYS and
       AD_ENCH arms are empty. */
    if (maliveb && !mon.mcan) random.rn2(3);
}

// C ref: uhitm.c passive_obj() (6122-6190). This handles both an ordinary
// passive object's no-effect arm and the AD_ENCH drain/message arm. C callers
// may supply the object and attack or let this helper select them.
export async function passive_obj(mon, obj, mattk, state = game, env = {}) {
    const random = { rn2, ...(env.random ?? {}) };
    if (!obj) {
        obj = (state.u?.twoweap && state.uswapwep && !random.rn2(2))
            ? state.uswapwep : state.uwep;
        if (!obj && mattk?.adtyp === AD_ENCH) obj = state.uarmg;
        if (!obj) return;
    }
    if (!mattk) {
        for (let i = 0; i < NATTK; ++i) {
            if (mon.data.mattk[i].aatyp === AT_NONE) {
                mattk = mon.data.mattk[i];
                break;
            }
        }
        if (!mattk) return;
    }
    if (mattk.adtyp === AD_ENCH) {
        if (!mon.mcan
            && drain_item(obj, true, state, env)
            && carried(obj)
            && (obj.known || obj.oclass === ARMOR_CLASS)) {
            const message = env.message
                ?? (env.planning ? async () => {} : ttyPline);
            await message(
                `${Yobjnam2(obj, 'seem', state)} less effective.`,
                state,
                env,
            );
        }
    } else if (mattk.adtyp !== AD_PHYS) {
        return requireAttackOperation(env, 'unsupported')(
            'passive object damage',
        );
    }
    if (carried(obj)) {
        update_inventory({ ...env, state });
    }
}
