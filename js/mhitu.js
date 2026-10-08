// mhitu.js -- Monsters attacking the hero.
// C ref: mhitu.c -- hitmsg(), missmu(), mswings_verb(), mswings(), getmattk(),
// calc_mattacku_vars(), mtrapped_in_pit(), mattacku(), magic_negation(),
// could_seduce(), hitmu(), explmu(), gazemu(), mdamageu(), ranged_attk_available(),
// passiveum(), and gulp_blnd_check().

import {
    A_CHA,
    A_CHAOTIC,
    A_CON,
    A_DEX,
    A_INT,
    A_STR,
    A_WIS,
    ACID_RES,
    AC_VALUE,
    BLINDED,
    MAGICAL_BREATHING,
    COLD_RES,
    CONFLICT,
    CONFUSION,
    DETECT_MONSTERS,
    DISPLACED,
    DIED,
    FIRE_RES,
    FEMALE,
    G_EXTINCT,
    HALF_PHDAM,
    INVIS,
    M_AP_NOTHING,
    M_AP_OBJECT,
    M_AP_TYPE,
    M_ATTK_AGR_DIED,
    M_ATTK_AGR_DONE,
    M_ATTK_HIT,
    M_ATTK_MISS,
    MALE,
    MM_EDOG,
    MM_NOMSG,
    M_SEEN_COLD,
    M_SEEN_ACID,
    M_SEEN_ELEC,
    M_SEEN_FIRE,
    NEUTRAL,
    NATTK,
    NO_MINVENT,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    PROTECTION,
    PROT_FROM_SHAPE_CHANGERS,
    P_WHIP,
    RLOC_NOMSG,
    SEE_INVIS,
    STONING,
    STUNNED,
    SHOCK_RES,
    SLOW_DIGESTION,
    SICK,
    SICK_NONVOMITABLE,
    STONE_RES,
    IS_WATERWALL,
    TT_PIT,
    TT_WEB,
    OBJ_FREE,
    TIMEOUT,
    FAST,
    W_AMUL,
    W_ACCESSORY,
    W_ARMOR,
    W_ARM,
    W_ARMC,
    W_ARMG,
    W_ARMH,
    W_ARMU,
    XKILL_NOMSG,
    W_WEP,
    Upolyd,
    is_pit,
    u_at,
    HALLUC,
    HALLUC_RES,
    REFLECTING,
    KILLED_BY,
    HAND,
    LEFT_RING,
    LARGEST_INT,
    RLOC_MSG,
    RIGHT_RING,
    BOLT_LIM,
} from './const.js';
import {
    is_pool,
    is_waterwall,
} from './dbridge.js';
import { acurr, adjalign, adjattrib, exercise, minuhpmax } from './attrib.js';
import { encumber_msg } from './pickup.js';
import { number_leashed } from './apply.js';
import { placebc, unplacebc } from './ball.js';
// js/unported_monster_actions.js already imports allmain.js across the same
// cycle and records why it is safe: `stop_occupation` is a hoisted function
// declaration, initialized before either module body runs, and nothing here
// reads it at module scope.
import { stop_occupation } from './allmain.js';
import {
    ART_SNICKERSNEE,
    ART_STORMBRINGER,
    ART_VORPAL_BLADE,
    Stone_resistance,
    is_art,
    protects,
} from './artifacts.js';
import { getyear, midnight, night, yyyymmdd } from './calendar.js';
import {
    bot,
    flush_screen,
    map_invisible,
    newsym,
    shieldeff,
    swallowed,
    tp_sensemon,
} from './display.js';
import { reset_occupations, y_n } from './cmd.js';
import {
    Monnam,
    Some_Monnam,
    Amonnam,
    capitalizedMonsterName,
    christen_monst,
    hliquid,
    mon_nam,
    monsterPossessive,
    noit_Monnam,
    noit_mon_nam,
    pmname,
} from './do_name.js';
import { initedog } from './dog.js';
import { In_hell, on_level } from './dungeon.js';
import { done, done_in_by } from './end.js';
import { mon_explodes } from './explode.js';
import { losexp, pluslvl } from './exper.js';
import { game } from './gstate.js';
import { losehp, nomul, showdamage, spoteffects } from './hack.js';
import { dist2, distmin, upstart } from './hacklib.js';
import { is_home_elemental } from './makemon.js';
import { makemon_runtime } from './makemon_create.js';
import { msummon } from './minion.js';
import {
    attk_protection,
    engulf_target,
    failed_grab,
    paralyze_monst,
} from './mhitm.js';
import {
    golemeffects,
    killed,
    mondead,
    mon_to_stone,
    new_were,
    set_ustuck,
    unstuck,
    wake_nearto,
    xkilled,
} from './mon.js';
import {
    DISTANCE_ATTK_TYPE,
    cvt_adtyp_to_mseenres,
    get_atkdam_type,
    haseyes,
    hides_under,
    amorphous,
    amphibious,
    breathless,
    is_animal,
    is_demon,
    is_human,
    is_minion,
    is_orc,
    nolimbs,
    is_undead,
    is_vampshifter,
    is_were,
    mhe,
    dmgtype,
    gender,
    mhim,
    mhis,
    monsndx,
    monstseesu,
    monstunseesu,
    mon_hates_blessings,
    perceives,
    poly_when_stoned,
    Resists_Elem,
    stagger,
    thick_skinned,
    touch_petrifies,
    unsolid,
    attacktype_fordmg,
    can_blnd,
    flaming,
    defended,
    resists_blnd,
    resists_drli,
} from './mondata.js';
import { monnear, onscary, set_apparxy } from './monmove.js';
import * as M from './monsters.js';
import { find_offensive } from './muse.js';
import { mon_reflects, ureflects } from './muse.js';
import { makeplural } from './fruit.js';
import { is_weptool, is_wet_towel, objectType } from './obj.js';
import {
    currency,
    freeinv,
    money_cnt,
    prinv,
    sobj_at,
    u_carried_gloves,
    update_inventory,
} from './invent.js';
import { place_monster, remove_monster } from './monst.js';
import {
    AMULET_OF_GUARDING,
    BOULDER,
    CORPSE,
    OILSKIN_CLOAK,
    PIERCE,
    RIN_ADORNMENT,
    WEAPON_CLASS,
    getObjects,
} from './objects.js';
import {
    an,
    cloak_simple_name,
    donameFresh,
    safe_qbuf,
    simpleonames,
    the,
    vtense,
    xname,
    xnameFresh,
    yname,
} from './objnam.js';
import { discover_object, observe_object } from './o_init.js';
import { is_quest_artifact } from './questpgr.js';
import { d, rn1, rn2, rnd, rne, rn2_on_display_rng } from './rng.js';
import { Punished } from './steed.js';
import { heroIsBlind, messageAt } from './startup_a11y.js';
import {
    t_at,
    reset_utrap,
} from './trap.js';
import { drain_en } from './trap_effects.js';
import {
    displayPendingTtyMessageWindow,
    ttyPline,
    ttyUrgentPline,
} from './tty_message.js';
import {
    heroSickResistance,
    digests,
    enfolds,
    mhitm_adtyping,
    mhitm_knockback,
} from './uhitm.js';
import { Cold_resistance, Fire_resistance, drain_item } from './zap.js';
import { cansee, couldsee, m_canseeu, vision_recalc } from './vision.js';
import { hitval } from './weapon.js';
import { is_pole, setworn, which_armor } from './worn.js';
import { breamu, spitmu } from './mthrowu.js';
import { mnexto } from './mon.js';
import {
    body_part,
    poly_gender,
    polymon,
    rehumanize,
    ugolemeffects,
} from './polyself.js';
import {
    make_blinded,
    make_confused,
    make_hallucinated,
    make_sick,
    make_stunned,
    incr_itimeout,
} from './potion.js';
import { burnarmor } from './trap_erode_obj.js';
import { destroy_items } from './zap_destroy_items.js';
import { ignite_items } from './apply_catch_lit.js';
import { burn_away_slime } from './timeout.js';
import { note_unported } from './unported.js';
import { heroDeaf, heroUnaware, verbalize } from './pline.js';
import { growl_sound, set_voice } from './sounds.js';
import { were_summon } from './were.js';
import { canseemon, canspotmon, mon_visible } from './display.js';
import { stop_donning, Ring_gone, Ring_on } from './do_wear.js';
import { welded } from './wield.js';
import { mpickobj, remove_worn_item, unresponsive } from './steal.js';
import { money2mon } from './shk.js';
import { tele_restrict, rloc } from './teleport.js';

// C ref: mhitu.c u_slow_down() (163-171).  The self-zap and monster-action
// callers share this owner: HFast is cleared in one operation, leaving any
// extrinsic speed source (such as speed boots) for the second message arm.
export async function u_slow_down(
    state = game,
    { message = ttyPline, random = { rn2 } } = {},
) {
    const fast = state.u?.uprops?.[FAST];
    if (!fast) return;
    fast.intrinsic = 0;
    if (!(fast.extrinsic ?? 0))
        await message('You slow down.', state);
    else
        await message('Your quickness feels less natural.', state);
    await exercise(A_DEX, false, state, random);
}

// C ref: mhitu.c u_slip_free() (1047-1085). AT_ENGL excludes this escape;
// other grabbing attacks inspect cloak, suit, shirt, or the AD_DRIN helmet.
export async function u_slip_free(mtmp, mattk, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const message = rawEnv.message ?? (rawEnv.planning ? async () => {}
        : ttyPline);

    if (mattk.aatyp === M.AT_ENGL) return false;

    let obj = which_armor(state.youmonst, W_ARMC, state)
        || which_armor(state.youmonst, W_ARM, state);
    if (!obj) obj = which_armor(state.youmonst, W_ARMU, state);
    if (mattk.adtyp === M.AD_DRIN)
        obj = which_armor(state.youmonst, W_ARMH, state);

    if (obj && (obj.greased || obj.otyp === OILSKIN_CLOAK)
        && (!obj.cursed || random.rn2(3))) {
        const name = obj.greased || objectType(obj, state).oc_name_known
            ? xnameFresh(obj, state)
            : cloak_simple_name(obj, state);
        await message(
            messageAt(
                `${Monnam(mtmp, state, rawEnv)} `
                    + `${mattk.adtyp === M.AD_WRAP ? 'slips off of'
                        : 'grabs you, but cannot hold onto'} your `
                    + `${obj.greased ? 'greased' : 'slippery'} ${name}!`,
                mtmp.mx,
                mtmp.my,
                state,
            ),
            state,
            rawEnv,
        );

        if (obj.greased && !random.rn2(2)) {
            await message('The grease wears off.', state, rawEnv);
            obj.greased = false;
            update_inventory({ ...rawEnv, state });
        }
        return true;
    }
    return false;
}

// Planning cannot call end.c done_in_by() on its cloned state: the ordinary
// death entry updates the live terminal and then asks for input. This signal
// carries the source DIED result across the atomic planning/live seam; it is
// consumed by unported_monster_actions.js and is never a gameplay boundary.
export class MonsterDeathPlanningError extends Error {
    constructor(monster, how = DIED) {
        super('the hero dying of a monster attack');
        this.name = 'MonsterDeathPlanningError';
        this.monsterId = monster.m_id;
        this.how = how;
    }
}

// mhitu.c:summonmu() uses an() for one visible helper but makeplural() for
// several; Deaf changes only the final source suffix.
export function unseenWereSummonMessage(numseen, genericWere, deaf) {
    const nounPhrase = numseen === 1
        ? `${an(genericWere)} appears`
        : `${makeplural(genericWere)} appear`;
    return `${upstart(nounPhrase)}${deaf ? ' from nowhere' : ''}!`;
}

// C expands youprop.h:Protection_from_shape_changers in mhitu.c and were.c.
export function Protection_from_shape_changers(state) {
    const property = state.u.uprops[PROT_FROM_SHAPE_CHANGERS];
    return Boolean(property.intrinsic || property.extrinsic);
}

// C ref: mhitu.c summonmu() (956-1030). The caller supplies the same random
// owner it uses for the rest of the attack; this matters when mattacku() is
// evaluating the turn on its planning clone.
export async function summonmu(monster, youseeit, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { d, rn1, rn2, rnd, rne };
    const message = rawEnv.message ?? ttyPline;
    const mdat = monster.data;

    if (is_demon(mdat)) {
        if (mdat.pmidx !== M.PM_BALROG
            && mdat.pmidx !== M.PM_AMOROUS_DEMON
            && !random.rn2(In_hell(state.u.uz, state) ? 10 : 16)) {
            // mhitu.c discards msummon()'s result.
            await msummon(monster, { ...rawEnv, state, random });
        }
        return;
    }

    if (!is_were(mdat)) return;

    if (is_human(mdat)) {
        if (!Protection_from_shape_changers(state)
            && !random.rn2(5 - (night(state) ? 2 : 0))) {
            await new_were(monster, {
                ...rawEnv,
                state,
                random,
                message,
                redrawSquare: rawEnv.redrawSquare
                    ?? rawEnv.redraw
                    ?? ((x, y) => newsym(x, y)),
            });
        }
    } else if (Protection_from_shape_changers(state)
        || !random.rn2(30)) {
        await new_were(monster, {
            ...rawEnv,
            state,
            random,
            message,
            redrawSquare: rawEnv.redrawSquare
                ?? rawEnv.redraw
                ?? ((x, y) => newsym(x, y)),
        });
    }

    // C refreshes mdat after new_were() before choosing compatible helpers.
    const currentData = monster.data;
    if (random.rn2(10)) return;

    const visible = { value: 0 };
    const genericWere = { value: 'creature' };
    if (youseeit) {
        await message(`${Monnam(monster, state, rawEnv)} summons help!`, state);
    }
    const numhelp = await were_summon(
        currentData,
        false,
        visible,
        genericWere,
        state,
        random,
        rawEnv,
    );

    const hemmedIn = async () => message(
        `${heroUnaware(state) ? 'You dream that you feel' : 'You feel'} hemmed in.`,
        state,
    );
    if (youseeit) {
        if (numhelp > 0) {
            if (visible.value === 0) await hemmedIn();
        } else {
            await message('But none comes.', state);
        }
        return;
    }

    const deaf = heroDeaf(state);
    if (!deaf) {
        await message(
            `Something ${makeplural(growl_sound(monster))}!`,
            state,
        );
    }
    if (numhelp > 0) {
        if (visible.value < 1) {
            await hemmedIn();
        } else {
            await message(
                unseenWereSummonMessage(
                    visible.value,
                    genericWere.value,
                    deaf,
                ),
                state,
            );
        }
    }
}

// C ref: mhitu.c cloneu() (2616-2640).  The clone is created through the
// ordinary makemon() owner, then initialized as a dog before its hit-point
// pool is split.  This return value is consumed by potion.c split_mon(), so a
// failed creation returns null and never mutates the hero's pool.
export async function cloneu(rawState = game, rawEnv = {}) {
    const state = rawEnv.state ?? rawState ?? game;
    const random = {
        d,
        rn1,
        rn2,
        rnd,
        rne,
        ...(rawEnv.random ?? {}),
    };
    const mndx = monsndx(state.youmonst?.data);
    if (state.u.mh <= 1)
        return null;
    if ((state.mvitals?.[mndx]?.mvflags ?? 0) & G_EXTINCT)
        return null;
    const creationEnv = {
        ...rawEnv,
        state,
        random,
        // mhitu.c:cloneu() invokes makemon() at the hero square with this
        // exact inventoryless dog-creation shape during ordinary play.  The
        // marker lets makemon_create.js admit that source caller outside
        // level generation without widening the generic runtime allowlist.
        _cloneu: true,
        ...(rawEnv.planning
            ? {
                message: rawEnv.message ?? (async () => {}),
                norepMessage: rawEnv.norepMessage ?? (async () => {}),
            }
            : {}),
    };
    let monster = await makemon_runtime(
        state.youmonst.data,
        state.u.ux,
        state.u.uy,
        NO_MINVENT | MM_EDOG | MM_NOMSG,
        creationEnv,
    );
    if (!monster)
        return null;
    monster.mcloned = true;
    monster = christen_monst(monster, state.plname, { ...rawEnv, state });
    initedog(monster, true, { ...rawEnv, state, random });
    monster.m_lev = state.youmonst.data.mlevel;
    monster.mhpmax = state.u.mhmax;
    monster.mhp = Math.trunc(state.u.mh / 2);
    state.u.mh -= monster.mhp;
    state.disp.botl = true;
    return monster;
}

function requireMattackuOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`mattacku requires a ${name} operation`);
    return operation;
}

// youprop.h:92-103 and :198. Both properties are intrinsic-or-extrinsic and
// both are defeated by an artifact block. Only Blind (:103) and Invis (:198)
// route through here; a macro without a `blocked` alias needs its own copy.
function activeHeroProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean((value?.intrinsic || value?.extrinsic) && !value?.blocked);
}

// C ref: youprop.h:218 Conflict, `(HConflict || EConflict)`. Two disjuncts and
// no blocking term, which is why it cannot share activeHeroProperty() above:
// youprop.h gives a `blocked` alias to BLINDED, CLAIRVOYANT, INVIS, STEALTH,
// LEVITATION and FLYING alone, so no C path sets one for CONFLICT. mhitu.c
// reads Conflict once, in mattacku()'s cockatrice-instinct test at 803.
function Conflict(state) {
    const conflict = state.u?.uprops?.[CONFLICT];
    return Boolean(conflict?.intrinsic || conflict?.extrinsic);
}

// C ref: hack.h distu() and mdistu(). mdistu() is distu() applied to a
// monster's own square, with no long-worm handling of its own.
function mdistu(monster, state) {
    return dist2(monster.mx, monster.my, state.u.ux, state.u.uy);
}

// C ref: you.h:560 m_next2u(), `distu((m)->mx, (m)->my) <= 2`. dist2() is a
// squared distance, so it never equals 3 and this is the same set of squares
// as mattacku()'s `!ranged`. Exported because mon.c restrap()'s last guard
// term reads it too, and one C macro gets one port.
export function m_next2u(monster, state) {
    return mdistu(monster, state) <= 2;
}

// C ref: mhitu.c wildmiss() (176-262). A monster can attack the wrong square
// when it cannot see, when the hero is displaced, or while the hero is
// underwater. The caller supplies the ordinary gameplay random source; the
// display and message seams remain injectable so the planning pass can spend
// gameplay draws without painting the live terminal.
export async function wildmiss(mtmp, mattk, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const canSee = rawEnv.canSee
        ?? ((x, y) => cansee(x, y, state));
    const message = rawEnv.message ?? ttyPline;
    const invisibleHero = activeHeroProperty(state, INVIS)
        && !perceives(mtmp.data);
    const unotseen = !mtmp.mcansee || invisibleHero;
    const unotthere = Boolean(
        state.u?.uprops?.[DISPLACED]?.intrinsic
        || state.u?.uprops?.[DISPLACED]?.extrinsic,
    );
    const usubmerged = Boolean(state.u?.uinwater);

    // C's impossible() diagnostic is not a gameplay message. This path means
    // the caller violated mattacku()'s target invariant, so return after the
    // diagnostic seam (when one is provided) without changing the PRNG.
    if (!unotseen && !unotthere && !usubmerged) {
        if (typeof rawEnv.impossible === 'function') {
            rawEnv.impossible(
                `${capitalizedMonsterName(mtmp, state, rawEnv)} attacks you `
                + 'without knowing your location?',
            );
        }
        return;
    }

    if (!state.flags?.verbose || !canSee(mtmp.mx, mtmp.my)) return;

    // could_seduce() is evaluated before the monster name in C. Ordinary
    // physical attacks return zero without a draw.
    const compat = (mattk.adtyp === M.AD_SEDU || mattk.adtyp === M.AD_SSEX)
        ? could_seduce(mtmp, state.youmonst, mattk, { ...rawEnv, state })
        : 0;

    if (unotseen) {
        if (!compat) {
            // C consumes this draw even during planning, but the planning pass
            // must not evaluate display-only naming or write a line.
            const outcome = random.rn2(3);
            if (rawEnv.planning) return;
            const name = capitalizedMonsterName(mtmp, state, rawEnv);
            const swings = mattk.aatyp === M.AT_BITE ? 'snaps'
                : mattk.aatyp === M.AT_KICK ? 'kicks'
                    : mattk.aatyp === M.AT_STNG
                        || mattk.aatyp === M.AT_BUTT
                        || nolimbs(mtmp.data) ? 'lunges' : 'swings';
            const target = (() => {
                const location = state.level?.at?.(mtmp.mux, mtmp.muy);
                return location && IS_WATERWALL(location.typ)
                    ? 'empty water' : 'thin air';
            })();
            const text = outcome === 0
                ? `${name} ${swings} wildly and misses!`
                : outcome === 1
                    ? `${name} attacks a spot beside you.`
                    : `${name} strikes at ${target}!`;
            await message(messageAt(text, mtmp.mx, mtmp.my, state), state);
        } else if (!rawEnv.planning) {
            const name = capitalizedMonsterName(mtmp, state, rawEnv);
            await message(
                messageAt(`${name} tries to touch you and misses!`,
                    mtmp.mx, mtmp.my, state),
                state,
            );
        }
        return;
    }

    // The displacement message is intentionally emitted even while blind;
    // at this point cansee() has established that the monster's own square is
    // visible. Underwater is reached only when the preceding reason is off.
    if (rawEnv.planning) return;
    const name = capitalizedMonsterName(mtmp, state, rawEnv);
    let text;
    if (unotthere) {
        text = compat
            ? `${name} smiles ${compat === 2 ? 'engagingly' : 'seductively'} `
                + `at your ${invisibleHero ? 'invisible ' : ''}`
                + 'displaced image...'
            : `${name} strikes at your ${invisibleHero ? 'invisible ' : ''}`
                + 'displaced image and misses you!';
    } else if (usubmerged) {
        text = compat
            ? `${name} reaches towards your distorted image.`
            : `${name} is fooled by water reflections and misses!`;
    } else {
        // unotseen with compat != 0 is the seduction-specific message.
        text = `${name} tries to touch you and misses!`;
    }
    await message(messageAt(text, mtmp.mx, mtmp.my, state), state);
}

// C ref: mhitu.c could_seduce() (1933-1984). "returns 0 if seduction
// impossible, 1 if fine, 2 if wrong gender for nymph".
export function could_seduce(magr, mdef, mattk, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (is_animal(magr.data)) return 0;

    let pagr;
    let agrinvis;
    let genagr;
    if (magr === state.youmonst) {
        pagr = state.youmonst.data;
        const invis = state.u?.uprops?.[INVIS];
        agrinvis = Boolean((invis?.intrinsic || invis?.extrinsic)
            && !invis?.blocked);
        genagr = poly_gender(state);
    } else {
        pagr = magr.data;
        agrinvis = Boolean(magr.minvis);
        genagr = gender(magr);
    }

    let defperc;
    let gendef;
    if (mdef === state.youmonst) {
        const seeInvisible = state.u?.uprops?.[SEE_INVIS];
        defperc = Boolean(seeInvisible?.intrinsic
            || seeInvisible?.extrinsic);
        gendef = poly_gender(state);
    } else {
        defperc = perceives(mdef.data);
        gendef = gender(mdef);
    }

    let adtyp = mattk ? mattk.adtyp
        : dmgtype(pagr, M.AD_SSEX) ? M.AD_SSEX
            : dmgtype(pagr, M.AD_SEDU) ? M.AD_SEDU
                : M.AD_PHYS;
    if (adtyp === M.AD_SSEX && !(state.sysopt?.seduce ?? true))
        adtyp = M.AD_SEDU;

    if (agrinvis && !defperc && adtyp === M.AD_SEDU)
        return 0;

    /* nymphs have two attacks, one for steal-item damage and the other
       for seduction, both pass the could_seduce() test;
       incubi/succubi have three attacks, their claw attacks for damage
       don't pass the test */
    if ((pagr.mlet !== M.S_NYMPH
        && pagr !== state.mons[M.PM_AMOROUS_DEMON])
        || (adtyp !== M.AD_SEDU && adtyp !== M.AD_SSEX
            && adtyp !== M.AD_SITM))
        return 0;

    return genagr === 1 - gendef ? 1
        : pagr.mlet === M.S_NYMPH ? 2 : 0;
}

// C ref: mhitu.c doseduce() (1985-2305). Resolve one successful seduction,
// retaining its early returns, inventory order, and outcome-draw order. The
// source's private mayberem() calls are void and remain named gaps; they do
// not supply a return value to this function.
export async function doseduce(mon, state = game, rawEnv = {}) {
    const random = {
        d, rn1, rn2, rnd,
        ...(rawEnv.random ?? {}),
    };
    const message = rawEnv.message
        ?? (rawEnv.planning ? async () => {} : ttyPline);
    const urgentMessage = rawEnv.urgentMessage
        ?? (rawEnv.message ? rawEnv.message
            : rawEnv.planning ? async () => {} : ttyUrgentPline);
    const effectEnv = { ...rawEnv, state, random, message };
    const namingEnv = {
        ...effectEnv,
        canSpotMonster: (monster, currentState) =>
            canseemon(monster, currentState),
    };
    const pline = (text) => message(text, state);
    const plineMon = (text) => message(
        messageAt(text, mon.mx, mon.my, state), state,
    );
    const urgent = (text) => urgentMessage(text, state);
    const makeknown = (otyp) => discover_object(
        otyp, true, true, true, state, effectEnv,
    );
    const mayberem = () => note_unported('mhitu.c mayberem');
    const femaleDemon = monsndx(mon.data) === M.PM_AMOROUS_DEMON
        && Boolean(mon.female);
    const pronounEnv = {
        ...namingEnv,
        canSpotMonster: () => true,
    };

    if (mon.mcan || mon.mspec_used) {
        await plineMon(
            `${Monnam(mon, state, namingEnv)} acts as though `
                + `${mhe(mon, namingEnv)} has got a `
                + `${mon.mcan ? 'severe ' : ''}headache.`,
        );
        return 0;
    }
    if (unresponsive(state)) {
        await plineMon(
            `${Monnam(mon, state, namingEnv)} seems dismayed at your lack `
                + 'of response.',
        );
        return 0;
    }

    const seewho = canseemon(mon, state);
    if (!seewho) await pline('Someone caresses you...');
    else await pline(`You feel very attracted to ${mon_nam(mon, state, namingEnv)}.`);
    const who = seewho
        ? Monnam(mon, state, namingEnv)
        : femaleDemon ? 'She' : 'He';

    // do_wear.c stop_donning() is a void state-change call here; C ignores
    // its returned delay but finishes the interruption before checking uwep.
    await stop_donning(null, state);
    let triedGloves = welded(state.uwep, state) ? 1 : 0;

    for (let ring = state.invent; ring;) {
        const nextRing = ring.nobj;
        if (ring.otyp !== RIN_ADORNMENT) {
            ring = nextRing;
            continue;
        }

        if (femaleDemon) {
            if (ring.owornmask && state.uarmg) {
                if (!triedGloves++) mayberem();
                if (state.uarmg) {
                    ring = nextRing;
                    continue;
                }
            }
            if (!heroDeaf(state) && random.rn2(20) < acurr(state, A_CHA)) {
                const query = safe_qbuf(
                    '"That ', ' looks pretty.  May I have it?"', ring,
                    xname, simpleonames, 'ring', state,
                );
                makeknown(RIN_ADORNMENT);
                set_voice(mon, 0, 80, 0, state);
                if (await y_n(query, state) === 'n') {
                    ring = nextRing;
                    continue;
                }
            } else {
                await pline(
                    `${who} decides she'd like ${yname(ring, state)}, `
                        + 'and takes it.',
                );
            }
            makeknown(RIN_ADORNMENT);
            if (ring.owornmask)
                await remove_worn_item(ring, false, state, effectEnv);
            await freeinv(ring, effectEnv);
            mpickobj(mon, ring, effectEnv);
        } else {
            if (state.uleft && state.uright
                && state.uleft.otyp === RIN_ADORNMENT
                && state.uright.otyp === RIN_ADORNMENT) {
                break;
            }
            if (ring === state.uleft || ring === state.uright) {
                ring = nextRing;
                continue;
            }
            if (state.uarmg) {
                if (!triedGloves++) mayberem();
                if (state.uarmg) break;
            }
            if (!heroDeaf(state) && random.rn2(20) < acurr(state, A_CHA)) {
                const query = safe_qbuf(
                    '"That ',
                    ' looks pretty.  Would you wear it for me?"',
                    ring,
                    xname,
                    simpleonames,
                    'ring',
                    state,
                );
                makeknown(RIN_ADORNMENT);
                set_voice(mon, 0, 80, 0, state);
                if (await y_n(query, state) === 'n') {
                    ring = nextRing;
                    continue;
                }
            } else {
                await pline(
                    `${who} decides you'd look prettier wearing `
                        + `${yname(ring, state)},`,
                );
                await pline('and puts it on your finger.');
            }
            makeknown(RIN_ADORNMENT);
            if (!state.uright) {
                await pline(
                    `${who} puts ${the(xname(ring, state), state)} on your `
                        + `right ${body_part(HAND, state.youmonst)}.`,
                );
                await setworn(ring, RIGHT_RING, { state });
            } else if (!state.uleft) {
                await pline(
                    `${who} puts ${the(xname(ring, state), state)} on your `
                        + `left ${body_part(HAND, state.youmonst)}.`,
                );
                await setworn(ring, LEFT_RING, { state });
            } else if (state.uright
                && state.uright.otyp !== RIN_ADORNMENT) {
                await pline(
                    `${who} replaces ${yname(state.uright, state)} with `
                        + `${yname(ring, state)}.`,
                );
                await Ring_gone(state.uright, state);
                if (state.utotype || !m_next2u(mon, state)) return 1;
                await setworn(ring, RIGHT_RING, { state });
            } else if (state.uleft
                && state.uleft.otyp !== RIN_ADORNMENT) {
                await pline(
                    `${who} replaces ${yname(state.uleft, state)} with `
                        + `${yname(ring, state)}.`,
                );
                await Ring_gone(state.uleft, state);
                if (state.utotype || !m_next2u(mon, state)) return 1;
                await setworn(ring, LEFT_RING, { state });
            } else {
                note_unported('pline.c impossible');
            }
            await Ring_on(ring, state, effectEnv);
            await prinv(null, ring, 0, effectEnv);
        }
        ring = nextRing;
    }

    const naked = !state.uarmc && !state.uarmf && !state.uarmg
        && !state.uarms && !state.uarmh && !state.uarmu;
    await urgent(
        `${who} ${heroDeaf(state)
            ? 'seems to murmur into your ear'
            : naked ? 'murmurs sweet nothings into your ear'
                : 'murmurs in your ear'}${naked
            ? '' : ', while helping you undress'}.`,
    );
    mayberem(); // cloak
    if (!state.uarmc) mayberem(); // suit
    mayberem(); // boots
    if (!triedGloves) mayberem(); // gloves
    mayberem(); // shield
    mayberem(); // helm
    if (!state.uarmc && !state.uarm) mayberem(); // shirt

    if (state.utotype || !m_next2u(mon, state)) return 1;
    if (state.uarm || state.uarmc) {
        if (!heroDeaf(state)) {
            // mhitu.c's ld() compares the fixed date's MMDD remainder with
            // 0229; it is a leap-day predicate, independent of alignment.
            const leapDay = yyyymmdd(state) - getyear(state) * 10000 === 0xe5;
            if (!(leapDay && mon.female)) {
                set_voice(mon, 0, 80, 0, state);
                await verbalize(
                    `You're such a ${state.flags?.female
                        ? 'sweet lady' : 'nice guy'}; I wish...`,
                    state,
                    { message },
                );
            } else {
                const yourGloves = u_carried_gloves(state);
                if (yourGloves) observe_object(yourGloves, state);
                await verbalize(
                    `Well, then you owe me ${yourGloves
                        ? yname(yourGloves, state)
                        : 'twelve pairs of gloves'}${yourGloves
                        ? ' and eleven more pairs of gloves' : ''}!`,
                    state,
                    { message },
                );
            }
        } else if (seewho) {
            await plineMon(`${Monnam(mon, state, namingEnv)} appears to sigh.`);
        }

        if (!await tele_restrict(mon, state, effectEnv)) {
            await rloc(mon, RLOC_MSG, {
                ...effectEnv,
                newsym,
                onscary: (x, y, mtmp, normalized) =>
                    onscary(x, y, mtmp, normalized.state),
                setApparxy: set_apparxy,
            });
        }
        return 1;
    }

    if (state.u?.ualign?.type === A_CHAOTIC) adjalign(1, state);
    await urgent(
        `Time stands still while you and ${noit_mon_nam(mon, state, namingEnv)} `
            + "lie in each other's arms...",
    );
    const attrTotal = acurr(state, A_CHA) + acurr(state, A_INT);
    if (random.rn2(35) > Math.min(attrTotal, 32)) {
        await pline(
            `${noit_Monnam(mon, state, namingEnv)} seems to have enjoyed it `
                + 'more than you...',
        );
        switch (random.rn2(5)) {
        case 0:
            await pline('You feel drained of energy.');
            state.u.uen = 0;
            state.u.uenmax -= random.rnd(Half_physical_damage(state) ? 5 : 10);
            await exercise(A_CON, false, state, random, {
                encumberMessage: (currentState) =>
                    encumber_msg(currentState, { message }),
            });
            if (state.u.uenmax < 0) state.u.uenmax = 0;
            break;
        case 1:
            await pline('You are down in the dumps.');
            await adjattrib(A_CON, -1, true, state, effectEnv);
            await exercise(A_CON, false, state, random, {
                encumberMessage: (currentState) =>
                    encumber_msg(currentState, { message }),
            });
            state.disp.botl = true;
            break;
        case 2:
            await pline('Your senses are dulled.');
            await adjattrib(A_WIS, -1, true, state, effectEnv);
            await exercise(A_WIS, false, state, random, {
                encumberMessage: (currentState) =>
                    encumber_msg(currentState, { message }),
            });
            state.disp.botl = true;
            break;
        case 3:
            if (!resists_drli(state.youmonst, state)) {
                await pline('You feel out of shape.');
                await losexp('overexertion', state, effectEnv);
            } else {
                await pline('You have a curious feeling...');
            }
            for (const attribute of [A_CON, A_DEX, A_WIS]) {
                await exercise(attribute, false, state, random, {
                    encumberMessage: (currentState) =>
                        encumber_msg(currentState, { message }),
                });
            }
            break;
        case 4: {
            await pline('You feel exhausted.');
            await exercise(A_STR, false, state, random, {
                encumberMessage: (currentState) =>
                    encumber_msg(currentState, { message }),
            });
            const damage = random.rn1(10, 6);
            await losehp(
                Half_physical_damage(state)
                    ? Math.trunc((damage + 1) / 2) : damage,
                'exhaustion', KILLED_BY, state, effectEnv,
            );
            break;
        }
        }
    } else {
        mon.mspec_used = random.rnd(100);
        await pline(
            `You seem to have enjoyed it more than `
                + `${noit_mon_nam(mon, state, namingEnv)}...`,
        );
        switch (random.rn2(5)) {
        case 0:
            await pline('You feel raised to your full potential.');
            await exercise(A_CON, true, state, random, {
                encumberMessage: (currentState) =>
                    encumber_msg(currentState, { message }),
            });
            state.u.uenmax += random.rnd(5);
            state.u.uen = state.u.uenmax;
            if (state.u.uenmax > state.u.uenpeak)
                state.u.uenpeak = state.u.uenmax;
            break;
        case 1:
            await pline('You feel good enough to do it again.');
            await adjattrib(A_CON, 1, true, state, effectEnv);
            await exercise(A_CON, true, state, random, {
                encumberMessage: (currentState) =>
                    encumber_msg(currentState, { message }),
            });
            state.disp.botl = true;
            break;
        case 2:
            await pline(
                `You will always remember ${noit_mon_nam(mon, state, namingEnv)}...`,
            );
            await adjattrib(A_WIS, 1, true, state, effectEnv);
            await exercise(A_WIS, true, state, random, {
                encumberMessage: (currentState) =>
                    encumber_msg(currentState, { message }),
            });
            state.disp.botl = true;
            break;
        case 3:
            await pline('That was a very educational experience.');
            await pluslvl(false, state, effectEnv);
            await exercise(A_WIS, true, state, random, {
                encumberMessage: (currentState) =>
                    encumber_msg(currentState, { message }),
            });
            break;
        case 4:
            await pline('You feel restored to health!');
            state.u.uhp = state.u.uhpmax;
            if (Upolyd(state.u)) state.u.mh = state.u.mhmax;
            await exercise(A_STR, true, state, random, {
                encumberMessage: (currentState) =>
                    encumber_msg(currentState, { message }),
            });
            state.disp.botl = true;
            break;
        }
    }

    if (!mon.mtame) {
        if (random.rn2(20) < acurr(state, A_CHA)) {
            await pline(
                `${noit_Monnam(mon, state, namingEnv)} demands that you pay `
                    + `${mhim(mon, pronounEnv)}, but you refuse...`,
            );
        } else if (state.u?.umonnum === M.PM_LEPRECHAUN) {
            await plineMon(
                `${noit_Monnam(mon, state, namingEnv)} tries to take your gold, `
                    + 'but fails...',
            );
        } else {
            const heroMoney = money_cnt(state.invent);
            let cost = heroMoney > LARGEST_INT - 10
                ? random.rnd(LARGEST_INT) + 500
                : random.rnd(Math.trunc(heroMoney) + 10) + 500;
            if (mon.mpeaceful) {
                cost = Math.trunc(cost / 5);
                if (!cost) cost = 1;
            }
            if (cost > heroMoney) cost = heroMoney;
            if (!cost) {
                if (!heroDeaf(state)) {
                    set_voice(mon, 0, 80, 0, state);
                    await verbalize("It's on the house!", state, { message });
                } else {
                    await pline('No charge.');
                }
            } else {
                await plineMon(
                    `${noit_Monnam(mon, state, namingEnv)} takes ${cost} `
                        + `${currency(cost, state)} for services rendered!`,
                );
                money2mon(mon, cost, state);
                state.disp.botl = true;
            }
        }
    }
    if (!random.rn2(25)) mon.mcan = 1;
    if (!await tele_restrict(mon, state, effectEnv)) {
        await rloc(mon, RLOC_MSG, {
            ...effectEnv,
            newsym,
            onscary: (x, y, mtmp, normalized) =>
                onscary(x, y, mtmp, normalized.state),
            setApparxy: set_apparxy,
        });
    }
    return 1;
}

// allmain.c stop_occupation(), which mhitu.c calls from missmu() at :99 and
// from hitmu() at :1266. It is imported rather than resolved from the env,
// because the env this file is handed carries a `stopOccupation` key that
// js/unported_monster_actions.js binds twice with opposite meanings -- once to
// the real function for dochugw()'s interruption and once to a refusal for a
// pet's hunger -- and neither binding is meant for these two call sites.
//
// What the env does own is the pair of display operations that differ between
// the live game and the atomic planning clone, so those are forwarded.
function mattackuStopOccupation(env) {
    return stop_occupation(env.state, {
        message: env.message,
        statusRefresh: env.statusRefresh,
    });
}

// C ref: decl.h:457-458, the `gh` globals hitmsg() writes and missmu() clears.
// decl.c:400-401 starts them at 0 and NULL, and neither appears in save.c, so
// a restored game starts from those values again; this port therefore keeps
// them on the game state and out of `input.storage`.
//
// C's hitmsg_prev is a `struct attack *` into the attacker's own mattk[] when
// no substitution is needed. getmattk() can also hand back the caller-owned
// alternate record, so the JavaScript adjacency check finds catalog records
// in the current attacker's list and naturally does not mistake a detached
// substitution for a catalog slot.
function hitmsgState(state) {
    state.gh ??= {};
    state.gh.hitmsg_mid ??= 0;
    state.gh.hitmsg_prev ??= null;
    return state.gh;
}

// C ref: mhitu.c hitmsg() (28-81). "monster hits hero"; the line every landed
// blow prints before its damage type acts.
//
// The `again` term is C's `mattk == gh.hitmsg_prev + 1`. It can only be true
// inside one mattacku() NATTK loop: a landed blow at slot i leaves prev at i,
// the next turn starts again at slot 0, and any miss in between clears prev
// through missmu(). No monster this slice admits has two attacks, so it never
// prints yet; it is ported rather than deferred because the state it reads is
// the state missmu() already clears.
export async function hitmsg(mtmp, mattk, state = game, env = {}) {
    const message = requireMattackuOperation(env, 'message');
    const gh = hitmsgState(state);
    let punct = '!';
    let verb;
    let Monst_name = capitalizedMonsterName(mtmp, state, env);

    /* Note: if opposite gender, "seductively";
       if same gender, "engagingly" for nymph, normal msg for others. */
    // C's first arm prints a seductive message for a nonzero could_seduce().
    // No current hitmsg() caller reaches that arm, but keep the predicate in
    // the source order so a future caller gets C's result.
    // uhitm.c mhitm_ad_phys() and mhitm_ad_elec() are the only current callers,
    // and both pass a non-null mattk whose adtyp is AD_PHYS or AD_ELEC. C
    // returns zero for those attacks; calling the full helper preserves the
    // source order for any future seductive caller.
    could_seduce(mtmp, state.youmonst, mattk, { ...env, state });

    switch (mattk.aatyp) {
    case M.AT_BITE:
        verb = 'bites';
        break;
    case M.AT_KICK:
        if (thick_skinned(state.youmonst.data))
            punct = '.';
        verb = 'kicks';
        break;
    case M.AT_STNG:
        verb = 'stings';
        break;
    case M.AT_BUTT:
        verb = 'butts';
        break;
    case M.AT_TUCH:
        verb = 'touches you';
        break;
    case M.AT_TENT:
        verb = 'tentacles suck your brain';
        /* s_suffix(Monst_name) */
        Monst_name = monsterPossessive(mtmp, state, true, env);
        break;
    case M.AT_EXPL:
    case M.AT_BOOM:
        verb = 'explodes';
        break;
    default:
        verb = 'hits';
    }
    /* if a monster hits more than once with similar attack, say so */
    const prevIndex = gh.hitmsg_prev
        ? mtmp.data.mattk.indexOf(gh.hitmsg_prev) : -1;
    const again = (mtmp.m_id === gh.hitmsg_mid
                   && prevIndex >= 0
                   && mtmp.data.mattk[prevIndex + 1] === mattk
                   && mattk.aatyp === gh.hitmsg_prev.aatyp) ? ' again' : '';
    await message(`${Monst_name} ${verb}${again}${punct}`, state);

    gh.hitmsg_mid = mtmp.m_id;
    gh.hitmsg_prev = mattk;
}

// C ref: mhitu.c missmu() (84-100). "monster missed you".
//
// C opens with map_invisible() for a monster the hero cannot spot, marking the
// square as containing an invisible monster, then falls through to the miss
// message. capitalizedMonsterName() produces "It" when canspotmon() is false.
async function missmu(mtmp, nearmiss, mattk, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const unsupported = requireMattackuOperation(rawEnv, 'unsupported');
    const message = requireMattackuOperation(rawEnv, 'message');
    const markInvisible = requireMattackuOperation(rawEnv, 'markInvisible');
    const spotMonster = rawEnv.canSpotMonster ?? canspotmon;
    const gh = hitmsgState(state);

    gh.hitmsg_mid = 0;
    gh.hitmsg_prev = null;

    // C ref: mhitu.c:90-91. Same pattern as hitmu(): mark the square as
    // containing an invisible monster when the hero cannot spot the attacker.
    const spotted = spotMonster(mtmp, state);
    if (!spotted)
        markInvisible(mtmp.mx, mtmp.my);
    // do_name.c x_monnam() adds the invisible adjective for a spotted
    // invisible monster and can spend display RNG while hallucinating. Keep
    // that naming branch fail-closed without blocking the unspotted "It" arm.
    if (mtmp.minvis && spotted)
        unsupported('a miss by an invisible monster the hero can see');
    if (could_seduce(mtmp, state.youmonst, mattk, rawEnv) && !mtmp.mcan) {
        await message(
            `${capitalizedMonsterName(mtmp, state, rawEnv)} `
            + 'pretends to be friendly.',
            state,
        );
    } else {
        await message(
            `${capitalizedMonsterName(mtmp, state, rawEnv)} `
            + `${(nearmiss && state.flags?.verbose) ? 'just ' : ''}misses!`,
            state,
        );
    }

    await mattackuStopOccupation(rawEnv);
}

// C ref: mhitu.c mswings_verb() (104-126). "strike types P|S|B: Pierce
// (pointed: stab) => 'thrusts', Slash (edged: slice) or whack (blunt: Bash)
// => 'swings'".
//
// The rn2(2) is the only randomness, and only a weapon that pierces *and*
// does something else reaches it.
export function mswings_verb(mwep, bash, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const type = objectType(mwep, state);
    /* (monsters don't actually wield towels, wet or otherwise) */
    const lash = type.oc_skill === P_WHIP || is_wet_towel(mwep);
    /* some weapons can have more than one strike type; for those,
       give a mix of thrust and swing (caller doesn't care either way) */
    const thrust = (type.oc_dir & PIERCE) !== 0
        && ((type.oc_dir & ~PIERCE) === 0 || !random.rn2(2));

    return bash ? 'bashes with' /*sigh*/
        : lash ? 'lashes'
            : thrust ? 'thrusts'
                : 'swings';
}

// C ref: mhitu.c mswings() (129-141). "monster swings obj".
async function mswings(mtmp, otemp, bash, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const message = requireMattackuOperation(rawEnv, 'message');
    const visible = rawEnv.monsterVisible ?? mon_visible;

    if (state.flags?.verbose && !activeHeroProperty(state, BLINDED)
        && visible(mtmp, state)) {
        await message(
            `${capitalizedMonsterName(mtmp, state)} `
            + `${mswings_verb(otemp, bash, rawEnv)} `
            + `${(otemp.quan > 1) ? 'one of ' : ''}`
            + `${mhis(mtmp, {
                ...rawEnv,
                canSpotMonster: rawEnv.canSpotMonster ?? canspotmon,
            })} ${xnameFresh(otemp, state)}.`,
            state,
        );
    }
}

// C ref: mhitu.c mpoisons_subj() (145-162). This pure helper describes how
// the attack delivered poison. The weapon slot is selected from the attacker
// exactly as C chooses uwep for youmonst and MON_WEP for another monster.
export function mpoisons_subj(mtmp, mattk, state = game) {
    if (mattk.aatyp === M.AT_WEAP) {
        const mwep = mtmp === state.youmonst ? state.uwep : mtmp.mw;
        return (!mwep || !mwep.opoisoned) ? 'attack' : 'weapon';
    }
    return mattk.aatyp === M.AT_TUCH ? 'contact'
        : mattk.aatyp === M.AT_GAZE ? 'gaze'
            : mattk.aatyp === M.AT_BITE ? 'bite' : 'sting';
}

// C ref: mhitu.c getmattk() (309-444). “select a monster's next attack,
// possibly substituting for its usual one”. The catalog records are mutable
// copies of the generated C table during play, but a substitution must still
// use a separate attack record: the C caller supplies `alt_attk_buf`, while
// JavaScript returns a fresh object for that caller-owned temporary.
const SEDUCTION_ATTACKS_NO = Object.freeze([
    Object.freeze({ aatyp: M.AT_CLAW, adtyp: M.AD_PHYS, damn: 1, damd: 3 }),
    Object.freeze({ aatyp: M.AT_CLAW, adtyp: M.AD_PHYS, damn: 1, damd: 3 }),
    Object.freeze({ aatyp: M.AT_BITE, adtyp: M.AD_DRLI, damn: 2, damd: 6 }),
    Object.freeze({ aatyp: M.AT_NONE, adtyp: M.AD_PHYS, damn: 0, damd: 0 }),
    Object.freeze({ aatyp: M.AT_NONE, adtyp: M.AD_PHYS, damn: 0, damd: 0 }),
    Object.freeze({ aatyp: M.AT_NONE, adtyp: M.AD_PHYS, damn: 0, damd: 0 }),
]);

export function getmattk(magr, mdef, indx, prev_result, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const mptr = magr.data;
    let attk = mptr.mattk[indx];
    const weap = magr === state.youmonst ? state.uwep : magr.mw;
    const udefend = mdef === state.youmonst;
    const copyAttack = (source) => ({ ...source });

    // honor SEDUCE=0; sysopt.seduce defaults to on in sys.c. The no-seduction
    // table is the exact c_sa_no[NATTK] definition from monst.c/monsters.h.
    if (!(state.sysopt?.seduce ?? true)) {
        // If the first attack is SSEX, all six attacks are substituted. If it
        // is not, only the selected SSEX attack changes to drain life.
        if (mptr.mattk[0].adtyp === M.AD_SSEX) {
            attk = { ...SEDUCTION_ATTACKS_NO[indx] };
        } else if (attk.adtyp === M.AD_SSEX) {
            attk = copyAttack(attk);
            attk.adtyp = M.AD_DRLI;
        }
    }

    // Prevent two consecutive disease, pestilence, or famine attacks from
    // both applying their special damage on one turn.
    if (indx > 0 && prev_result[indx - 1] > M_ATTK_MISS
        && (attk.adtyp === M.AD_DISE || attk.adtyp === M.AD_PEST
            || attk.adtyp === M.AD_FAMN)
        && attk.adtyp === mptr.mattk[indx - 1].adtyp) {
        attk = copyAttack(attk);
        attk.adtyp = M.AD_STUN;

    // Make drain-energy damage proportional to current and maximum energy.
    } else if (attk.adtyp === M.AD_DREN && udefend) {
        const ulevel = Math.max(state.u.ulevel, 6);
        attk = copyAttack(attk);
        if (state.u.uen <= 5 * ulevel && attk.damn > 1) {
            attk.damn -= 1;
            if (state.u.uenmax <= 2 * ulevel && attk.damd > 3)
                attk.damd -= 3;
        } else if (state.u.uen > 12 * ulevel) {
            attk.damn += 1;
            if (state.u.uenmax > 20 * ulevel)
                attk.damd += 3;
        }

    // Holders and engulfers cannot immediately re-grab after releasing the
    // hero; genetic engineers use the same simpler attack substitution.
    } else if (magr.mspec_used
               && (attk.aatyp === M.AT_ENGL || attk.aatyp === M.AT_HUGS
                   || attk.adtyp === M.AD_STCK || attk.adtyp === M.AD_POLY)) {
        const wimpy = attk.damd === 0;
        attk = copyAttack(attk);
        if (attk.adtyp === M.AD_ACID || attk.adtyp === M.AD_ELEC
            || attk.adtyp === M.AD_COLD || attk.adtyp === M.AD_FIRE) {
            attk.aatyp = M.AT_TUCH;
        } else {
            attk.aatyp = M.AT_CLAW;
            attk.adtyp = M.AD_PHYS;
        }
        attk.damn = 1;
        attk.damd = 6;
        if (wimpy && attk.aatyp === M.AT_CLAW) {
            attk.aatyp = M.AT_TUCH;
            attk.damn = 0;
            attk.damd = 0;
        }

    // Force a cancelled or specially dangerous non-physical weapon attack to
    // physical damage, except when the second weapon attack already is so.
    } else if (indx === 0 && magr !== state.youmonst
               && attk.aatyp === M.AT_WEAP && attk.adtyp !== M.AD_PHYS
               && !(mptr.mattk[1].aatyp === M.AT_WEAP
                    && mptr.mattk[1].adtyp === M.AD_PHYS)
               && (magr.mcan
                   || (weap && ((weap.otyp === CORPSE
                                 && touch_petrifies(state.mons[weap.corpsenm]))
                                || is_art(weap, ART_STORMBRINGER)
                                || is_art(weap, ART_VORPAL_BLADE))))) {
        attk = copyAttack(attk);
        attk.adtyp = M.AD_PHYS;

    // A cold-resistant target makes a lich's first cold touch physical, with
    // the source's reduced dice. Shade is immune to ordinary damage, so it is
    // excluded from this substitution.
    } else if (indx === 0 && attk.aatyp === M.AT_TUCH
               && attk.adtyp === M.AD_COLD
               && (udefend
                   ? Cold_resistance(state)
                   : Resists_Elem(mdef, COLD_RES, state))
               && mdef.data !== state.mons[M.PM_SHADE]) {
        attk = copyAttack(attk);
        attk.adtyp = M.AD_PHYS;
        attk.damn = Math.trunc((attk.damn + 1) / 2);
        if (attk.damd === 10) attk.damd = 6;
    }

    // Home-plane elementals double the selected damage only if no earlier
    // branch already made a temporary attack record.
    if (attk === mptr.mattk[indx] && is_home_elemental(mptr, state)) {
        attk = copyAttack(attk);
        attk.damn *= 2;
    }

    return attk;
}

// C ref: mhitu.c calc_mattacku_vars() (447-463). "calc some variables needed
// for mattacku()".
//
// C also sets gb.bhitpos to the hero's square and clears gn.notonhead, which
// do_attack() does for the mirror case. Neither has a ported reader. hitmu()
// reads neither; the consumers are mattacku()'s own u_at(gb.bhitpos.x,
// gb.bhitpos.y) test at mhitu.c:782 and the passive counter-attacks. That
// test is tautologically false, because the only write between here and it,
// the steed retaliation at mhitu.c:545, returns on every path out of :547.
export function calc_mattacku_vars(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const seeMonster = rawEnv.canSeeMonster ?? canseemon;
    return {
        ranged: mdistu(mtmp, state) > 3,
        range2: !monnear(mtmp, mtmp.mux, mtmp.muy, state),
        foundyou: u_at(mtmp.mux, mtmp.muy, state),
        youseeit: seeMonster(mtmp, state),
    };
}

// C ref: mhitu.c mtrapped_in_pit() (466-479). "return TRUE iff monster or hero
// is trapped in a (spiked) pit".
export function mtrapped_in_pit(mtmp, state = game) {
    const ttmp = mtmp === state.youmonst
        ? ((state.u.utrap && state.u.utraptype === TT_PIT)
            ? t_at(state.u.ux, state.u.uy, state) : null)
        : (mtmp.mtrapped ? t_at(mtmp.mx, mtmp.my, state) : null);

    return Boolean(ttmp && is_pit(ttmp.ttyp));
}

// C ref: mhitu.c mattacku() (491-951). "monster attacks you; returns 1 if
// monster dies (e.g. 'yellow light'), 0 otherwise".
//
// This slice's AT_GAZE arm now calls gazemu(), but C excludes Medusa there:
// mon.c:m_respond handles the only compiled AD_STON attacker first. The
// reflected lethal gaze therefore remains in m_respond_medusa, not this
// function's return. Other reachable exits in this partial port still answer
// false, including the steed's own arm, which mhitu.c:532 returns 0 from.
//
// C dochug() consumes mattacku()'s result to stop after attacker death. The
// current JS dochug adapter still awaits and discards that separate result;
// this task only fixes dochug's preceding response/death order seam and does
// not claim the whole caller contract.
//
// Ported: the preamble, including the invulnerable-hero early return, the
// u.usteed arm, the armor-class differential, the eel-reveal, the
// find_offensive()/use_offensive() pair, the NATTK loop, and,
// inside it,
// the AT_CLAW/AT_KICK/AT_BITE/AT_STNG/AT_TUCH/AT_BUTT/AT_TENT arm, the
// non-range2 AT_WEAP arm, and the ordinary ice-vortex AT_ENGL arm. Those
// attacks run through hitmu(), missmu() or gulpmu().
//
// Refused where C acts: the hero-concealment blocks (u.uundetected, the
// S_MIMIC and M_AP_OBJECT arms), summonmu(), use_offensive()'s arms outside
// the thrown potion, wildmiss() for a monster that guessed wrong, and every
// other aatyp arm.
//
// Two lines of the preamble are deliberately absent:
//   DEADMONSTER(mtmp) cannot answer TRUE, because mon.c movemon() drops a
//     monster with mhp < 1 before dochug() runs and nothing between there and
//     here damages it;
//   Underwater needs u.uinwater, whose sole writer is hack.c set_uinwater()
//     and whose only ported callers, in js/do.js, both pass FALSE;
// The swallowed-state arm now belongs to the ordinary ice-vortex slice below;
// other swallowed attackers still stop in their own AT_ENGL branches.
//
// Two seams still owe the steed draw and stop before it, named by symbol
// because line numbers rot and both citations here were already wrong once:
// js/dogmove.js dog_move()'s `monster === state.u.usteed` arm (dogmove.c:911)
// and js/dogmove.js pet_ranged_attk() (dogmove.c:1286). Both must call this
// function when they are ported.
export async function mattacku(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const u = state.u;
    const random = rawEnv.random;
    if (typeof random?.rn2 !== 'function' || typeof random?.rnd !== 'function'
        || typeof random?.d !== 'function') {
        throw new TypeError(
            'mattacku requires an rn2, rnd and d random source',
        );
    }
    const unsupported = requireMattackuOperation(rawEnv, 'unsupported');
    // pline_mon(), newsym() and bot(). The planning scan replays the same turn
    // against the live display afterwards, so a dry run must produce none of
    // the three.
    const message = rawEnv.planning
        ? async () => {}
        : (rawEnv.message ?? ttyPline);
    // mhitu.c's steal() chain calls ordinary pline() for the worn-item
    // preface and urgent_pline() for the final theft line. Planning must keep
    // both operations silent; a live attack gets the urgent terminal boundary.
    const urgentMessage = rawEnv.planning
        ? async () => {}
        : (rawEnv.urgentMessage ?? ttyUrgentPline);
    const redraw = rawEnv.planning ? () => {} : (rawEnv.redraw ?? newsym);
    const statusRefresh = rawEnv.planning
        ? async () => {}
        : (rawEnv.statusRefresh ?? (() => bot()));
    // map_invisible() writes map memory and then paints through
    // show_glyph_cell(), both against the module-global game. The planning
    // scan replays the same turn live afterwards, so a dry run must write
    // neither half; the live replay writes both.
    const markInvisible = rawEnv.planning
        ? () => {}
        : (rawEnv.markInvisible ?? map_invisible);
    // C keeps cosmetic choices on the display stream.  Planning owns a
    // cloned display context; live callers use the game's display context.
    // Supplying this explicitly prevents hliquid() in passiveum() from
    // falling back to the attacker's gameplay random source.
    const displayRandom = rawEnv.displayRandom
        ?? (state.displayCtx
            ? (bound) => rn2_on_display_rng(bound, state)
            : () => 0);
    const env = {
        ...rawEnv, state, message, urgentMessage, redraw, statusRefresh,
        markInvisible, displayRandom,
        planningDeath: (subject) => new MonsterDeathPlanningError(subject),
    };
    let mdat = monster.data;
    const initial = calc_mattacku_vars(monster, env);
    let { range2, foundyou } = initial;

    if (!initial.ranged)
        nomul(0, state);

    // C ref: mhitu.c mattacku() (522-533). Once engulfed, only the current
    // holder may attack; its remembered target is refreshed to the hero's
    // current square before the attack loop starts.
    if (u.uswallow) {
        if (monster !== u.ustuck) return false;
        monster.mux = u.ux;
        monster.muy = u.uy;
        if (u.uinvulnerable) return false;
        range2 = false;
        foundyou = true;
    }

    if (u.usteed) {
        if (monster === u.usteed)
            /* Your steed won't attack you */
            return false;
        /* Orcs like to steal and eat horses and the like */
        if (!random.rn2(is_orc(mdat) ? 2 : 4)
            && m_next2u(monster, state)) {
            // C hands the attack to mattackm(mtmp, u.usteed) and, if the steed
            // survives, lets it strike back through a second mattackm(). No
            // monster-versus-monster combat is ported.
            unsupported("a monster attacking the hero's steed");
        }
    }

    // The three hero-concealment blocks (551-706). Each ends in `return 0`
    // after revealing the hero, and each needs machinery -- enexto()/teleds(),
    // set_ustuck(), unmul() -- that is not ported. Their shared gate,
    // `!range2 && foundyou && !u.uswallow`, is written once.
    if (!range2 && foundyou) {
        if (u.uundetected) unsupported('a monster finding the hidden hero');
        if (state.youmonst.data.mlet === M.S_MIMIC
            && M_AP_TYPE(state.youmonst) !== M_AP_NOTHING) {
            unsupported('a monster finding the mimicking hero');
        }
        if (M_AP_TYPE(state.youmonst) === M_AP_OBJECT)
            unsupported('a monster finding the hero disguised as an object');
    }

    /*  Work out the armor class differential   */
    let tmp = AC_VALUE(u.uac, random) + 10; /* tmp ~= 0 - 20 */
    tmp += monster.m_lev;
    if ((state.multi ?? 0) < 0)
        tmp += 4;
    if ((activeHeroProperty(state, INVIS) && !perceives(mdat))
        || !monster.mcansee)
        tmp -= 2;
    if (monster.mtrapped)
        tmp -= 2;
    if (tmp <= 0)
        tmp = 1;

    /* make eels visible the moment they hit/miss us */
    if (mdat.mlet === M.S_EEL && monster.minvis
        && cansee(monster.mx, monster.my, state)) {
        monster.minvis = false;
        redraw(monster.mx, monster.my);
    }

    /* when not cancelled and not in current form due to shapechange, many
       demons can summon more demons and were creatures can summon critters */
    // C ref: mhitu.c:mattacku() calls summonmu() at 729-740.
    if (monster.cham === M.NON_PM && !monster.mcan && !range2
        && (is_demon(mdat) || is_were(mdat))) {
        const alreadyFleeing = Boolean(monster.mflee);
        await summonmu(monster, initial.youseeit, env);
        if (monster.mflee && !alreadyFleeing) return false;
        // were.c:new_were() can replace the form while summonmu() runs.
        mdat = monster.data;
    }

    if (u.uinvulnerable) return false; /* monsters won't attack you */

    /* Unlike defensive stuff, don't let them use item _and_ attack. */
    if (find_offensive(monster, env)) {
        const useOffensiveItem = requireMattackuOperation(
            env,
            'useOffensiveItem',
        );
        const offended = await useOffensiveItem(monster, env);
        if (offended !== 0) return offended === 1 ? 1 : 0;
    }

    // C resets the shared drain-inventory guard for each monster attack.
    // mhitm.js uses the same field when a monster attacks another monster.
    state.gs ??= {};
    state.gs.skipdrin = false;
    const firstfoundyou = foundyou;
    let skipnonmagc = false;
    const sum = new Array(NATTK).fill(M_ATTK_MISS);
    // mhitu.c's static mon_currwep is the weapon used by the current attack
    // slot. It is cleared before getmattk() for every slot, then assigned only
    // by AT_WEAP; passiveum() reads it for AD_ENCH.
    let mon_currwep = null;

    for (let i = 0; i < NATTK; i++) {
        sum[i] = M_ATTK_MISS;
        // C's DEADMONSTER(mtmp) guard covers a counterattack against attack
        // [i-1] having killed the attacker. Every counterattack sits behind
        // hitmu(), which refuses, so the attacker is always alive here.
        if (i > 0) {
            /* recalc in case prior attack moved hero */
            ({ range2, foundyou } = calc_mattacku_vars(monster, env));
            /* if hero was found but isn't anymore, avoid wildmiss now */
            if (firstfoundyou && !foundyou)
                continue; /* set sum[i] to 'miss' but skip other actions */
            // C's second skip tests !u_at(gb.bhitpos.x, gb.bhitpos.y).
            // calc_mattacku_vars() has just written the hero's own square into
            // bhitpos, so that test is always false and is left out.
        }
        mon_currwep = null;
        env.mon_currwep = mon_currwep;
        const mattk = getmattk(monster, state.youmonst, i, sum, env);
        // C skips swallowed non-engulfing attacks, all non-magical attacks
        // after wildmiss(), and a second drain-inventory tentacle when the
        // first one already handled it. The latter two state fields are kept
        // here even though the selected recipe reaches only wildmiss().
        if ((u.uswallow && mattk.aatyp !== M.AT_ENGL)
            || (skipnonmagc && mattk.aatyp !== M.AT_MAGC)
            || (state.gs?.skipdrin && mattk.aatyp === M.AT_TENT
                && mattk.adtyp === M.AD_DRIN)) {
            continue;
        }

        switch (mattk.aatyp) {
        case M.AT_CLAW: /* "hand to hand" attacks */
        case M.AT_KICK:
        case M.AT_BITE:
        case M.AT_STNG:
        case M.AT_TUCH:
        case M.AT_BUTT:
        case M.AT_TENT:
            if (mattk.aatyp === M.AT_KICK && mtrapped_in_pit(monster, state))
                continue;
            if (!range2 && (!monster.mw /* MON_WEP() */ || monster.mconf
                            || Conflict(state)
                            || !touch_petrifies(state.youmonst.data))) {
                if (foundyou) {
                    const j = random.rnd(20 + i);
                    if (tmp > j) {
                        if (unsolid(state.youmonst.data)
                            && await failed_grab(
                                monster, state.youmonst, mattk, env,
                            )) continue;
                        if (mattk.aatyp !== M.AT_KICK
                            || !thick_skinned(state.youmonst.data)) {
                            sum[i] = await hitmu(monster, mattk, env);
                        }
                    } else {
                        await missmu(monster, tmp === j, mattk, env);
                    }
                } else {
                    // wildmiss() announces an attack on the wrong square and
                    // sets skipnonmagc for the rest of the loop.
                    await wildmiss(monster, mattk, env);
                    // C avoids repeating the same physical miss for the
                    // attack slots that follow; magical attacks still run.
                    skipnonmagc = true;
                }
            }
            break;

        case M.AT_HUGS: /* automatic if prev two attacks succeed */
            /* Note: if displaced, prev attacks never succeeded */
            if ((!range2 && i >= 2 && sum[i - 1] && sum[i - 2])
                || monster === u.ustuck) {
                if (!await failed_grab(
                    monster, state.youmonst, mattk, env,
                )) {
                    sum[i] = await hitmu(monster, mattk, env);
                }
            }
            break;

        case M.AT_GAZE: /* can affect you either ranged or not */
            /* Medusa gaze already operated through m_respond in
               dochug(); don't gaze more than once per round. */
            if (mdat !== state.mons?.[M.PM_MEDUSA])
                sum[i] = await gazemu(monster, mattk, env);
            break;

        case M.AT_EXPL: /* automatic hit if next to, and aimed at you */
            if (!range2)
                sum[i] = await explmu(monster, mattk, foundyou, env);
            break;

        case M.AT_ENGL:
            if (!range2) {
                if (foundyou) {
                    let j = 0;
                    const engulfing = u.uswallow
                        || (!monster.mspec_used
                            && ((j = random.rnd(20 + i)), tmp > j));
                    if (engulfing) {
                        if (!env.planning) await flush_screen(1);
                        sum[i] = await gulpmu(monster, mattk, env);
                    } else {
                        await missmu(monster, tmp === j, mattk, env);
                    }
                } else if (digests(mdat)) {
                    await message(
                        `${Monnam(monster, state, env)} gulps some air!`,
                        state,
                        env,
                    );
                } else if (initial.youseeit) {
                    await message(
                        `${Monnam(monster, state, env)} lunges forward and recoils!`,
                        state,
                        env,
                    );
                } else {
                    if (is_whirly(mdat))
                        note_unported('sound.c rushing-wind sound effect');
                    await message(
                        `You hear a ${is_whirly(mdat) ? 'rushing noise' : 'splat'} nearby.`,
                        state,
                        env,
                    );
                }
            }
            break;

        case M.AT_BREA:
            if (range2)
                sum[i] = await breamu(monster, mattk, env);
            /* Note: breamu takes care of displacement */
            break;

        case M.AT_SPIT:
            if (range2)
                sum[i] = await spitmu(monster, mattk, env);
            /* Note: spitmu takes care of displacement */
            break;

        case M.AT_WEAP:
            if (range2) {
                if (!on_level(u.uz, state.rogue_level)) {
                    await requireMattackuOperation(
                        env, 'throwRangedWeapon',
                    )(monster, env);
                }
            } else {
                let hittmp = 0;

                /* Rare but not impossible.  Normally the monster
                 * wields when 2 spaces away, but it can be
                 * teleported or whatever....
                 */
                if (monster.weapon_check === NEED_WEAPON || !monster.mw) {
                    monster.weapon_check = NEED_HTH_WEAPON;
                    /* mon_wield_item resets weapon_check as appropriate */
                    const wieldMonsterItem = requireMattackuOperation(
                        env, 'wieldMonsterItem',
                    );
                    if (await wieldMonsterItem(monster, env) !== 0)
                        break;
                }
                if (foundyou) {
                    mon_currwep = monster.mw; /* MON_WEP() */
                    env.mon_currwep = mon_currwep;
                    if (mon_currwep) {
                        const bash = is_pole(mon_currwep, state)
                            && mon_currwep.oartifact !== ART_SNICKERSNEE
                            && m_next2u(monster, state);

                        // C passes &gy.youmonst, whose mx and my track the
                        // hero. Only hitval()'s trident-versus-swimmer arm
                        // reads them, and no hero species swims.
                        hittmp = hitval(mon_currwep, state.youmonst,
                            state, env);
                        tmp += hittmp;
                        await mswings(monster, mon_currwep, bash, env);
                    }
                    // C stores this attack roll in gm.mhitu_dieroll; the
                    // AD_PHYS poison continuation reads it after artifact and
                    // damage resolution. Keep the same roll with that attack.
                    const j = random.rnd(20 + i);
                    if (tmp > j)
                        sum[i] = await hitmu(monster, mattk, {
                            ...env,
                            dieroll: j,
                        });
                    else
                        await missmu(monster, tmp === j, mattk, env);
                    /* KMH -- Don't accumulate to-hit bonuses */
                    if (mon_currwep)
                        tmp -= hittmp;
                } else {
                    await wildmiss(monster, mattk, env);
                    // C avoids repeating the same physical miss for the
                    // attack slots that follow; magical attacks still run.
                    skipnonmagc = true;
                }
            }
            break;

        case M.AT_MAGC:
            if (range2) {
                const castRangedSpell = requireMattackuOperation(
                    env, 'castRangedSpell',
                );
                sum[i] = await castRangedSpell(monster, mattk, env);
            } else {
                const castMonsterSpell = requireMattackuOperation(
                    env, 'castMonsterSpell',
                );
                sum[i] = await castMonsterSpell(
                    monster, mattk, true, foundyou, env,
                );
            }
            break;

        default: /* no attack */
            break;
        }
        // C's mdamageu() calls done_in_by(), whose ordinary death path does
        // not return to mattacku().  really_done() signals that NORETURN path
        // with gameover so the JavaScript display can unwind; stop the
        // attacker's remaining attack slots at the same point.
        if (state.program_state?.gameover)
            return 1;
        if (state.disp?.botl) await statusRefresh();
        /* give player a chance of waking up before dying -kaa */
        if (sum[i] === M_ATTK_HIT) { /* successful attack */
            if (u.usleep && u.usleep < state.moves && !random.rn2(10)) {
                state.multi = -1;
                state.nomovemsg = 'The combat suddenly awakens you.';
            }
        }
        if (sum[i] & M_ATTK_AGR_DIED)
            return 1;
        if (sum[i] & M_ATTK_AGR_DONE)
            break;
    }
    return false;
}

// C ref: mhitu.c expels() (264-306). This is the non-digestive expulsion arm
// reached by the ordinary ice-vortex slice below. mon.c:mnexto() owns its
// overcrowding and optional monster-telecontrol continuations; expels waits
// for that source-ordered work before it redraws or applies terrain effects.
export async function expels(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const unsupported = requireMattackuOperation(rawEnv, 'unsupported');
    if (rawEnv.message !== undefined && typeof rawEnv.message !== 'function') {
        throw new TypeError('expels requires a message operation');
    }

    // The current caller passes FALSE, so C emits the user-facing line in
    // gulpmu() immediately before this helper. The TRUE arm needs digests(),
    // enfolds(), attacktype_fordmg() and the corresponding name formatters;
    // none is reachable from the admitted ice-vortex attack.
    if (rawEnv.expulsionMessage) {
        unsupported('the named expulsion message');
    }

    state.disp ??= {};
    state.disp.botl = true;
    // mon.c unstuck() owns the swallowed redraw and final re-hold cooldown;
    // expels() awaits that owner before relocation.
    await unstuck(mtmp, state, { ...rawEnv, state });

    // teleport.c rloc_to_core() owns the old and new monster-square redraws.
    // Keep the operation seam explicit so a planning clone cannot paint the
    // live map while mnexto() performs that relocation.
    const redraw = rawEnv.planning
        ? () => {}
        : (rawEnv.newsym ?? rawEnv.redraw ?? newsym);
    await mnexto(mtmp, RLOC_NOMSG, {
        ...rawEnv,
        state,
        newsym: redraw,
    });

    // mhitu.c redraws only the hero's former stomach square after mnexto().
    // The relocation core has already painted the monster's old and new
    // squares; repeating the destination paint changes the TTY trace.
    if (!rawEnv.planning) {
        redraw(state.u.ux, state.u.uy);
    }
    // mhitu.c:302-304. um_dist() is Chebyshev distance, and the message is
    // emitted only when mnexto() had to leave the monster beyond a neighboring
    // square (for example through a controlled relocation seam).
    if (!rawEnv.planning
        && distmin(mtmp.mx, mtmp.my, state.u.ux, state.u.uy) > 1) {
        await (rawEnv.message ?? ttyPline)(
            'Brrooaa...  You land hard at some distance.', state,
        );
    }
    // Keep the planning clone's display seam attached through the terrain
    // transition.  switch_terrain() is reached through spoteffects(), and a
    // missing environment here would let a clone write live TTY output.
    await spoteffects(true, state, rawEnv);
}

// C ref: mhitu.c diseasemu() (1033-1044). This shared infection effect is
// called by the active Pestilence and engulfing AD_DISE arms. Keep illness
// duration on the SICK timeout owner, and pass the caller's clone/message/RNG
// environment through make_sick() and its possible encumber_msg().
export async function diseasemu(mdat, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const message = rawEnv.message ?? ttyPline;
    const random = { rn1, rn2, ...(rawEnv.random ?? {}) };

    if (heroSickResistance(state)) {
        await message('You feel a slight illness.', state, rawEnv);
        return false;
    }

    // C's Sick macro is the whole packed intrinsic, not only its timeout
    // field; make_sick() clamps the resulting duration through itimeout().
    const sick = state.u?.uprops?.[SICK]?.intrinsic ?? 0;
    const duration = sick
        ? Math.trunc(sick / 3) + 1
        : random.rn1(acurr(state, A_CON), 20);
    const encumberMessage = rawEnv.encumberMessage
        ?? ((subject) => encumber_msg(subject, { message }));
    await make_sick(
        duration,
        mdat.pmnames[NEUTRAL],
        true,
        SICK_NONVOMITABLE,
        state,
        { ...rawEnv, message, random, encumberMessage },
    );
    return true;
}

// C ref: mhitu.c gulpmu() (1287-1577). The source-owned swallow transition,
// damage switch and expulsion decision stay together here; discarded void
// callees which remain unported are named at their source call sites.
async function gulpmu(mtmp, mattk, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const u = state.u;
    const random = rawEnv.random ?? { d, rn1, rn2, rnd };
    if (typeof random.d !== 'function' || typeof random.rn2 !== 'function'
        || typeof random.rnd !== 'function') {
        throw new TypeError('gulpmu requires d, rn2 and rnd random sources');
    }
    const message = rawEnv.message ?? ttyPline;
    const urgentMessage = rawEnv.urgentMessage ?? ttyUrgentPline;
    const redraw = rawEnv.redraw ?? newsym;
    const statusRefresh = rawEnv.statusRefresh ?? (() => bot(state));
    const prop = (index) => u.uprops?.[index] ?? {};
    const slowDigestion = Boolean(
        prop(SLOW_DIGESTION).intrinsic || prop(SLOW_DIGESTION).extrinsic,
    );
    const halfPhysicalDamage = Boolean(
        prop(HALF_PHDAM).intrinsic || prop(HALF_PHDAM).extrinsic,
    );
    const magicalBreathing = Boolean(
        prop(MAGICAL_BREATHING).intrinsic
            || prop(MAGICAL_BREATHING).extrinsic,
    );
    const hallucinating = Boolean(
        prop(HALLUC).intrinsic || prop(HALLUC).extrinsic,
    );
    const acidResistant = Boolean(
        prop(ACID_RES).intrinsic || prop(ACID_RES).extrinsic,
    );
    const shockResistant = Boolean(
        prop(SHOCK_RES).intrinsic || prop(SHOCK_RES).extrinsic,
    );
    const coldResistant = Cold_resistance(state);
    const fireResistant = Fire_resistance(state);
    const isBlinded = () => {
        const blinded = prop(BLINDED);
        return Boolean(blinded.intrinsic && !blinded.blocked);
    };
    const encumberMessage = rawEnv.encumberMessage
        ?? ((subject) => encumber_msg(subject, {
            ...rawEnv, state, message,
        }));
    const exerciseStrength = async () => exercise(
        A_STR,
        false,
        state,
        random,
        { encumberMessage },
    );

    // C initializes t_at() before rolling damage.
    const trap = t_at(u.ux, u.uy, state);
    let tmp = random.d(mattk.damn, mattk.damd);
    let timTmp;
    let physicalDamage = false;

    if (!u.uswallow) {
        const omx = mtmp.mx;
        const omy = mtmp.my;

        if (!engulf_target(mtmp, state.youmonst, state))
            return M_ATTK_MISS;
        if (trap && is_pit(trap.ttyp)
            && sobj_at(BOULDER, u.ux, u.uy, state)) {
            return M_ATTK_MISS;
        }
        if (await failed_grab(mtmp, state.youmonst, mattk, rawEnv))
            return M_ATTK_MISS;

        if (Punished(state)) {
            unplacebc(state);
        }

        // C evaluates Monnam() for the urgent engulfing line before it shuts
        // down vision.  A monster which moved onto the hero's square is
        // visible to C at this point, while the JS sight grid deliberately
        // omits that occupied square.  Supply the source's visibility fact
        // for this pre-swallow name lookup; retaining it before placement
        // also preserves C's display-RNG evaluation point.
        remove_monster(omx, omy, state);
        mtmp.mtrapped = false;
        place_monster(mtmp, u.ux, u.uy, state);
        set_ustuck(mtmp, state);
        if (!rawEnv.planning) redraw(mtmp.mx, mtmp.my);

        if (u.usteed) {
            const steedName = mon_nam(u.usteed, state, rawEnv);
            const engulferName = Some_Monnam(mtmp, state, rawEnv);
            const motion = is_animal(mtmp.data) ? 'lunges'
                : is_whirly(mtmp.data) ? 'whirls'
                    : unsolid(mtmp.data) ? 'flows'
                        : amorphous(mtmp.data) ? 'oozes' : 'surges';
            await urgentMessage(
                `${engulferName} ${motion} forward and plucks you off ${steedName}!`,
                state,
                rawEnv,
            );
            // steed.c dismount_steed() is still partial for DISMOUNT_ENGULFED;
            // C discards its void result, so preserve the named boundary.
            note_unported('steed.c dismount_steed');
        } else if (rawEnv.planning) {
            // Planning suppresses only the display operation. Source state
            // transitions and game-RNG draws below still run on the clone.
        } else {
            const engulferName = capitalizedMonsterName(mtmp, state, {
                ...rawEnv,
                canSpotMonster: () => !mtmp.minvis && !mtmp.mundetected,
            });
            const verb = digests(mtmp.data) ? 'swallows you whole'
                : enfolds(mtmp.data) ? 'folds itself around you' : 'engulfs you';
            await urgentMessage(`${engulferName} ${verb}!`, state, rawEnv);
        }
        await stop_occupation(state, {
            message,
            statusRefresh,
        });
        reset_occupations(state);

        if (u.utrap) {
            await message(
                `You are released from the ${u.utraptype === TT_WEB ? 'web' : 'trap'}!`,
                state,
                rawEnv,
            );
            reset_utrap(false, state);
        }

        const leashed = number_leashed(state);
        if (leashed > 0) {
            const noun = leashed > 1 ? 'leashes' : 'leash';
            await message(`The ${noun} ${vtense(noun, 'snap')} loose.`, state, rawEnv);
            // apply.c unleash_all() is a discarded void call without a port.
            note_unported('apply.c unleash_all');
        }

        if (touch_petrifies(state.youmonst.data)
            && !Resists_Elem(mtmp, STONE_RES, state)) {
            // trap.c minstapetrify() has no result consumed here and remains
            // outside this task. Keep the source relocation around that gap.
            remove_monster(mtmp.mx, mtmp.my, state);
            place_monster(mtmp, omx, omy, state);
            note_unported('trap.c minstapetrify');
            if (Punished(state)) await placebc(state, rawEnv);
            set_ustuck(null, state);
            return mtmp.mhp > 0 ? M_ATTK_MISS : M_ATTK_AGR_DIED;
        }

        // display_nhwindow(WIN_MESSAGE, FALSE) waits for pending --More-- and
        // clears it before vision and the swallow timer are updated.
        if (!rawEnv.planning) {
            await displayPendingTtyMessageWindow(state);
        }
        vision_recalc(2, { state, redraw: rawEnv.planning ? () => {} : redraw });
        u.uswallow = 1;

        if (mattk.adtyp === M.AD_DGST) {
            timTmp = acurr(state, A_CON) + 10 - u.uac + random.rn2(20);
            if (timTmp < 0) timTmp = 0;
            timTmp = Math.trunc(timTmp / mtmp.m_lev) + 3;
        } else {
            timTmp = random.rnd(mtmp.m_lev + 10 / 2);
        }
        u.uswldtim = Math.max(2, timTmp);
        if (!rawEnv.planning) await swallowed(1, state);
        if (!flaming(mtmp.data)) {
            for (let object = state.invent; object;) {
                const next = object.nobj;
                // light.c snuff_lit() is void and its result is discarded.
                note_unported('light.c snuff_lit');
                object = next;
            }
        }
    }

    if (mtmp !== u.ustuck) return M_ATTK_MISS;
    if (Punished(state)) {
        if (state.uchain?.where === OBJ_FREE) {
            state.uchain.ox = mtmp.mx;
            state.uchain.oy = mtmp.my;
        }
        if (state.uball?.where === OBJ_FREE) {
            state.uball.ox = mtmp.mx;
            state.uball.oy = mtmp.my;
        }
    }
    if (u.uswldtim > 0) u.uswldtim -= 1;

    switch (mattk.adtyp) {
    case M.AD_DGST:
        physicalDamage = true;
        if (slowDigestion) {
            u.uswldtim = 0;
            tmp = 0;
        } else if (u.uswldtim === 0) {
            await message(`${Monnam(mtmp, state, rawEnv)} totally digests you!`, state, rawEnv);
            tmp = u.uhp;
            if (halfPhysicalDamage) tmp *= 2;
        } else {
            const adverb = u.uswldtim === 2 ? ' thoroughly'
                : u.uswldtim === 1 ? ' utterly' : '';
            await message(`${Monnam(mtmp, state, rawEnv)}${adverb} digests you!`, state, rawEnv);
            await exerciseStrength();
        }
        break;
    case M.AD_PHYS:
        physicalDamage = true;
        if (mtmp.data.pmidx === M.PM_FOG_CLOUD) {
            const heroFlaming = flaming(state.youmonst.data);
            const isBreathless = magicalBreathing || breathless(state.youmonst.data);
            const isAmphibious = magicalBreathing || amphibious(state.youmonst.data);
            const ending = heroFlaming ? 'are smoldering out!'
                : isBreathless ? 'find it mildly uncomfortable.'
                    : isAmphibious ? 'feel comforted.' : 'can barely breathe!';
            await message(`You are laden with moisture and ${ending}`, state, rawEnv);
            if ((isAmphibious || isBreathless) && !heroFlaming) tmp = 0;
        } else {
            await message(
                `You are ${enfolds(mtmp.data) ? 'being squashed' : 'pummeled with debris'}!`,
                state,
                rawEnv,
            );
            await exerciseStrength();
        }
        break;
    case M.AD_ACID:
        if (acidResistant) {
            await message('You are covered with a seemingly harmless goo.', state, rawEnv);
            monstseesu(M_SEEN_ACID, state);
            tmp = 0;
        } else {
            await message(
                hallucinating ? "Ouch!  You've been slimed!"
                    : 'You are covered in slime!  It burns!',
                state,
                rawEnv,
            );
            await exerciseStrength();
            monstunseesu(M_SEEN_ACID, state);
        }
        break;
    case M.AD_BLND:
        if (can_blnd(mtmp, state.youmonst, mattk.aatyp, null, state)) {
            if (!heroIsBlind(state)) {
                const wasBlinded = isBlinded();
                if (!heroIsBlind(state))
                    await message("You can't see in here!", state, rawEnv);
                await make_blinded(tmp, false, state, rawEnv);
                if (!wasBlinded && !heroIsBlind(state))
                    await message('Your vision clears.', state, rawEnv);
            } else {
                incr_itimeout(prop(BLINDED), 1);
            }
        }
        tmp = 0;
        break;
    case M.AD_COLD:
        if (!mtmp.mcan && random.rn2(2)) {
            if (coldResistant) {
                await shieldeff(u.ux, u.uy, state);
                await message('You feel mildly chilly.', state, rawEnv);
                monstseesu(M_SEEN_COLD, state);
                await ugolemeffects(M.AD_COLD, tmp, state, rawEnv);
                tmp = 0;
            } else {
                await message('You are freezing to death!', state);
                monstunseesu(M_SEEN_COLD, state);
            }
        } else {
            tmp = 0;
        }
        break;
    case M.AD_ELEC:
        if (!mtmp.mcan && random.rn2(2)) {
            await message('The air around you crackles with electricity.', state, rawEnv);
            if (shockResistant) {
                await shieldeff(u.ux, u.uy, state);
                await message('You seem unhurt.', state, rawEnv);
                monstseesu(M_SEEN_ELEC, state);
                await ugolemeffects(M.AD_ELEC, tmp, state, rawEnv);
                tmp = 0;
            } else {
                monstunseesu(M_SEEN_ELEC, state);
            }
        } else {
            tmp = 0;
        }
        break;
    case M.AD_FIRE:
        if (!mtmp.mcan && random.rn2(2)) {
            if (fireResistant) {
                await shieldeff(u.ux, u.uy, state);
                await message('You feel mildly hot.', state, rawEnv);
                monstseesu(M_SEEN_FIRE, state);
                await ugolemeffects(M.AD_FIRE, tmp, state, rawEnv);
                tmp = 0;
            } else {
                await message('You are burning to a crisp!', state, rawEnv);
                monstunseesu(M_SEEN_FIRE, state);
            }
            await burn_away_slime(state, rawEnv);
        } else {
            tmp = 0;
        }
        break;
    case M.AD_DISE:
        if (!await diseasemu(mtmp.data, {
            ...rawEnv, state, random, message,
        })) {
            tmp = 0;
        }
        break;
    case M.AD_DREN:
        if (!mtmp.mcan && random.rn2(4)) {
            await drain_en(tmp, false, state, rawEnv);
        }
        tmp = 0;
        break;
    default:
        physicalDamage = true;
        tmp = 0;
        break;
    }

    if (physicalDamage) {
        if (u.uac < 0) tmp -= random.rnd(-u.uac);
        if (tmp < 0) tmp = 1;
        if (halfPhysicalDamage) tmp = Math.trunc((tmp + 1) / 2);
    }

    state.gm ??= {};
    state.gm.mswallower = mtmp;
    await mdamageu(mtmp, tmp, state, rawEnv);
    state.gm.mswallower = null;
    if (tmp) await stop_occupation(state, {
        message,
        statusRefresh: rawEnv.statusRefresh,
    });

    if (!u.uswallow) {
        // Life saving already expelled the swallowed hero.
    } else if (touch_petrifies(state.youmonst.data)
        && !Resists_Elem(mtmp, STONE_RES, state)) {
        const verb = digests(mtmp.data) ? 'regurgitates'
            : enfolds(mtmp.data) ? 'releases' : 'expels';
        await message(`${Monnam(mtmp, state, rawEnv)} very hurriedly ${verb} you!`, state, rawEnv);
        await expels(mtmp, {
            ...rawEnv,
            state,
            message,
        });
    } else if (!u.uswldtim
        || state.youmonst.data.msize >= M.MZ_HUGE) {
        const verb = digests(mtmp.data) ? 'regurgitated'
            : enfolds(mtmp.data) ? 'released' : 'expelled';
        await message(`You get ${verb}!`, state, rawEnv);
        if (state.flags?.verbose !== false && digests(mtmp.data) && slowDigestion)
            await message(`Obviously ${mon_nam(mtmp, state, rawEnv)} doesn't like your taste.`, state, rawEnv);
        await expels(mtmp, { ...rawEnv, state, message });
    }
    return M_ATTK_HIT;
}

// C ref: mhitu.c magic_negation() (1088-1137). "armor that sufficiently covers
// the body might be able to block magic"; the answer is the magic-cancellation
// factor, 0 through 3.
//
// C's two callers pass either the hero or a monster. The inventory traversal
// and protection test are the same in both cases; the hero's property and the
// high priest's innate protection are the two source-specific initial values.
export function magic_negation(mon, state = game) {
    const { u } = state;
    const objects = getObjects(state);
    const isYou = mon === state.youmonst;
    let mc = 0;
    let via_amul = false;
    let gotprot = isYou
        ? Boolean(u.uprops?.[PROTECTION]?.extrinsic)
        : mon.data === state.mons[M.PM_HIGH_CLERIC];
    const inventory = isYou ? state.invent : mon.minvent;

    for (let o = inventory; o; o = o.nobj) {
        const wornmask = o.owornmask ?? 0;
        /* a_can field is only applicable for armor (which must be worn) */
        if ((wornmask & W_ARMOR) !== 0) {
            const armpro = objects[o.otyp]?.a_can ?? 0;
            if (armpro > mc) mc = armpro;
        } else if ((wornmask & W_AMUL) !== 0) {
            // C assigns rather than accumulates, so a second worn amulet would
            // overwrite the first. Only one amulet slot exists, so the two
            // spellings cannot differ; ported as written.
            via_amul = (o.otyp === AMULET_OF_GUARDING);
        }
        /* A hero's Protection property and a high priest's innate protection
           skip the item-level artifact/property checks, as in C. */
        if (isYou || gotprot) continue;

        // W_SWAPWEP and W_QUIVER are intentionally excluded. W_ART and W_ARTI
        // are handled by protects() when the item is worn or carried.
        let wearMask = W_ARMOR | W_ACCESSORY;
        if (o.oclass === WEAPON_CLASS || is_weptool(o, state))
            wearMask |= W_WEP;
        if (protects(o, Boolean(wornmask & wearMask), state))
            gotprot = true;
    }

    if (gotprot) {
        /* extrinsic Protection increases mc by 1 (2 for amulet of guarding);
           multiple sources don't provide multiple increments */
        mc += via_amul ? 2 : 1;
        if (mc > 3)
            mc = 3;
    } else if (mc < 1) {
        /* intrinsic Protection is weaker (play balance; obtaining divine
           protection is too easy); it confers minimum mc 1 instead of 0 */
        if ((isYou && ((u.uprops?.[PROTECTION]?.intrinsic
                        && u.ublessed > 0) || u.uspellprot))
            /* aligned priests and angels have innate intrinsic Protection */
            // Indexed without a guard on purpose: an absent catalog would make
            // two undefineds compare equal and answer 1 where C answers 0.
            || mon.data === state.mons[M.PM_ALIGNED_CLERIC]
            || is_minion(mon.data))
            mc = 1;
    }
    return mc;
}

// youprop.h:339-341 Half_physical_damage, spelled out here because each C
// file's port expands its own macros; js/trap_effects.js:158 expands the same
// one. It is the intrinsic or the extrinsic, with no blocking term.
function Half_physical_damage(state) {
    const halved = state.u?.uprops?.[HALF_PHDAM];
    return Boolean(halved?.intrinsic || halved?.extrinsic);
}

// C ref: mhitu.c hitmu() (1143-1267). "monster hits you; returns MM_ flags".
//
// Every reachable surviving exit answers M_ATTK_HIT. Lethal planning damage
// raises MonsterDeathPlanningError before live rehumanize() or done_in_by().
// A completed live end-game boundary unwinds the monster pass.
//
// Ported: the base damage roll, mhitm_adtyping(), mhitm_knockback(), the
// negative-armor-class reduction, mdamageu() and passiveum().
//
// Ported: the marker for an unspottable attacker in hitmu() and missmu(), the
// hidden-under-object reveal, and the permanent hit-point accounting. The
// latter is reached by uhitm.c mhitm_ad_deth(); this reader preserves C's
// update and display order for the helper's permdmg field.
//
// mhitm_ad_phys() reads mhm.specialdmg only in C's hero-attacker arm at
// uhitm.c:3992 and :3995. hitmu() initializes it to zero because a monster's
// blow against the hero never enters that arm.
async function hitmu(mtmp, mattk, env) {
    const state = env.state;
    const random = env.random;
    const markInvisible = requireMattackuOperation(env, 'markInvisible');
    const spotMonster = env.canSpotMonster ?? canspotmon;
    const mdat = mtmp.data;
    const olduasmon = state.youmonst.data;
    let res;
    const mhm = {
        damage: 0,
        hitflags: M_ATTK_MISS,
        permdmg: 0,
        specialdmg: 0,
        done: false,
    };

    // C ref: mhitu.c:1155-1156. When the hero cannot spot the attacker (blind
    // with no telepathy, attacker invisible, etc.), mark the square as
    // containing an invisible monster. The damage computation below is the
    // same regardless.
    if (!spotMonster(mtmp, state))
        markInvisible(mtmp.mx, mtmp.my);

    /*  If the monster is undetected & hits you, you should know where
     *  the attack came from.
     */
    if (mtmp.mundetected && (hides_under(mdat) || mdat.mlet === M.S_EEL)) {
        mtmp.mundetected = 0;
        if (!tp_sensemon(mtmp, state)
            && !activeHeroProperty(state, DETECT_MONSTERS)) {
            const obj = state.level?.objects?.[mtmp.mx]?.[mtmp.my] ?? null;
            if (obj) {
                let what;
                if (heroIsBlind(state) && !obj.dknown)
                    what = 'something';
                else if (is_pool(mtmp.mx, mtmp.my, state)
                    && !state.u.uinwater)
                    what = 'the water';
                else
                    what = donameFresh(obj, state);

                let name = Amonnam(mtmp, { ...env, state });
                // C substitutes Something when Amonnam() cannot identify an
                // unseen attacker, preserving sentence capitalization.
                if (name === 'It') name = 'Something';
                await env.message(`${name} was hidden under ${what}!`, state);
            }
            // C repaints even when there is no object beneath the attacker.
            env.redraw(mtmp.mx, mtmp.my);
        }
    }

    /*  First determine the base damage done */
    mhm.damage = random.d(mattk.damn, mattk.damd);
    if ((is_undead(mdat) || is_vampshifter(mtmp)) && midnight(state))
        mhm.damage += random.d(mattk.damn, mattk.damd); /* extra dmg */

    await mhitm_adtyping(mtmp, mattk, state.youmonst, mhm, state, env);

    // C's accepted done() path does not return. JavaScript returns after the
    // final display so the recorder can capture it; stop before knockback or
    // a second death check, while allowing lifesaving to continue normally.
    if (state.program_state?.gameover)
        return;

    const knockFlags = { value: mhm.hitflags };
    await mhitm_knockback(mtmp, state.youmonst,
        mattk, knockFlags, Boolean(mtmp.mw) /* MON_WEP */, state, env, random);
    mhm.hitflags = knockFlags.value;

    if (mhm.done)
        return mhm.hitflags;

    if ((Upolyd(state.u) ? state.u.mh : state.u.uhp) < 1) {
        /* already dead? call rehumanize() or done_in_by() as appropriate */
        await mdamageu(mtmp, 1, state, env);
        // C's done_in_by() is NORETURN on the ordinary death path. The JS
        // end-game display returns after setting gameover so replay can
        // capture its final window; do not resume hitmu() in that case.
        if (state.program_state?.gameover)
            return;
        mhm.damage = 0;
    }

    /*  Negative armor class reduces damage done instead of fully protecting
     *  against hits.
     */
    if (mhm.damage && state.u.uac < 0) {
        mhm.damage -= random.rnd(-state.u.uac);
        if (mhm.damage < 1)
            mhm.damage = 1;
    }

    if (mhm.damage > 0) {
        /* [Half_physical_damage isn't applied to mhm.permdmg] */
        if (Half_physical_damage(state)
            /* Mitre of Holiness, even if not currently blessed */
            || (state.urole?.mnum === M.PM_CLERIC && state.uarmh
                && is_quest_artifact(state.uarmh, state)
                && mon_hates_blessings(mtmp)))
            mhm.damage = Math.trunc((mhm.damage + 1) / 2);

        if (mhm.permdmg) {
            /* Death's life force drain: half-physical damage does not reduce
             * this permanent component. Keep the random draw and thresholds
             * in the C order. */
            mhm.permdmg = random.rn2(Math.trunc(mhm.damage / 2) + 1);
            if (Upolyd(state.u)
                || state.u.uhpmax > 25 * state.u.ulevel)
                mhm.permdmg = mhm.damage;
            else if (state.u.uhpmax > 10 * state.u.ulevel)
                mhm.permdmg += Math.trunc(mhm.damage / 2);
            else if (state.u.uhpmax > 5 * state.u.ulevel)
                mhm.permdmg += Math.trunc(mhm.damage / 4);

            let lowerlimit;
            if (Upolyd(state.u)) {
                lowerlimit = Math.min(
                    state.youmonst.data.mlevel, state.u.ulevel,
                );
            } else {
                lowerlimit = minuhpmax(1, state);
            }
            const hpmax = Upolyd(state.u) ? state.u.mhmax : state.u.uhpmax;
            const reduced = hpmax - mhm.permdmg;
            if (reduced > lowerlimit) {
                if (Upolyd(state.u)) state.u.mhmax = reduced;
                else state.u.uhpmax = reduced;
            } else if (hpmax > lowerlimit) {
                if (Upolyd(state.u)) state.u.mhmax = lowerlimit;
                else state.u.uhpmax = lowerlimit;
            }
            state.disp ??= {};
            state.disp.botl = true;
        }

        await mdamageu(mtmp, mhm.damage, state, env);
        // A completed really_done() must not continue into passiveum() or the
        // attack-loop cleanup that follows this C NORETURN call.
        if (state.program_state?.gameover)
            return;
    }

    if (mhm.damage)
        res = await passiveum(olduasmon, mtmp, mattk, state, env);
    else
        res = M_ATTK_HIT;
    await mattackuStopOccupation(env);
    return res;
}

// C ref: mhitu.c explmu() (1591-1665). Resolve a monster's explosive hit
// before waking nearby monsters; the hero-targeted AD_HALU arm removes the
// attacker before changing the hero's hallucination property.
export async function explmu(mtmp, mattk, ufound, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random;
    if (typeof random?.d !== 'function'
        || typeof random?.rnd !== 'function') {
        throw new TypeError('explmu requires d and rnd random operations');
    }
    const message = requireMattackuOperation(rawEnv, 'message');
    let killAgr = true;
    let notAffected;

    if (mtmp.mcan) return M_ATTK_MISS;

    let tmp = random.d(mattk.damn, mattk.damd);
    notAffected = defended(mtmp, mattk.adtyp, state);

    if (!ufound) {
        const name = canseemon(mtmp, state)
            ? Monnam(mtmp, state, rawEnv) : 'It';
        const medium = is_waterwall(mtmp.mux, mtmp.muy, state)
            ? 'empty water' : 'thin air';
        await message(`${name} explodes at a spot in ${medium}!`, state);
    } else {
        await hitmsg(mtmp, mattk, state, rawEnv);
    }

    switch (mattk.adtyp) {
    case M.AD_COLD:
    case M.AD_FIRE:
    case M.AD_ELEC:
        // C's second damage roll, attacker removal and blast belong to
        // mon_explodes(). Only the live pass may enter terminal death input.
        await mon_explodes(mtmp, mattk, state, {
            ...rawEnv,
            ...(rawEnv.planning ? {
                planningDeath: (how = DIED) =>
                    new MonsterDeathPlanningError(mtmp, how),
            } : {}),
        });
        if (state.program_state?.gameover) return M_ATTK_AGR_DIED;
        if (mtmp.mhp > 0) killAgr = false;
        break;
    case M.AD_BLND:
        notAffected = resists_blnd(state.youmonst, state);
        if (ufound && !notAffected) {
            // C places the division inside the right side of ||. A visible
            // monster skips both that mutation and its random draw.
            if (mon_visible(mtmp, state)
                || random.rnd(tmp = Math.trunc(tmp / 2)) > state.u.ulevel) {
                await message('You are blinded by a blast of light!', state);
                await make_blinded(tmp, false, state, rawEnv);
                if (!heroIsBlind(state))
                    await message('Your vision clears.', state);
            } else if (state.flags?.verbose) {
                await message(
                    'You get the impression it was not terribly bright.',
                    state,
                );
            }
        }
        break;
    case M.AD_HALU: {
        const hallucination = state.u?.uprops?.[HALLUC];
        const hallucinationResistance = state.u?.uprops?.[HALLUC_RES];
        const alreadyHallucinating = Boolean(hallucination?.intrinsic
            && !(hallucinationResistance?.intrinsic
                || hallucinationResistance?.extrinsic));
        notAffected = Boolean(notAffected || heroIsBlind(state)
            || state.u.umonnum === M.PM_BLACK_LIGHT
            || state.u.umonnum === M.PM_VIOLET_FUNGUS
            || dmgtype(state.youmonst.data, M.AD_STUN));
        if (ufound && !notAffected) {
            if (!alreadyHallucinating)
                await message(
                    'You are caught in a blast of kaleidoscopic light!',
                    state,
                );
            // C removes the exploder before applying Hallucination, so its
            // own glyph cannot be randomized by the property transition.
            await mondead(mtmp, state, rawEnv);
            killAgr = false;
            const changed = await make_hallucinated(
                (hallucination?.intrinsic ?? 0) + tmp,
                false,
                0,
                state,
                rawEnv,
            );
            await message(
                `You ${changed ? 'are freaked out' : 'seem unaffected'}.`,
                state,
            );
        }
        break;
    }
    default:
        note_unported('pline.c impossible');
        break;
    }

    if (notAffected) {
        await message('You seem unaffected by it.', state);
        await ugolemeffects(mattk.adtyp, tmp, state, rawEnv);
    }
    if (killAgr && mtmp.mhp > 0)
        await mondead(mtmp, state, rawEnv);
    await wake_nearto(mtmp.mx, mtmp.my, 7 * 7, rawEnv);
    return mtmp.mhp > 0 ? M_ATTK_MISS : M_ATTK_AGR_DIED;
}

// C ref: mhitu.c:gazemu() (1668-1898). The ordinary compiled gaze effects
// share their source resistance, cancellation, visible-reaction and occupation
// order here. The #ifdef PM_BEHOLDER cases remain excluded just as upstream.
export async function gazemu(monster, attack, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { d, rn1, rn2, rnd };
    const message = rawEnv.message
        ?? (rawEnv.planning ? async () => {} : ttyPline);
    const urgentMessage = rawEnv.planning
        ? async () => {}
        : (rawEnv.urgentMessage ?? ttyUrgentPline);
    const env = {
        ...rawEnv,
        state,
        random,
        message,
        urgentMessage,
        canSpotMonster: rawEnv.canSpotMonster ?? canspotmon,
    };
    const draw = (name, ...args) => {
        if (typeof random[name] !== 'function')
            throw new TypeError(`mhitu.c gazemu requires random.${name}`);
        return random[name](...args);
    };
    const reactions = [
        'confused', 'stunned', 'puzzled', 'dazzled',
        'irritated', 'inflamed', 'tired', 'dulled',
    ];
    let react = -1;
    let already = false;
    const cancelledInitially = Boolean(monster.mcan);
    const mcanseeu = canseemon(monster, state)
        && couldsee(monster.mx, monster.my, state)
        && monster.mcansee;

    if ((monster.seen_resistance
        & cvt_adtyp_to_mseenres(attack.adtyp)) !== 0) {
        return M_ATTK_MISS;
    }

    const isMedusa = monster.data === state.mons?.[M.PM_MEDUSA];
    const reflecting = state.u?.uprops?.[REFLECTING];
    const reflectable = Boolean(reflecting?.intrinsic || reflecting?.extrinsic)
        && couldsee(monster.mx, monster.my, state)
        && isMedusa;
    const hallucination = () => {
        const property = state.u?.uprops?.[HALLUC];
        const resistance = state.u?.uprops?.[HALLUC_RES];
        return Boolean(property?.intrinsic)
            && !(resistance?.intrinsic || resistance?.extrinsic);
    };
    let cancelled = cancelledInitially;
    if ((hallucination() && draw('rn2', 4))
        || (heroUnaware(state) && !reflectable)) {
        cancelled = true;
    }

    switch (attack.adtyp) {
    case M.AD_STON:
        if (cancelled || !monster.mcansee) {
            if (!canseemon(monster, state)) break;
            if (heroUnaware(state)) {
                react = isMedusa ? 4 : 2;
                break;
            }
            if (isMedusa && hallucination() && !draw('rn2', 3)) {
                await message(
                    'Someone seems overdue for a serpent cut.', state, env,
                );
            } else {
                await message(
                    `${Monnam(monster, state, env)} gazes ineffectually.`,
                    state,
                    env,
                );
            }
            break;
        }
        if (reflectable) {
            const useeit = canseemon(monster, state);
            if (useeit) {
                await ureflects(
                    '%s gaze is reflected by your %s.',
                    monsterPossessive(monster, state, true, env),
                    state,
                    env,
                );
            }
            if (await mon_reflects(
                monster,
                !useeit
                    ? null
                    : 'The gaze is reflected away by %s %s!',
                state,
                env,
            )) {
                break;
            }
            if (!m_canseeu(monster, state)) {
                if (useeit) {
                    await message(
                        `${Monnam(monster, state, env)} doesn't seem to notice `
                            + `that ${mhis(monster, env)} gaze was reflected.`,
                        state,
                        env,
                    );
                }
                break;
            }
            if (useeit) {
                await message(
                    `${Monnam(monster, state, env)} is turned to stone!`,
                    state,
                    env,
                );
            }
            state.gs ??= {};
            state.gs.stoned = true;
            await killed(monster, state, env);
            if (monster.mhp > 0) break;
            return M_ATTK_AGR_DIED;
        }
        if (canseemon(monster, state)
            && couldsee(monster.mx, monster.my, state)
            && !Stone_resistance(state)
            && !heroUnaware(state)) {
            await message(
                `You meet ${monsterPossessive(monster, state)} gaze.`,
                state,
                env,
            );
            await mattackuStopOccupation(env);
            if (poly_when_stoned(state.youmonst.data, state)
                && await polymon(M.PM_STONE_GOLEM, state, env)) {
                break;
            }
            await urgentMessage('You turn to stone...', state, env);
            state.killer ??= {};
            state.killer.format = KILLED_BY;
            state.killer.name = pmname(monster.data, gender(monster));
            if (rawEnv.planning)
                throw new MonsterDeathPlanningError(monster, STONING);
            await done(STONING, state, { ...env, fromMonster: true });
        }
        break;

    case M.AD_CONF: {
        if (mcanseeu && !monster.mspec_used && draw('rn2', 5)) {
            if (cancelled) {
                react = 0;
                already = Boolean(monster.mconf);
            } else {
                const confusion = draw('d', 3, 4);
                monster.mspec_used = (monster.mspec_used ?? 0)
                    + confusion + draw('rn2', 6);
                const property = state.u?.uprops?.[CONFUSION];
                // include/youprop.h:84 defines Confusion as HConfusion only;
                // an extrinsic property does not suppress this source message.
                if (!property?.intrinsic) {
                    await message(
                        `${monsterPossessive(monster, state, true, env)} gaze `
                        + 'confuses you!',
                        state,
                        env,
                    );
                } else {
                    await message(
                        'You are getting more and more confused.', state, env,
                    );
                }
                await make_confused(
                    (state.u?.uprops?.[CONFUSION]?.intrinsic ?? 0)
                        + confusion,
                    false,
                    state,
                    env,
                );
                await mattackuStopOccupation(env);
            }
        }
        break;
    }

    case M.AD_STUN:
        if (mcanseeu && !monster.mspec_used && draw('rn2', 5)) {
            if (cancelled) {
                react = 1;
                already = Boolean(monster.mstun);
            } else {
                const stun = draw('d', 2, 6);
                monster.mspec_used = (monster.mspec_used ?? 0)
                    + stun + draw('rn2', 6);
                await message(
                    `${Monnam(monster, state, env)} stares piercingly at you!`,
                    state,
                    env,
                );
                const property = state.u?.uprops?.[STUNNED];
                await make_stunned(
                    ((property?.intrinsic ?? 0) & TIMEOUT) + stun,
                    true,
                    state,
                    env,
                );
                await mattackuStopOccupation(env);
            }
        }
        break;

    case M.AD_BLND:
        if (canseemon(monster, state)
            && !resists_blnd(state.youmonst, state)
            && mdistu(monster, state) <= BOLT_LIM * BOLT_LIM) {
            if (cancelled) {
                react = draw('rn1', 2, 2);
                already = !monster.mcansee;
                if (monster.mcan
                    && monster.data === state.mons?.[M.PM_ARCHON]
                    && draw('rn2', 5)) {
                    react = -1;
                }
            } else {
                const blinded = draw('d', attack.damn, attack.damd);
                await message(
                    `You are blinded by ${monsterPossessive(monster, state)}`
                    + ' radiance!',
                    state,
                    env,
                );
                await make_blinded(blinded, false, state, env);
                await mattackuStopOccupation(env);
                if (!heroIsBlind(state)) {
                    await message('Your vision clears.', state, env);
                } else {
                    const oldStun = (state.u?.uprops?.[STUNNED]?.intrinsic ?? 0)
                        & TIMEOUT;
                    await make_stunned(
                        Math.max(oldStun, draw('rnd', 3)), true, state, env,
                    );
                }
            }
        }
        break;

    case M.AD_FIRE:
        if (mcanseeu && !monster.mspec_used && draw('rn2', 5)) {
            if (cancelled) {
                react = draw('rn1', 2, 4);
            } else {
                const originalDamage = draw('d', 2, 6);
                let damage = originalDamage;
                const level = monster.m_lev;
                await message(
                    `${Monnam(monster, state, env)} attacks you`
                    + ' with a fiery gaze!',
                    state,
                    env,
                );
                await mattackuStopOccupation(env);
                if (Fire_resistance(state)) {
                    await shieldeff(state.u.ux, state.u.uy, state);
                    await message("The fire doesn't feel hot!", state, env);
                    monstseesu(M_SEEN_FIRE, state);
                    await ugolemeffects(M.AD_FIRE, draw('d', 12, 6), state);
                    damage = 0;
                } else {
                    monstunseesu(M_SEEN_FIRE, state);
                }
                await burn_away_slime(state, env);
                if (level > draw('rn2', 20))
                    await burnarmor(state.youmonst, { ...env, random });
                if (level > draw('rn2', 20)) {
                    await destroy_items(
                        state.youmonst, M.AD_FIRE, originalDamage,
                        { ...env, random },
                    );
                    await ignite_items(state.invent, { ...env, random });
                }
                if (damage)
                    await mdamageu(monster, damage, state, env);
            }
        }
        break;

    default:
        // mhitu.c discards impossible()'s result; it is diagnostic-only.
        note_unported('pline.c impossible');
        break;
    }

    if (react >= 0) {
        if (hallucination() && draw('rn2', 3))
            react = draw('rn2', reactions.length);
        const adjective = !draw('rn2', 3)
            ? ''
            : already ? 'quite '
                : (!draw('rn2', 2) ? 'a bit ' : 'somewhat ');
        await message(
            `${Monnam(monster, state, env)} looks ${adjective}`
                + `${reactions[react]}.`,
            state,
            env,
        );
    }
    return M_ATTK_MISS;
}

// C ref: mhitu.c mdamageu() (1902-1927). "mtmp hits you for n points damage".
// The two hit-point pools are separate C fields: Upolyd selects u.mh/mhmax and
// rehumanize(), while an ordinary hero uses u.uhp/uhpmax and done_in_by().
// showdamage() runs before the matching cap, exactly as in C.
export async function mdamageu(mtmp, n, state, env = {}) {
    const message = env.message ?? (env.planning ? async () => {} : ttyPline);

    if (n < 0) {
        // C discards the diagnostic's result and continues with zero damage.
        note_unported('pline.c impossible');
        n = 0;
    }

    state.disp ??= {};
    state.disp.botl = true;
    if (Upolyd(state.u)) {
        state.u.mh -= n;
        await showdamage(n, state, { message });
        /* caller might have reduced mhmax before calling mdamageu() */
        if (state.u.mh > state.u.mhmax)
            state.u.mh = state.u.mhmax;
        if (state.u.mh < 1) {
            // rehumanize() owns the live polyself.c transition. A planning
            // clone cannot run it: polyman/newsym and a possible done() would
            // write the live terminal or consume input. Hand the exact C
            // lethal boundary back to the live replay instead.
            if (env.planning)
                throw new MonsterDeathPlanningError(mtmp);
            await rehumanize(state, env);
        }
        return;
    }

    state.u.uhp -= n;
    await showdamage(n, state, { message });
    /* caller might have reduced uhpmax before calling mdamageu() */
    if (state.u.uhp > state.u.uhpmax)
        state.u.uhp = state.u.uhpmax;
    if (state.u.uhp < 1) {
        // C ref: mhitu.c:1924-1925. done_in_by() prints "You die...", builds
        // the killer string, and calls done(). The planning clone cannot run
        // that input-bearing NORETURN path, so it stops at this boundary.
        if (env.planning) {
            throw new MonsterDeathPlanningError(mtmp);
        } else {
            await done_in_by(mtmp, DIED, state);
        }
    }
}

// C ref: mhitu.c ranged_attk_available() (2412-2426). "returns TRUE if monster
// has a range attack in its repertoire that it will actually utilize"; the
// monster declines one whose damage type it has already watched the hero
// resist, which is what m_seenres() records.
//
// The draw is real and belongs to the caller's turn: for an AT_BREA slot whose
// damage type is AD_RBRE, get_atkdam_type() rolls the breath before the
// resistance test, and one loop pass can spend that draw and still move on to
// the next slot. That is why this is not a pure predicate and why
// monmove.c dochug() must reach it in C's order.
//
// C's `(typ = get_atkdam_type(...)) >= 0` guard is left out. `struct attack`
// declares adtyp a uchar (permonst.h:42) and get_atkdam_type() answers either
// that field or a member of rnd_breath_typ[], so no attack entry can drive it
// below zero. `typ` itself, C's -1 initializer included, exists only to carry
// the value between the two calls.
//
// C loops `for (i = 0; i < NATTK; i++)` over an array of NATTK slots
// (permonst.h:48) whose unused members hold aatyp AT_NONE, which
// DISTANCE_ATTK_TYPE() rejects; walking the mattk array itself reaches the
// same slots in the same order.
export function ranged_attk_available(mtmp, rawEnv = {}) {
    const random = rawEnv.random ?? { rn2 };
    const ptr = mtmp.data;

    return Boolean(ptr?.mattk?.some((mattk) => {
        if (!DISTANCE_ATTK_TYPE(mattk.aatyp)) return false;
        const typ = get_atkdam_type(mattk.adtyp, random);
        /* m_seenres() */
        return (mtmp.seen_resistance & cvt_adtyp_to_mseenres(typ)) === 0;
    }));
}

// C ref: mhitu.c passiveum() (2434-2615). The hero's own passive
// counter-attack against the monster that just hit.  The helper below is
// kept beside it because C's assess_dmg() return value decides whether the
// monster attack loop continues.
//
// An unpolymorphed hero costs nothing here. olduasmon is the role's permonst,
// whose mattk[1] is NO_ATTK: aatyp AT_NONE ends the search, damn and damd are
// both zero so tmp is zero and no die is rolled, and adtyp AD_PHYS takes the
// switch's default arm. The absence of any passiveum() site in seed0004's
// step-91 and step-92 random-number log is that path, observed.
//
// `mattk` is the blow that landed. C reads it in the AD_STON arm's
// attk_protection(mattk->aatyp), which decides whether the attacker's gloves
// saved it from a cockatrice.
//
// The source calls whose results are discarded but whose full owners
// are outside this span remain named at their call sites: erode_armor,
// acid_damage, drain_item, and shieldeff. Their surrounding source branches
// still consume the conditional draws before recording the discarded call.
async function assess_dmg(mtmp, tmp, state, env) {
    const message = env.message
        ?? (env.planning ? async () => {} : ttyPline);
    mtmp.mhp -= tmp;
    if (mtmp.mhp <= 0) {
        await message(
            messageAt(`${Monnam(mtmp, state, env)} dies!`,
                mtmp.mx, mtmp.my, state),
            state,
            env,
        );
        // xkilled()'s result is discarded by C; a life-saving owner may
        // restore the monster, which is why the post-call hp test is needed.
        await xkilled(mtmp, XKILL_NOMSG, state, env);
        if (mtmp.mhp >= 1) return M_ATTK_HIT;
        return M_ATTK_AGR_DIED;
    }
    return M_ATTK_HIT;
}

async function passiveum(olduasmon, mtmp, mattk, state, env) {
    const random = env.random ?? { d, rn2 };
    const message = env.message
        ?? (env.planning ? async () => {} : ttyPline);
    let i;
    let oldu_mattk = null;

    /*
     * mattk      == mtmp's attack that hit you;
     * oldu_mattk == your passive counterattack (even if mtmp's attack
     *               has already caused you to revert to normal form).
     */
    for (i = 0; !oldu_mattk; i++) {
        if (i >= NATTK)
            return M_ATTK_HIT;
        if (olduasmon.mattk[i].aatyp === M.AT_NONE
            || olduasmon.mattk[i].aatyp === M.AT_BOOM)
            oldu_mattk = olduasmon.mattk[i];
    }
    let tmp = 0;
    if (oldu_mattk.damn)
        tmp = random.d(oldu_mattk.damn, oldu_mattk.damd);
    else if (oldu_mattk.damd)
        tmp = random.d(olduasmon.mlevel + 1, oldu_mattk.damd);

    /* These affect the enemy even if you were "killed" (rehumanized) */
    switch (oldu_mattk.adtyp) {
    case M.AD_ACID: /* acid blob */
        if (!random.rn2(2)) {
            await message(
                messageAt(
                    `${Monnam(mtmp, state, env)} is splashed by `
                    + `${Upolyd(state.u) ? 'your ' : ''}${hliquid('acid', {
                        ...env,
                        state,
                    })}!`,
                    mtmp.mx,
                    mtmp.my,
                    state,
                ),
                state,
                env,
            );
            if (Resists_Elem(mtmp, ACID_RES, state)) {
                await message(
                    messageAt(`${Monnam(mtmp, state, env)} is not affected.`,
                        mtmp.mx, mtmp.my, state),
                    state,
                    env,
                );
                tmp = 0;
            }
        } else {
            tmp = 0;
        }
        if (!random.rn2(30)) note_unported('uhitm.c erode_armor');
        if (!random.rn2(6)) note_unported('trap.c acid_damage');
        return assess_dmg(mtmp, tmp, state, env);
    case M.AD_STON: /* cockatrice */
    {
        const protector = attk_protection(mattk.aatyp);
        let wornitems = mtmp.misc_worn_check ?? 0;
        // MON_WEP(mtmp) supplies glove protection for a wielded weapon.
        if (mtmp.mw) wornitems |= W_ARMG;
        if (!Resists_Elem(mtmp, STONE_RES, state)
            && (protector === 0
                || (protector !== ~0
                    && (wornitems & protector) !== protector))) {
            if (poly_when_stoned(mtmp.data, state)) {
                await mon_to_stone(mtmp, state, env);
                return M_ATTK_HIT;
            }
            await message(
                messageAt(`${Monnam(mtmp, state, env)} turns to stone!`,
                    mtmp.mx, mtmp.my, state),
                state,
                env,
            );
            state.gs ??= {};
            state.gs.stoned = 1;
            await xkilled(mtmp, XKILL_NOMSG, state, env);
            if (mtmp.mhp >= 1) return M_ATTK_HIT;
            return M_ATTK_AGR_DIED;
        }
        return M_ATTK_HIT;
    }
    case M.AD_ENCH: /* KMH -- remove enchantment (disenchanter) */
        if (env.mon_currwep)
            drain_item(env.mon_currwep, true, state, env);
        return M_ATTK_HIT;
    default:
        break;
    }
    if (!Upolyd(state.u))
        return M_ATTK_HIT;

    /* These affect the enemy only if you are still a monster */
    if (random.rn2(3)) {
        switch (oldu_mattk.adtyp) {
        case M.AD_PHYS:
            if (oldu_mattk.aatyp === M.AT_BOOM) {
                await message('You explode!', state, env);
                await rehumanize(state, env);
                return assess_dmg(mtmp, tmp, state, env);
            }
            break;
        case M.AD_PLYS: /* Floating eye */
            tmp = Math.min(tmp, 127);
            if (state.u.umonnum === M.PM_FLOATING_EYE) {
                if (!random.rn2(4)) tmp = 127;
                if (mtmp.mcansee && haseyes(mtmp.data) && random.rn2(3)
                    && (perceives(mtmp.data)
                        || !activeHeroProperty(state, INVIS))) {
                    if (activeHeroProperty(state, BLINDED)) {
                        await message(
                            `As a blind ${pmname(
                                state.youmonst.data,
                                state.flags?.female ? FEMALE : MALE,
                            )}, you cannot defend yourself.`,
                            state,
                            env,
                        );
                    } else if (await mon_reflects(
                        mtmp,
                        'Your gaze is reflected by %s %s.',
                        state,
                        env,
                    )) {
                        return 1;
                    } else {
                        await message(
                            messageAt(
                                `${Monnam(mtmp, state, env)} is frozen by your gaze!`,
                                mtmp.mx,
                                mtmp.my,
                                state,
                            ),
                            state,
                            env,
                        );
                        paralyze_monst(mtmp, tmp);
                        return M_ATTK_AGR_DONE;
                    }
                }
            } else {
                await message(
                    messageAt(`${Monnam(mtmp, state, env)} is frozen by you.`,
                        mtmp.mx, mtmp.my, state),
                    state,
                    env,
                );
                paralyze_monst(mtmp, tmp);
                return M_ATTK_AGR_DONE;
            }
            return M_ATTK_HIT;
        case M.AD_COLD:
            if (Resists_Elem(mtmp, COLD_RES, state)) {
                await shieldeff(mtmp.mx, mtmp.my, state);
                await message(
                    messageAt(`${Monnam(mtmp, state, env)} is mildly chilly.`,
                        mtmp.mx, mtmp.my, state),
                    state,
                    env,
                );
                await golemeffects(mtmp, M.AD_COLD, tmp, { ...env, state });
                tmp = 0;
                break;
            }
            await message(
                messageAt(`${Monnam(mtmp, state, env)} is suddenly very cold!`,
                    mtmp.mx, mtmp.my, state),
                state,
                env,
            );
            state.u.mh += Math.trunc((tmp + random.rn2(2)) / 2);
            if (state.u.mhmax < state.u.mh)
                state.u.mhmax = state.u.mh;
            if (state.u.mhmax > ((state.youmonst.data.mlevel + 1) * 8)) {
                // C discards split_mon()'s returned clone, but the call still
                // performs the hero HP/max-HP split before passiveum returns.
                const { split_mon } = await import('./potion.js');
                await split_mon(state.youmonst, mtmp, {
                    ...env,
                    state,
                    random,
                    message,
                });
            }
            break;
        case M.AD_STUN:
            if (!mtmp.mstun) {
                mtmp.mstun = 1;
                await message(
                    messageAt(
                        `${Monnam(mtmp, state, env)} ${makeplural(
                            stagger(mtmp.data, 'stagger'),
                        )}.`,
                        mtmp.mx,
                        mtmp.my,
                        state,
                    ),
                    state,
                    env,
                );
            }
            tmp = 0;
            break;
        case M.AD_FIRE:
            if (Resists_Elem(mtmp, FIRE_RES, state)) {
                await shieldeff(mtmp.mx, mtmp.my, state);
                await message(
                    messageAt(`${Monnam(mtmp, state, env)} is mildly warm.`,
                        mtmp.mx, mtmp.my, state),
                    state,
                    env,
                );
                await golemeffects(mtmp, M.AD_FIRE, tmp, { ...env, state });
                tmp = 0;
                break;
            }
            await message(
                messageAt(
                    `${Monnam(mtmp, state, env)} is suddenly very hot!`,
                    mtmp.mx,
                    mtmp.my,
                    state,
                ),
                state,
                env,
            );
            break;
        case M.AD_ELEC:
            if (Resists_Elem(mtmp, SHOCK_RES, state)) {
                await shieldeff(mtmp.mx, mtmp.my, state);
                await message(
                    messageAt(
                        `${Monnam(mtmp, state, env)} is slightly tingled.`,
                        mtmp.mx,
                        mtmp.my,
                        state,
                    ),
                    state,
                    env,
                );
                await golemeffects(mtmp, M.AD_ELEC, tmp, { ...env, state });
                tmp = 0;
                break;
            }
            await message(
                messageAt(
                    `${Monnam(mtmp, state, env)} is jolted with your electricity!`,
                    mtmp.mx,
                    mtmp.my,
                    state,
                ),
                state,
                env,
            );
            break;
        default:
            tmp = 0;
            break;
        }
    } else {
        tmp = 0;
    }
    return assess_dmg(mtmp, tmp, state, env);
}

// C ref: mhitu.c gulp_blnd_check() (1273-1285). C discards gulpmu()'s return;
// the swallow timer increment and the awaited engulfing effects still occur.
export async function gulp_blnd_check(state = game, rawEnv = {}) {
    const stuck = state.u?.ustuck;
    const blinded = state.u?.uprops?.[BLINDED];
    let mattk;
    // C's `Blinded` is HBlinded && !BBlinded; its separate `Blind` macro
    // includes EBlinded and must not be used for this guard.
    if (!(blinded?.intrinsic && !blinded.blocked) && state.u?.uswallow
        && (mattk = attacktype_fordmg(stuck.data, M.AT_ENGL, M.AD_BLND))
        && can_blnd(
            stuck,
            state.youmonst,
            mattk.aatyp,
            null,
            state,
        )) {
        ++state.u.uswldtim;
        await gulpmu(stuck, mattk, {
            ...rawEnv,
            state,
            random: rawEnv.random ?? { d, rn1, rn2, rnd },
            message: rawEnv.message ?? ttyPline,
            urgentMessage: rawEnv.urgentMessage ?? ttyUrgentPline,
            redraw: rawEnv.redraw ?? newsym,
        });
        return true;
    }
    return false;
}
