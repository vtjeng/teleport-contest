// potion.js -- quaffing and vapor effects for potions.
// C ref: src/potion.c dodrink() (526-615), drink_ok() (505-521),
//        dopotion() (618-641), peffects() (1333-1425),
//        make_confused() (89-104), self_invis_message() (471-478),
//        peffect_booze() (771-792), peffect_confusion() (1014-1027),
//        peffect_gain_ability() (1030-1051),
//        peffect_restore_ability() (646-695),
//        peffect_gain_energy() (1224-1258),
//        peffect_gain_level() (1083-1118),
//        peffect_paralysis() (881-898),
//        peffect_sleeping() (901-913),
//        peffect_speed() (1052-1070), peffect_oil() (1259-1294),
//        speed_up() (2918-2928),
//        itimeout/itimeout_incr/set_itimeout/incr_itimeout (55-86),
//        bottlename() (1487-1494), potionhit() (1624-1928),
//        potionbreathe() (1931-2118), make_stoned() (222-240),
//        make_vomiting() (243-255),
//        make_blinded() (261-331),
//        make_hallucinated() (387-442), toggle_blindness() (336-364).
//
// dodrink() is the #quaff command entry point. Its occupied milky-potion
// branch still names the void ghost_from_bottle() gap; the common path calls
// getobj() -> dopotion() -> peffects().
//
// peffects() dispatches the potion and spell effects; POT_ACID, POT_BOOZE, POT_CONFUSION,
// POT_GAIN_ABILITY, POT_GAIN_ENERGY, POT_SICKNESS, POT_SPEED (with spell alias SPE_HASTE_SELF), POT_BLINDNESS,
// POT_GAIN_LEVEL, POT_HEALING, POT_EXTRA_HEALING, POT_OIL,
// POT_SEE_INVISIBLE and POT_FRUIT_JUICE through peffect_see_invisible(),
// the ordinary POT_PARALYSIS and POT_SLEEPING arms,
// POT_POLYMORPH,
// POT_INVISIBILITY (also SPE_INVISIBILITY), POT_HALLUCINATION, POT_WATER,
// POT_RESTORE_ABILITY and SPE_RESTORE_ABILITY,
// are ported. Remaining unported arms throw UnsupportedQuaffError.
//
// toggle_blindness() is called by Blindf_on() and Blindf_off() when blindness
// status changes. It forces a full vision rebuild and updates monster display.

import {
    A_CHAOTIC,
    ACID_RES,
    ANTIMAGIC,
    A_CON,
    A_DEX,
    A_LAWFUL,
    A_STR,
    A_MAX,
    A_WIS,
    ARTICLE_THE,
    BLINDED,
    CONFUSION,
    COLNO,
    DEAF,
    DETECT_MONSTERS,
    GLIB,
    DISP_ALWAYS,
    DISP_END,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    ENL_GAMEINPROGRESS,
    COST_UNBLSS,
    COST_UNCURS,
    ER_NOTHING,
    EYE,
    FACE,
    FAST,
    FAINTED,
    FOOT,
    FROMOUTSIDE,
    HALLUC,
    HALLUC_RES,
    I_SPECIAL,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_EXCLUDE_NONINVENT,
    GETOBJ_NOFLAGS,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    HALF_PHDAM,
    HAND,
    INFRAVISION,
    INTRINSIC,
    INVIS,
    LS_OBJECT,
    IS_FOUNTAIN,
    IS_SINK,
    Is_airlevel,
    Is_waterlevel,
    LEVITATION,
    KILLED_BY,
    KILLED_BY_AN,
    FIXED_ABIL,
    FREE_ACTION,
    G_GONE,
    HEAD,
    LEG,
    MM_NOMSG,
    MAGICENLIGHTENMENT,
    NEUTRAL,
    POISON_RES,
    POLY_CONTROLLED,
    POLY_LOW_CTRL,
    POLY_NOFLAGS,
    PICK_NONE,
    NOTELL,
    POTHIT_HERO_THROW,
    POTHIT_OTHER_THROW,
    PLNMSG_OBJ_GLOWS,
    PROT_FROM_SHAPE_CHANGERS,
    SEE_INVIS,
    M_SEEN_SLEEP,
    SLEEP_RES,
    STONED,
    STRANGLED,
    TELEPAT,
    TIMEOUT,
    ROWNO,
    SHOPBASE,
    SUPPRESS_IT,
    SUPPRESS_SADDLE,
    UNCHANGING,
    Upolyd,
    WARN_OF_MON,
    VOMITING,
    WOUNDED_LEGS,
    W_SADDLE,
    W_WEP,
    ismnum,
} from './const.js';
import { acurr, adjattrib, exercise, poisontell } from './attrib.js';
import { Sting_effects } from './artifacts.js';
import {
    bot, newsym, see_monsters, see_objects, see_traps, swallowed, tmp_at,
} from './display.js';
import { goto_level, heal_legs, trycall } from './do.js';
import {
    Amonnam,
    Monnam,
    capitalizedMonsterName,
    hcolor,
    hliquid,
    mon_nam,
    x_monnam,
} from './do_name.js';
import { tamedog } from './dog.js';
import { can_reach_floor } from './engrave.js';
import { drinkfountain, drinksink } from './fountain.js';
import { more_experienced, pluslvl, rndexp } from './exper.js';
import { unfixable_trouble_count } from './apply.js';
import { fruitname, makeplural } from './fruit.js';
import { game } from './gstate.js';
import { del_light_source } from './light.js';
import {
    endRunning, losehp, nomul, spoteffects, You_can_move_again,
} from './hack.js';
import {
    getobj, hands_obj, learn_unseen_invent, obfree, update_inventory, useup,
} from './invent.js';
import { clone_mon, set_malign } from './makemon.js';
import { makemon_runtime } from './makemon_create.js';
import {
    breathless, dmgtype, has_head, haseyes, is_human, is_silent,
    is_vampshifter, is_were, likes_fire, mon_hates_blessings,
    monster_resists_element,
} from './mondata.js';
import {
    AD_ACID, AD_DISE, AD_PEST,
    PM_CYCLOPS, PM_DJINNI, PM_FLOATING_EYE, PM_GHOST, PM_GREMLIN,
    PM_HEALER, PM_IRON_GOLEM, PM_PESTILENCE,
} from './monsters.js';
import {
    bless, bcsign, carried, costly_alteration, curse, objectType, splitobj,
    unbless, uncurse,
} from './obj.js';
import { dist2, s_suffix, upstart } from './hacklib.js';
import {
    Tobjnam, donameFresh, is_plural, short_oname, thesimpleoname, vtense,
    yname,
} from './objnam.js';
import { hard_helmet, inaccessible_equipment } from './do_wear.js';
import { is_boots, is_gloves } from './obj.js';
import { discover_object } from './o_init.js';
import { encumber_msg } from './pickup.js';
import { body_part, float_vs_flight, polyself } from './polyself.js';
import {
    dealloc_killer,
    delayed_killer,
    find_delayed_killer,
} from './end.js';
import { fix_petrification } from './eat.js';
import { monstseesu, monstunseesu } from './mondata.js';
import { d, rn1, rn2, rnl, rnd, rne, rnz } from './rng.js';
import { canSpotMonster, heroIsBlind } from './startup_a11y.js';
import { cloneu } from './mhitu.js';
import {
    burn_away_slime, fall_asleep, obj_stop_timers,
} from './timeout.js';
import { explode_oil } from './explode.js';
import { Levitation, float_up, unconscious } from './trap.js';
import {
    Can_rise_up, ceiling, depth, get_level, has_ceiling, ledger_no, on_level,
    surface,
} from './dungeon.js';
import { stairway_at } from './stairs.js';
import { cansee, canseemon, vision_recalc } from './vision.js';
import {
    Cold_resistance, Fire_resistance, makewish, resist,
} from './zap.js';
import {
    OBJ_DESCR,
    POTION_CLASS,
    POT_ACID,
    POT_BLINDNESS,
    POT_BOOZE,
    POT_CONFUSION,
    POT_ENLIGHTENMENT,
    POT_EXTRA_HEALING,
    POT_FRUIT_JUICE,
    POT_FULL_HEALING,
    POT_GAIN_ABILITY,
    POT_GAIN_ENERGY,
    POT_GAIN_LEVEL,
    POT_HALLUCINATION,
    POT_HEALING,
    POT_INVISIBILITY,
    POT_LEVITATION,
    POT_MONSTER_DETECTION,
    POT_OBJECT_DETECTION,
    POT_OIL,
    POT_PARALYSIS,
    POT_POLYMORPH,
    POT_RESTORE_ABILITY,
    POT_SEE_INVISIBLE,
    POT_SICKNESS,
    POT_SLEEPING,
    POT_SPEED,
    POT_WATER,
    SPE_DETECT_MONSTERS,
    SPE_DETECT_TREASURE,
    SPE_HASTE_SELF,
    SPE_INVISIBILITY,
    SPE_LEVITATION,
    SPE_RESTORE_ABILITY,
    TOWEL,
    COIN_CLASS,
    LENSES,
    MUMMY_WRAPPING,
    SPBOOK_CLASS,
} from './objects.js';
import { displayPendingTtyMessageWindow, ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import {
    GLYPH_INVISIBLE, map_invisible, map_invisible_planning, unmap_object,
} from './display.js';
import {
    healmon, killed, mongone, monkilled, new_were, wake_nearto, wakeup,
} from './mon.js';
import { paralyze_monst, sleep_monst, slept_monst } from './mhitm.js';
import { which_armor, mon_adjust_speed, mon_set_minvis } from './worn.js';
import { in_rooms } from './rooms.js';
import { shop_keeper, stolen_value, subfrombill, alter_cost } from './shk.js';
import { water_damage } from './trap_water_damage.js';
import { aobjnam, an } from './objnam.js';
import { m_at } from './monst.js';
import { monster_detect } from './detect.js';

// Thrown where dodrink/dopotion/peffects reaches a branch this port has not
// ported, such as an unported potion type.
export class UnsupportedQuaffError extends Error {
    constructor(reason) {
        super(`quaffing requires ${reason}`);
        this.name = 'UnsupportedQuaffError';
        this.reason = reason;
    }
}

function djinniRandom(env = {}) {
    return env.random ?? { d, rn1, rn2, rnd, rne, rnz };
}

// C ref: potion.c split_mon() (2873-2935).  A heat-triggered split can target
// either the hero or a monster.  Its returned clone controls the caller's
// fountain cleanup, so both clone paths preserve that return value and their
// source-specific hit-point updates.
export async function split_mon(mon, attacker = null, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const message = rawEnv.message ?? ttyPline;
    let reason = '';
    if (attacker) {
        reason = attacker === state.youmonst
            ? ' from your heat'
            : ` from ${s_suffix(mon_nam(attacker, state, rawEnv))} heat`;
    }

    if (mon === state.youmonst) {
        if (state.u.mh > state.u.mhmax)
            state.u.mh = state.u.mhmax;
        const clone = state.u.mh > 1
            ? await cloneu(state, { ...rawEnv, state })
            : null;
        if (clone) {
            clone.mhpmax = Math.trunc(state.u.mhmax / 2);
            state.u.mhmax -= clone.mhpmax;
            state.disp.botl = true;
            await message(`You multiply${reason}!`, state, rawEnv);
        }
        return clone;
    }

    if (mon.mhp > mon.mhpmax)
        mon.mhp = mon.mhpmax;
    const clone = mon.mhp > 1
        ? await clone_mon(mon, 0, 0, state, { ...rawEnv, state })
        : null;
    if (clone) {
        // C asserts mon->mhpmax >= mon->mhp here. The preceding clamp and
        // clone_mon()'s half-current-HP operation establish that invariant.
        clone.mhpmax = Math.trunc(mon.mhpmax / 2);
        mon.mhpmax -= clone.mhpmax;
        if (canSpotMonster(mon, state)) {
            await message(
                `${Monnam(mon, state, rawEnv)} multiplies${reason}!`,
                state,
                rawEnv,
            );
        }
    }
    return clone;
}

// C ref: potion.c mongrantswish() (2794-2812). Remove the djinni before the
// wish can kill the hero, keep its old glyph visible while the prompt is up,
// and erase that transient glyph after the wish returns.
export async function mongrantswish(monster, state = game, env = {}) {
    const x = monster.mx;
    const y = monster.my;
    // C caches glyph_at(), an integer. The JS display buffer retains that
    // integer on its full presentation record, which tmp_at() needs in order
    // to redraw the same monster glyph after mongone() replaces the square.
    const glyph = state.level?.at(x, y)?.disp_glyph;
    if (!glyph) throw new Error('mongrantswish requires a displayed djinni');
    const removeMonster = env.removeMonster ?? mongone;
    const transient = env.transient ?? tmp_at;
    const grantWish = env.grantWish ?? makewish;

    removeMonster(monster, { ...env, state, random: djinniRandom(env) });
    await transient(DISP_ALWAYS, glyph, state);
    await transient(x, y, state);
    try {
        await grantWish(state);
    } finally {
        await transient(DISP_END, 0, state);
    }
    return null;
}

// C ref: potion.c djinni_from_bottle() (2814-2868). This source-ordered
// outcome family is shared by a rubbed magic lamp and a smoky potion.
export async function djinni_from_bottle(obj, state = game, env = {}) {
    const random = djinniRandom(env);
    const message = env.message ?? ttyPline;
    const makeMonster = env.makeMonster ?? makemon_runtime;
    let monster = await makeMonster(
        state.mons[PM_DJINNI],
        state.u.ux,
        state.u.uy,
        MM_NOMSG,
        { ...env, state, random },
    );
    if (!monster) {
        await message('It turns out to be empty.', state);
        return null;
    }

    if (!heroIsBlind(state)) {
        const indefinite = Amonnam(monster, { state });
        await message(
            `In a cloud of smoke, ${indefinite.charAt(0).toLowerCase()}${
                indefinite.slice(1)} emerges!`,
            state,
        );
        await message(`${capitalizedMonsterName(monster, state)} speaks.`, state);
    } else {
        await message('You smell acrid fumes.', state);
        await message('Something speaks.', state);
    }

    let chance = random.rn2(5);
    if (obj.blessed)
        chance = chance === 4 ? random.rnd(4) : 0;
    else if (obj.cursed)
        chance = chance === 0 ? random.rn2(4) : 4;

    switch (chance) {
    case 0:
        await message('"I am in your debt.  I will grant one wish!"', state);
        monster = await mongrantswish(monster, state, { ...env, random });
        break;
    case 1:
        await message('"Thank you for freeing me!"', state);
        await (env.tameMonster ?? tamedog)(
            monster,
            null,
            false,
            { ...env, state, random },
        );
        break;
    case 2:
        await message('"You freed me!"', state);
        monster.mpeaceful = true;
        set_malign(monster, state);
        break;
    case 3:
        await message('"It is about time!"', state);
        if (canSpotMonster(monster, state)) {
            await message(
                `${capitalizedMonsterName(monster, state)} vanishes.`,
                state,
            );
        }
        (env.removeMonster ?? mongone)(
            monster,
            { ...env, state, random },
        );
        monster = null;
        break;
    default:
        await message('"You disturbed me, fool!"', state);
        monster.mpeaceful = false;
        set_malign(monster, state);
        break;
    }
    return monster;
}

// ---------------------------------------------------------------------------
// Timeout utilities
// C ref: potion.c:55-86. Clamp and increment the timeout field of an
// intrinsic property, whose layout is (flags | timeout) packed into a single
// integer with TIMEOUT masking the low 24 bits.
// ---------------------------------------------------------------------------

// C ref: potion.c itimeout() (55-64). Clamp val into [0, TIMEOUT].
function itimeout(val) {
    if (val >= TIMEOUT) return TIMEOUT;
    if (val < 1) return 0;
    return val;
}

// C ref: potion.c itimeout_incr() (67-71). Add incr to old's timeout field.
function itimeout_incr(old, incr) {
    return itimeout((old & TIMEOUT) + incr);
}

// C ref: potion.c set_itimeout() (74-79). Overwrite the timeout field of the
// intrinsic value pointed to by `prop` (an object with a mutable `.intrinsic`
// field), keeping the flag bits above TIMEOUT.
export function set_itimeout(prop, val) {
    prop.intrinsic = (prop.intrinsic & ~TIMEOUT) | itimeout(val);
}

// C ref: potion.c incr_itimeout() (82-86). Increment the timeout field.
export function incr_itimeout(prop, incr) {
    set_itimeout(prop, itimeout_incr(prop.intrinsic, incr));
}

// C ref: potion.c make_stoned() (222-240). Set or clear the STONED timeout,
// update the condition line only on a transition, and retain the delayed
// killer which timeout.c consults when petrification expires.
export async function make_stoned(
    xtime, msg, killedby, killername, state = game,
) {
    const prop = state.u?.uprops?.[STONED];
    if (!prop)
        throw new Error('make_stoned requires initialized STONED state');
    const old = prop.intrinsic & TIMEOUT;
    set_itimeout(prop, xtime);
    if (Boolean(xtime) !== Boolean(old)) {
        state.disp ??= {};
        state.disp.botl = true;
        if (msg) await ttyPline(msg, state);
    }
    if (!(prop.intrinsic & TIMEOUT)) {
        dealloc_killer(find_delayed_killer(STONED, state), state);
    } else if (!old) {
        delayed_killer(STONED, killedby, killername, state);
    }
}

// C ref: potion.c make_vomiting() (243-255). Vomiting is the intrinsic
// property; set_itimeout() changes only its timeout bits. Every call dirties
// the condition line, and the optional cure message follows C's old-value and
// Unaware checks.
export async function make_vomiting(xtime, talk, state = game, env = {}) {
    const prop = state.u?.uprops?.[VOMITING];
    if (!prop)
        throw new Error('make_vomiting requires initialized VOMITING state');
    const old = prop.intrinsic;

    if (Unaware(state)) talk = false;

    set_itimeout(prop, xtime);
    state.disp ??= {};
    state.disp.botl = true;
    if (!xtime && old && talk) {
        await (env.message ?? ttyPline)(
            'You feel much less nauseated now.', state,
        );
    }
}

// C ref: potion.c make_glib() (460-468). Set or clear "slippery fingers".
// polymon() calls make_glib(0) when the new form has no hands, clearing any
// Glib timeout so the status line updates.
export function make_glib(xtime, state = game, env = {}) {
    const prop = state.u?.uprops?.[GLIB];
    if (!prop) return; // property not initialized
    const wasGlib = Boolean(prop.intrinsic);
    const willBeGlib = Boolean(xtime);
    // Preserve C's (!Glib ^ !!xtime), including its equal-truth-value case.
    if (!wasGlib !== willBeGlib) {
        state.disp ??= {};
        state.disp.botl = true;
    }
    set_itimeout(prop, xtime);
    // potion.c:467: the worn-glove annotation can change with Glib.
    if (state.uarmg) update_inventory({ ...env, state });
}

// C ref: potion.c self_invis_message() (471-478). The optional message seam
// lets trap_effects.js preserve its controlled message owner while normal
// potion callers continue to write through ttyPline().
export async function self_invis_message(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    await message(
        `${Hallucination(state) ? 'Far out, man!  You'
            : 'Gee!  All of a sudden, you'} ${See_invisible(state)
            ? 'can see right through yourself' : "can't see yourself"}.`,
        state,
    );
}

// C ref: potion.c make_deaf() (443-457). Set or clear timed deafness.
// When talk is true and the state changes, prints "You can hear again." or
// "You are unable to hear anything."  The rottenfood fainting callback
// (Hear_again) calls make_deaf(0, false), clearing the timer silently.
// `env.message` lets elapsed-turn planning run this source call without
// writing the clone's message to the live terminal.
export async function make_deaf(xtime, talk, state = game, env = {}) {
    const prop = state.u?.uprops?.[DEAF];
    if (!prop) return;
    const old = prop.intrinsic & TIMEOUT;

    if (Unaware(state)) talk = false;

    set_itimeout(prop, xtime);

    // C ref: youprop.h:125 Deaf. HDeaf || EDeaf || u.uroleplay.deaf.
    const deaf = Boolean(
        (prop.intrinsic & TIMEOUT) || prop.extrinsic
        || state.u?.uroleplay?.deaf,
    );

    if (Boolean(xtime) !== Boolean(old)) {
        state.disp ??= {};
        state.disp.botl = true;
        if (talk) {
            const message = env.message ?? ttyPline;
            await message(
                old && !deaf
                    ? 'You can hear again.'
                    : 'You are unable to hear anything.',
                state,
            );
        }
    }
}

// C ref: potion.c make_blinded() (261-331). The temporary timeout is probed
// before committing it because Eyes of the Overworld can keep Blind false even
// while HBlinded changes. Message calls use the caller's seam so planning
// clones do not write to the live terminal; toggle_blindness() remains the
// canonical owner of the full vision rebuild.
export async function make_blinded(xtime, talk, state = game, env = {}) {
    const prop = state.u?.uprops?.[BLINDED];
    if (!prop)
        throw new Error('make_blinded requires initialized BLINDED state');
    const old = prop.intrinsic & TIMEOUT;

    // C probes one timed turn and restores the complete old HBlinded value.
    // This is deliberately done before changing talk for Unaware: the source
    // still needs the visibility transition even when its message is silent.
    const uCouldSee = !heroIsBlind(state);
    set_itimeout(prop, xtime ? 1 : 0);
    const canSeeNow = !heroIsBlind(state);
    set_itimeout(prop, old);
    if (Unaware(state)) talk = false;

    const message = env.message ?? ttyPline;
    const hallucinating = Hallucination(state);
    const permaBlind = Boolean(prop.intrinsic & FROMOUTSIDE);
    const blindfolded = Boolean(prop.extrinsic);
    const eyes = () => {
        const species = state.youmonst?.data;
        let result = species && haseyes(species)
            ? body_part(EYE, state.youmonst) : 'eyes';
        // mondata.h eyecount(): only cyclops and floating eyes have one eye;
        // all other sighted forms have two, so pluralize their body part.
        const count = !species || !haseyes(species) ? 0
            : (species.pmidx === PM_CYCLOPS || species.pmidx === PM_FLOATING_EYE)
                ? 1 : 2;
        if (result == null) result = 'eyes';
        if (count !== 1) result = makeplural(result);
        return result;
    };
    const strangeFeeling = async () => strange_feeling(null, null, state);

    if (canSeeNow && !uCouldSee) {
        if (talk) {
            await message(
                hallucinating
                    ? 'Far out!  Everything is all cosmic again!'
                    : 'You can see again.',
                state,
            );
        }
    } else if (old && !xtime) {
        // Clearing temporary blindness without changing overall Blind leaves
        // a blindfold, permanent blindness, or eyeless form in charge.
        if (talk) {
            if (!haseyes(state.youmonst?.data) || permaBlind) {
                await strangeFeeling();
            } else if (blindfolded) {
                const name = eyes();
                await message(`Your ${name} momentarily ${vtense(name, 'itch')}.`, state);
            } else {
                await message(
                    'Your vision seems to brighten for a moment but is '
                        + (hallucinating ? 'sadder' : 'normal') + ' now.',
                    state,
                );
            }
        }
    }

    if (uCouldSee && !canSeeNow) {
        if (talk) {
            await message(
                hallucinating
                    ? 'Oh, bummer!  Everything is dark!  Help!'
                    : 'A cloud of darkness falls upon you.',
                state,
            );
        }
        // C's set_bc() result is discarded. It remains outside this span;
        // planning clones must not add the gap to the live game's set.
        const punished = Boolean(state.uball);
        if (punished && state === game) note_unported('ball.c set_bc');
    } else if (!old && xtime) {
        if (talk) {
            if (!haseyes(state.youmonst?.data) || permaBlind) {
                await strangeFeeling();
            } else if (blindfolded) {
                const name = eyes();
                await message(`Your ${name} momentarily ${vtense(name, 'twitch')}.`, state);
            } else {
                await message(
                    'Your vision seems to dim for a moment but is '
                        + (hallucinating ? 'happier' : 'normal') + ' now.',
                    state,
                );
            }
        }
    }

    set_itimeout(prop, xtime);
    if (uCouldSee !== canSeeNow)
        await toggle_blindness(state, env);
}

// C ref: youprop.h:399 Unaware. trap.c unconscious() owns the pending-message
// half; eat.c is_fainted() is the `u.uhs == FAINTED` half.
function Unaware(state) {
    return Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || state.u?.uhs === FAINTED);
}

// C ref: potion.c make_confused() (89-104). Replace HConfusion's timeout,
// report a cleared condition when requested, and mark the status line only
// when confusion starts or ends.
export async function make_confused(xtime, talk, state = game, env = {}) {
    const prop = state.u.uprops[CONFUSION] ??= {
        intrinsic: 0,
        extrinsic: 0,
    };
    const old = prop.intrinsic;

    if (Unaware(state)) talk = false;

    if (!xtime && old && talk) {
        await (env.message ?? ttyPline)(
            `You feel less ${Hallucination(state) ? 'trippy' : 'confused'} now.`,
            state,
        );
    }
    if ((xtime && !old) || (!xtime && old))
        state.disp.botl = true;

    set_itimeout(prop, xtime);
}

// C ref: potion.c make_hallucinated() (387-442). The ordinary transition
// updates the display before its optional feedback, including the special
// stomach redraw used when the hero is swallowed.
export async function make_hallucinated(
    xtime, talk, mask = 0, state = game, rawEnv = {},
) {
    const planning = Boolean(rawEnv.planning);
    const message = rawEnv.message
        ?? (planning ? async () => {} : ttyPline);
    const redraw = rawEnv.redraw
        ?? (planning ? () => {} : newsym);
    // Object and trap repainting is display-only.  Their existing owners are
    // live-game helpers; a planning clone supplies optional seams when it
    // needs to observe these writes, and otherwise discards the repaint just
    // as the clone discards every other terminal update.
    const seeObjects = rawEnv.seeObjects
        ?? (!planning && state === game ? see_objects : () => {});
    const seeTraps = rawEnv.seeTraps
        ?? (!planning && state === game ? see_traps : () => {});
    // A planning clone still needs see_monsters() to update its own map
    // memory.  An explicit planning call against the live game is the one
    // case where the display fallback must stay silent.
    const seeMonsters = rawEnv.seeMonsters
        ?? (planning && state === game
            ? () => {}
            : (subject) => see_monsters(subject, { redraw }));
    const swallow = rawEnv.swallowed
        ?? (!planning && state === game ? swallowed : async () => {});
    const hooks = {
        ...(rawEnv.hooks ?? {}),
        // invent.c requires an updateInventory seam for an active
        // permanent-inventory window.  Planning has no live window to paint,
        // but it still must pass that source preflight without refusal; a
        // caller-provided hook remains authoritative.
        ...(planning && typeof rawEnv.hooks?.updateInventory !== 'function'
            ? { updateInventory: () => {} } : {}),
    };
    const env = { ...rawEnv, state, message, redraw, hooks };
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    if (!hallucination || !resistance)
        throw new Error('make_hallucinated requires initialized HALLUC state');

    if (Unaware(state)) talk = false;
    const old = hallucination.intrinsic & TIMEOUT;
    let changed = false;

    if (mask) {
        changed = Boolean(hallucination.intrinsic);
        if (!xtime) resistance.extrinsic |= mask;
        else resistance.extrinsic &= ~mask;
    } else {
        changed = !resistance.intrinsic && !resistance.extrinsic
            && Boolean(old) !== Boolean(xtime);
        set_itimeout(hallucination, xtime);
    }

    if (!changed) return false;

    if (state.u.uswallow) {
        await swallow(false, state, env);
    } else {
        // potion.c calls all three display helpers before it emits the
        // message, so each newsym() sees the new Hallucination property.
        seeMonsters(state, env);
        seeObjects(state, { redraw });
        seeTraps(state, { redraw });
    }
    update_inventory({ ...env, state });
    state.disp.botl = true;
    if (talk) {
        const verb = heroIsBlind(state) ? 'feels' : 'looks';
        const message = xtime
            ? `Oh wow!  Everything ${verb} so cosmic!`
            : `Everything ${verb} SO boring now.`;
        await env.message(message, state, env);
    }
    return true;
}

// C ref: potion.c peffect_restore_ability() (646-695). Restore base ability
// scores from a random start point, and restore lost levels only for a potion
// (never the spellbook effect).
async function peffect_restore_ability(otmp, state = game, rawEnv = {}) {
    state.gp ??= {};
    state.gp.potion_unkn ??= 0;
    state.gp.potion_unkn++;
    const { message, random } = potionEffectEnvironment(rawEnv);

    if (otmp.cursed) {
        await message('Ulch!  This makes you feel mediocre!', state);
        return;
    }

    const feels = !otmp.blessed ? 'good'
        : unfixable_trouble_count(false, state) ? 'better' : 'great';
    await message(`Wow!  This makes you feel ${feels}!`, state);

    let index = random.rn2(A_MAX);
    for (let attempt = 0; attempt < A_MAX; attempt++) {
        const limit = state.u.amax.a[index];
        if (state.u.acurr.a[index] < limit) {
            state.u.acurr.a[index] = limit;
            // AEXE is abuse accumulated by exercise(); positive exercise is
            // retained, while negative abuse is reset with the base score.
            state.u.aexe[index] = Math.max(state.u.aexe[index], 0);
            state.disp.botl = true;
            if (!otmp.blessed) break;
        }
        if (++index >= A_MAX) index = 0;
    }

    if (otmp.otyp === POT_RESTORE_ABILITY
        && state.u.ulevel < state.u.ulevelmax) {
        do {
            await pluslvl(false, state, { message, random });
        } while (state.u.ulevel < state.u.ulevelmax && otmp.blessed);
    }
}

// C ref: potion.c peffect_hallucination() (696-713). The one shared gp state
// belongs to potion.c: peffects() also reaches it directly from spell.c, where
// dopotion() has not performed its per-quaff counter reset.
async function peffect_hallucination(otmp, state = game, rawEnv = {}) {
    state.gp ??= {};
    state.gp.potion_nothing ??= 0;
    state.gp.potion_unkn ??= 0;
    const { message, random } = potionEffectEnvironment(rawEnv);

    const hallucination = state.u.uprops[HALLUC];
    const resistance = state.u.uprops[HALLUC_RES];
    if (resistance.intrinsic || resistance.extrinsic) {
        state.gp.potion_nothing++;
        return;
    } else if (Hallucination(state)) {
        state.gp.potion_nothing++;
    }

    await make_hallucinated(
        itimeout_incr(
            hallucination.intrinsic,
            random.rn1(200, 600 - 300 * bcsign(otmp)),
        ),
        true,
        0,
        state,
        { ...rawEnv, message },
    );

    // C's || short-circuit is source-significant: blessed doses draw rn2(3)
    // first; only a failed blessed check (or an uncursed dose) draws rn2(6).
    if ((otmp.blessed && !random.rn2(3))
        || (!otmp.cursed && !random.rn2(6))) {
        await message('You perceive yourself...', state);
        await displayPendingTtyMessageWindow(state);
        const { enlightenment } = await import('./insight.js');
        const { select_menu } = await import('./windows.js');
        const lines = await enlightenment(
            MAGICENLIGHTENMENT,
            ENL_GAMEINPROGRESS,
            state,
        );
        await select_menu(state, {
            lines,
            how: PICK_NONE,
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        });
        await message('Your awareness re-normalizes.', state);
        await exercise(A_WIS, true, state, random, {
            encumberMessage: rawEnv.encumberMessage ?? encumber_msg,
        });
    }
}

// C ref: potion.c peffect_water() (717-767). Calls to make_sick() and the
// were.c lycanthropy mutators are void in C, so those unported callees are
// explicitly recorded and skipped; no placeholder state mutation stands in
// for them.
async function peffect_water(otmp, state = game, rawEnv = {}) {
    state.gp ??= {};
    state.gp.potion_nothing ??= 0;
    state.gp.potion_unkn ??= 0;
    const { message, random, encumberMessage } =
        potionEffectEnvironment(rawEnv);
    const u = state.u;

    if (!otmp.blessed && !otmp.cursed) {
        await message(`This tastes like ${hliquid('water', { state })}.`, state);
        u.uhunger += random.rnd(10);
        const { newuhs } = await import('./eat.js');
        await newuhs(false, state, {
            ...rawEnv,
            message,
            endRunning: rawEnv.endRunning
                ?? ((currentState) => endRunning(currentState)),
            statusRefresh: rawEnv.statusRefresh ?? (() => bot()),
        });
        return;
    }

    state.gp.potion_unkn++;
    const hatesBlessings = mon_hates_blessings(state.youmonst);
    if (hatesBlessings || u.ualign.type === A_CHAOTIC) {
        if (otmp.blessed) {
            await message(`This burns like ${hliquid('acid', { state })}!`, state);
            await exercise(A_CON, false, state, random, { encumberMessage });
            if (ismnum(u.ulycn)) {
                await message(
                    `Your affinity to ${makeplural(
                        state.mons[u.ulycn].pmnames[NEUTRAL],
                    )} disappears!`,
                    state,
                );
                if (state.youmonst.data === state.mons[u.ulycn])
                    note_unported('were.c you_unwere');
                note_unported('were.c set_ulycn');
            }
            const damage = Maybe_Half_Phys(random.d(2, 6), state);
            await losehp(
                damage,
                'potion of holy water',
                KILLED_BY_AN,
                state,
                rawEnv,
            );
        } else if (otmp.cursed) {
            await message('You feel quite proud of yourself.', state);
            await healup(random.d(2, 6), 0, 0, 0, state);
            if (ismnum(u.ulycn) && !Upolyd(u))
                note_unported('were.c you_were');
            await exercise(A_CON, true, state, random, { encumberMessage });
        }
    } else if (otmp.blessed) {
        await message('You feel full of awe.', state);
        note_unported('potion.c make_sick');
        await exercise(A_WIS, true, state, random, { encumberMessage });
        await exercise(A_CON, true, state, random, { encumberMessage });
        if (ismnum(u.ulycn))
            note_unported('were.c you_unwere');
    } else {
        if (u.ualign.type === A_LAWFUL) {
            await message(`This burns like ${hliquid('acid', { state })}!`, state);
            const damage = Maybe_Half_Phys(random.d(2, 6), state);
            await losehp(
                damage,
                'potion of unholy water',
                KILLED_BY_AN,
                state,
                rawEnv,
            );
        } else {
            await message('You feel full of dread.', state);
        }
        if (ismnum(u.ulycn) && !Upolyd(u))
            note_unported('were.c you_were');
        await exercise(A_CON, false, state, random, { encumberMessage });
    }
}

// C ref: potion.c peffect_booze() (771-792).
async function peffect_booze(otmp, state = game) {
    state.gp.potion_unkn++;
    await ttyPline(`Ooph!  This tastes like ${otmp.odiluted
        ? 'watered down ' : ''}${Hallucination(state)
        ? 'dandelion wine' : 'liquid fire'}!`, state);
    if (!otmp.blessed) {
        // C reads u.uhs before adding the potion's nutrition.
        await make_confused(itimeout_incr(
            state.u.uprops[CONFUSION].intrinsic,
            d(2 + state.u.uhs, 8),
        ), false, state);
    }
    if (!otmp.odiluted) await healup(1, 0, false, false, state);
    state.u.uhunger += 10 * (2 + bcsign(otmp));
    const { newuhs } = await import('./eat.js');
    await newuhs(false, state, {
        message: ttyPline,
        endRunning,
        statusRefresh: () => bot(),
    });
    await exercise(A_WIS, false, state);
    if (otmp.cursed) {
        await ttyPline('You pass out.', state);
        // This is C's direct assignment, not nomul(): do not clear running,
        // invulnerability, usleep or an existing multi_reason/callback.
        state.multi = -rnd(15);
        state.nomovemsg = 'You awake with a headache.';
    }
}

// ---------------------------------------------------------------------------
// peffect_confusion
// C ref: potion.c peffect_confusion() (1014-1027).
// ---------------------------------------------------------------------------

async function peffect_confusion(otmp, state = game) {
    const prop = state.u.uprops[CONFUSION] ??= {
        intrinsic: 0,
        extrinsic: 0,
    };

    if (!prop.intrinsic) {
        if (Hallucination(state)) {
            await ttyPline('What a trippy feeling!', state);
            state.gp.potion_unkn++;
        } else {
            await ttyPline('Huh, What?  Where am I?', state);
        }
    } else {
        state.gp.potion_nothing++;
    }
    await make_confused(
        itimeout_incr(
            prop.intrinsic,
            rn1(7, 16 - 8 * bcsign(otmp)),
        ),
        false,
        state,
    );
}

// ---------------------------------------------------------------------------
// peffect_gain_ability
// C ref: potion.c peffect_gain_ability() (1030-1051).
// ---------------------------------------------------------------------------

// The unblessed potion stops at the first attribute adjattrib() can raise;
// blessed potions walk all attributes in C's ascending index order.
async function peffect_gain_ability(otmp, state = game, env = {}) {
    const { message, random } = env;

    if (otmp.cursed) {
        await message('Ulch!  That potion tasted foul!', state);
        state.gp.potion_unkn++;
    } else if (fixedAbilities(state)) {
        state.gp.potion_nothing++;
    } else {
        let index = -1;
        for (let attempt = A_MAX; attempt > 0; --attempt) {
            index = otmp.blessed ? index + 1 : random.rn2(A_MAX);
            const messageMode = otmp.blessed || attempt === 1 ? 0 : -1;
            if (await adjattrib(
                index, 1, messageMode, state, env,
            ) && !otmp.blessed) {
                break;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// speed_up / peffect_speed
// C ref: potion.c speed_up() (2918-2928), peffect_speed() (1052-1070).
// ---------------------------------------------------------------------------

// C ref: potion.c speed_up() (2918-2928). Grant timed FAST intrinsic and
// print the speed-change message.
export async function speed_up(duration, state = game) {
    const hero = state.u;
    const prop = hero.uprops[FAST] ??= { intrinsic: 0, extrinsic: 0 };

    // C ref: youprop.h:377 Very_fast = ((HFast & ~INTRINSIC) || EFast).
    // True when the hero has a timed speed (non-intrinsic timeout bits) or
    // extrinsic speed (speed boots, etc.).
    const Very_fast = Boolean((prop.intrinsic & ~INTRINSIC) || prop.extrinsic);
    // C ref: youprop.h:376 Fast = (HFast || EFast).
    const Fast = Boolean(prop.intrinsic || prop.extrinsic);

    if (!Very_fast)
        await ttyPline(
            `You are suddenly moving ${Fast ? '' : 'much '}faster.`, state);
    else
        await ttyPline(
            `Your ${makeplural(body_part(LEG, state.youmonst))} get new energy.`,
            state);

    await exercise(A_DEX, true, state);
    incr_itimeout(prop, duration);
}

// C ref: potion.c peffect_speed() (1052-1070). Handle the POT_SPEED and
// SPE_HASTE_SELF arms of peffects().
async function peffect_speed(otmp, state = game) {
    const is_speed = (otmp.otyp === POT_SPEED);
    const hero = state.u;
    const prop = hero.uprops[FAST] ??= { intrinsic: 0, extrinsic: 0 };

    // C ref: 1057-1061. Skip when mounted; heal_legs() would heal the steed's
    // legs instead. Fail-closed: u.usteed is not ported.
    if (is_speed
        && Boolean((hero.uprops[WOUNDED_LEGS]?.intrinsic ?? 0)
                   || (hero.uprops[WOUNDED_LEGS]?.extrinsic ?? 0))
        && !otmp.cursed && !hero.usteed) {
        await heal_legs(state);
        state.gp.potion_unkn++;
        return;
    }

    await speed_up(rn1(10, 100 + 60 * bcsign(otmp)), state);

    // C ref: 1066-1069. Non-cursed potion grants permanent intrinsic speed.
    if (is_speed && !otmp.cursed
        && !(prop.intrinsic & INTRINSIC)) {
        await ttyPline('Your quickness feels very natural.', state);
        prop.intrinsic |= FROMOUTSIDE;
    }
}

// C ref: potion.c peffect_blindness() (1072-1080). A dose always draws and
// extends HBlinded, even when current blindness or a blocker makes the
// potion's result seem ineffective.
async function peffect_blindness(otmp, state = game) {
    const property = state.u.uprops[BLINDED];
    const blind = heroIsBlind(state);

    if (blind || ((property.intrinsic || property.extrinsic)
        && property.blocked)) {
        state.gp.potion_nothing++;
    }

    const duration = itimeout_incr(
        property.intrinsic,
        rn1(200, 250 - 125 * bcsign(otmp)),
    );
    await make_blinded(duration, !blind, state);
}

// ---------------------------------------------------------------------------
// peffect_sickness
// C ref: potion.c peffect_sickness() (964-1012).
// ---------------------------------------------------------------------------

function poisonResistance(state) {
    const property = state.u?.uprops?.[POISON_RES];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function fixedAbilities(state) {
    return Boolean(state.u?.uprops?.[FIXED_ABIL]?.extrinsic);
}

// C callers use the same message, random, and encumbrance operations for the
// potion effect and the attribute helpers it calls. In particular,
// attrib.c:poisontell() requires the message operation, while adjattrib() and
// exercise() can reach pickup.c:encumber_msg() during the active move loop.
function potionEffectEnvironment(env = {}) {
    return {
        ...env,
        message: env.message ?? ttyPline,
        encumberMessage: env.encumberMessage ?? encumber_msg,
        random: { d, rn1, rn2, rnd, ...env.random },
    };
}

// C ref: potion.c peffect_sickness() (964-1011). Covers the complete blessed,
// poison-resistance, Healer, Fixed_abil, sink-origin, attribute/damage,
// constitution-exercise, and hallucination branches in source order.
async function peffect_sickness(otmp, state = game, env = {}) {
    const { message, random, encumberMessage } = env;

    await message('Yecch!  This stuff tastes like poison.', state);

    if (otmp.blessed) {
        await message(
            `(But in fact it was mildly stale ${fruitname(true, state)}.)`,
            state,
        );
        if (state.urole?.mnum !== PM_HEALER) {
            await losehp(
                1,
                'mildly contaminated potion',
                KILLED_BY_AN,
                state,
            );
        }
    } else {
        const resistant = poisonResistance(state);
        if (resistant) {
            await message(
                `(But in fact it was biologically contaminated ${fruitname(
                    true, state)}.)`,
                state,
            );
        }
        if (state.urole?.mnum === PM_HEALER) {
            await message('Fortunately, you have been immunized.', state);
        } else {
            const typ = random.rn2(A_MAX);
            const contaminant = `${resistant ? 'mildly ' : ''}`
                + (otmp.fromsink
                    ? 'contaminated tap water'
                    : 'contaminated potion');
            if (!fixedAbilities(state)) {
                await poisontell(typ, false, state, env);
                await adjattrib(
                    typ,
                    resistant ? -1 : -random.rn1(4, 3),
                    1,
                    state,
                    env,
                );
            }
            if (!resistant) {
                await losehp(
                    random.rnd(10) + 5 * Number(Boolean(otmp.cursed)),
                    contaminant,
                    otmp.fromsink ? KILLED_BY : KILLED_BY_AN,
                    state,
                    env,
                );
            } else {
                await losehp(
                    1 + random.rn2(2),
                    contaminant,
                    otmp.fromsink ? KILLED_BY : KILLED_BY_AN,
                    state,
                    env,
                );
            }
            await exercise(A_CON, false, state, random, { encumberMessage });
        }
    }

    if (Hallucination(state)) {
        await message('You are shocked back to your senses!', state);
        await make_hallucinated(0, false, 0, state, env);
    }
}

// ---------------------------------------------------------------------------
// peffect_oil
// C ref: potion.c peffect_oil() (1259-1294).
// ---------------------------------------------------------------------------

// C ref: potion.c peffect_oil() (1259-1294). Handle the POT_OIL arm of
// peffects(). Three branches: lit oil (fire damage or refreshing drink
// depending on likes_fire()), cursed (castor oil), or normal (smooth).
// All paths end with exercise(A_WIS, good_for_you).
async function peffect_oil(otmp, state = game) {
    let good_for_you = false;

    if (otmp.lamplit) {
        if (likes_fire(state.youmonst.data)) {
            await ttyPline('Ahh, a refreshing drink.', state);
            good_for_you = true;
        } else {
            // C ref: 1274. "You burn your face."
            await ttyPline(
                `You burn your ${body_part(FACE, state.youmonst)}.`, state);
            // C ref: 1276. Fire damage; vulnerable = !Fire_resistance ||
            // Cold_resistance (cold-blooded heroes take extra fire damage).
            const vulnerable = !Fire_resistance(state)
                || Cold_resistance(state);
            await losehp(d(vulnerable ? 4 : 2, 4),
                'quaffing a burning potion of oil',
                KILLED_BY, state);
        }
        // C ref: 1287. burn_away_slime() cures green slime for fire contact.
        burn_away_slime(state);
    } else if (otmp.cursed) {
        await ttyPline('This tastes like castor oil.', state);
    } else {
        await ttyPline('That was smooth!', state);
    }
    await exercise(A_WIS, good_for_you, state);
}

// C ref: potion.c peffect_invisibility() (811-840). HInvis is the complete
// intrinsic field in u.uprops[INVIS], including FROMOUTSIDE. Spell objects
// cannot bypass a blocking source when mummy wrapping is worn. The cursed
// aggravate() result is void and its source family remains unported, so keep
// that named gap without inventing its monster effects.
async function peffect_invisibility(otmp, state = game) {
    const isSpell = otmp.oclass === SPBOOK_CLASS;
    const invisibility = state.u.uprops[INVIS];
    const blocked = Boolean(invisibility?.blocked);

    if (isSpell && blocked && state.uarmc?.otyp === MUMMY_WRAPPING) {
        await ttyPline(
            `You feel rather itchy under ${yname(state.uarmc, state)}.`,
            state,
        );
        return;
    }

    if (Invis(state) || heroIsBlind(state) || blocked) {
        state.gp.potion_nothing++;
    } else {
        await self_invis_message(state);
    }

    // C tests the whole HInvis intrinsic bitfield, not only its timeout;
    // FROMOUTSIDE and racial/permanent sources select the shorter chance too.
    const hInvis = invisibility?.intrinsic ?? 0;
    if (otmp.blessed && !rn2(hInvis ? 15 : 30)) {
        invisibility.intrinsic |= FROMOUTSIDE;
    } else {
        incr_itimeout(
            invisibility,
            d(6 - 3 * bcsign(otmp), 100) + 100,
        );
    }
    newsym(state.u.ux, state.u.uy);

    if (otmp.cursed) {
        await ttyPline(
            'For some reason, you feel your presence is known.', state);
        note_unported('wizard.c aggravate');
        invisibility.intrinsic &= ~FROMOUTSIDE;
    }
}

// ---------------------------------------------------------------------------
// peffect_see_invisible
// C ref: potion.c peffect_see_invisible() (841-880).
// ---------------------------------------------------------------------------

// C ref: potion.c peffect_see_invisible() (841-880). Both POT_SEE_INVISIBLE
// and POT_FRUIT_JUICE dispatch here; fruit juice returns after its nutrition
// update, before the see-invisible continuation.
async function peffect_see_invisible(otmp, state = game, env = {}) {
    const { message, random } = potionEffectEnvironment(env);
    // C evaluates these locals before the shared potion_unknown increment.
    // The fruit arm returns before either local is consumed, but retaining the
    // source order keeps the later see-invisible continuation source-shaped.
    // youprop.h:199 Invisible is Invis && !See_invisible. The message is
    // decided before clearing blindness or granting see-invisible.
    const msg = Invis(state) && !See_invisible(state) && !heroIsBlind(state);
    const permchance = 10
        - (state.u.uprops[INVIS]?.intrinsic ? 3 : 0)
        // C uses HSee_invisible, the intrinsic field only, for this chance.
        - (state.u.uprops[SEE_INVIS]?.intrinsic ? 6 : 0);

    state.gp.potion_unkn++;
    if (otmp.cursed) {
        await message(
            `Yecch!  This tastes ${Hallucination(state) ? 'overripe' : 'rotten'}.`,
            state,
        );
    } else {
        const hallucinating = Hallucination(state);
        const juiceName = fruitname(true, state);
        await message(hallucinating
            ? `This tastes like 10% real ${otmp.odiluted
                ? 'reconstituted ' : ''}${juiceName} all-natural beverage.`
            : `This tastes like ${otmp.odiluted
                ? 'reconstituted ' : ''}${juiceName}.`, state);
    }

    if (otmp.otyp === POT_FRUIT_JUICE) {
        state.u.uhunger += (otmp.odiluted ? 5 : 10) * (2 + bcsign(otmp));
        // eat.js imports potion.js for shared potion effects, so defer this
        // import until the branch executes and avoid another initialization
        // cycle at module load time.
        const { newuhs } = await import('./eat.js');
        await newuhs(false, state, {
            ...env,
            message,
            endRunning: env.endRunning
                ?? ((currentState) => endRunning(currentState)),
            statusRefresh: env.statusRefresh ?? (() => bot()),
        });
        return;
    }

    // Real see-invisible potions continue through the same C effect after the
    // shared taste preamble, unlike the fruit-juice early return above.
    if (!otmp.cursed)
        await make_blinded(0, true, state, { ...env, message });
    if (otmp.blessed && !random.rn2(permchance))
        state.u.uprops[SEE_INVIS].intrinsic |= FROMOUTSIDE;
    else
        incr_itimeout(state.u.uprops[SEE_INVIS], random.rn1(100, 750));
    // C's set_mimic_blocking() return is discarded. Record the unported gap
    // and continue with the source's visible-monster and hero redraws.
    note_unported('display.c set_mimic_blocking');
    see_monsters(state);
    newsym(state.u.ux, state.u.uy);
    if (msg && !heroIsBlind(state)) {
        await message(
            'You can see through yourself, but you are visible!', state);
        state.gp.potion_unkn--;
    }
}

// C ref: potion.c peffect_paralysis() (881-898). A Free_action hero only
// stiffens momentarily. Every other case reports where the hero is held,
// spends the source-ordered rn1() duration, stores the interruption reason
// and completion message for unmul(), and exercises Dexterity downward.
async function peffect_paralysis(otmp, state = game) {
    if (Free_action(state)) {
        await ttyPline('You stiffen momentarily.', state);
        return;
    }

    const hero = state.u;
    if (Levitation(state)
        || Is_airlevel(hero.uz)
        || Is_waterlevel(hero.uz)) {
        await ttyPline('You are motionlessly suspended.', state);
    } else if (hero.usteed) {
        await ttyPline('You are frozen in place!', state);
    } else {
        await ttyPline(
            `Your ${makeplural(body_part(FOOT, state.youmonst))} are frozen`
                + ` to the ${surface(hero.ux, hero.uy, state)}!`,
            state,
        );
    }

    // C evaluates rn1() as nomul()'s argument before writing either
    // multi_reason or nomovemsg. bcsign() supplies the blessed/cursed offset.
    nomul(-(rn1(10, 25 - 12 * bcsign(otmp))), state);
    state.multi_reason = 'frozen by a potion';
    state.nomovemsg = You_can_move_again;
    await exercise(A_DEX, false, state);
}

// C ref: potion.c peffect_sleeping() (901-913). A resistant hero yawns after
// nearby monsters learn about the resistance; otherwise the hero falls asleep
// after nearby monsters forget it. Keep the source's message, observation,
// duration draw, and fall_asleep() order.
async function peffect_sleeping(otmp, state = game, env = {}) {
    if (Sleep_resistance(state) || Free_action(state)) {
        monstseesu(M_SEEN_SLEEP, state);
        await ttyPline('You yawn.', state);
    } else {
        await ttyPline('You suddenly fall asleep!', state);
        monstunseesu(M_SEEN_SLEEP, state);
        await fall_asleep(
            -rn1(10, 25 - 12 * bcsign(otmp)), true, state, env,
        );
    }
}

// C ref: potion.c peffect_healing() (1119-1125).
async function peffect_healing(otmp, state = game) {
    await ttyPline('You feel better.', state);
    await healup(8 + d(4 + 2 * bcsign(otmp), 4), !otmp.cursed ? 1 : 0,
        Boolean(otmp.blessed), !otmp.cursed, state);
    await exercise(A_CON, true, state, { rn2 }, {
        encumberMessage: encumber_msg,
    });
}

// C ref: potion.c peffect_extra_healing() (1128-1141). The dice are rolled
// before healup, then the source clears hallucination and exercises
// Constitution followed by Strength. A blessed dose heals the hero's
// wounded legs only when no steed owns the wound.
async function peffect_extra_healing(otmp, state = game) {
    await ttyPline('You feel much better.', state);
    await healup(16 + d(4 + 2 * bcsign(otmp), 8),
        otmp.blessed ? 5 : !otmp.cursed ? 2 : 0,
        !otmp.cursed, true, state);
    await make_hallucinated(0, true, 0, state);
    await exercise(A_CON, true, state, { rn2 }, {
        encumberMessage: encumber_msg,
    });
    await exercise(A_STR, true, state, { rn2 }, {
        encumberMessage: encumber_msg,
    });

    const wounded = state.u.uprops[WOUNDED_LEGS];
    if (wounded && otmp.blessed && !state.u.usteed
        && (wounded.intrinsic || wounded.extrinsic)) {
        await heal_legs(state);
    }
}

// C ref: potion.c peffect_polymorph() (1318-1331). The called polyself()
// result is void and ignored in C; its transformation side effects still
// complete before this potion effect continues.
async function peffect_polymorph(otmp, state = game) {
    await ttyPline(
        `You feel a little ${Hallucination(state) ? 'normal' : 'strange'}.`,
        state,
    );

    const unchanging = state.u.uprops[UNCHANGING];
    if (unchanging.intrinsic || unchanging.extrinsic)
        return;

    if (!otmp.blessed || state.u.umonnum !== state.u.umonster) {
        await polyself(POLY_NOFLAGS, state);
    } else {
        await polyself(POLY_CONTROLLED | POLY_LOW_CTRL, state);
        if (state.u.mtimedone && state.u.umonnum !== state.u.umonster)
            state.u.mtimedone = Math.min(state.u.mtimedone, rn2(15) + 10);
    }
}

// ---------------------------------------------------------------------------
// peffects / dopotion / dodrink
// C ref: potion.c peffects() (1333-1425), dopotion() (618-641),
//        drink_ok() (505-521), dodrink() (526-615).
// ---------------------------------------------------------------------------

// C ref: potion.c peffect_levitation() (1164-1215). Levitation potions and
// spells use the same property timeout, cursed ceiling impact, and sink effect.
async function peffect_levitation(otmp, state) {
    const { u } = state;
    const levitation = u.uprops[LEVITATION];
    state.gp ??= {};
    state.gp.potion_nothing ??= 0;

    if (!Levitation(state) && !levitation.blocked) {
        // Give float_up() a live intrinsic before it reports the rise.
        set_itimeout(levitation, 1);
        await float_up(state);
    } else {
        state.gp.potion_nothing++;
    }

    if (otmp.cursed) {
        levitation.intrinsic &= ~I_SPECIAL;
        if (levitation.blocked) {
            // BLevitation means the rise is still blocked.
        } else if (stairway_at(u.ux, u.uy, state)?.up) {
            note_unported('do.c doup');
            state.gp.potion_nothing = 0;
        } else if (has_ceiling(u.uz, state)) {
            const dmg = rnd(!state.uarmh ? 10
                : !hard_helmet(state.uarmh, state) ? 6 : 3);
            await ttyPline(
                `You hit your ${body_part(HEAD, state.youmonst)} on the ${
                    ceiling(u.ux, u.uy, state)
                }.`,
                state,
            );
            await losehp(
                Maybe_Half_Phys(dmg, state),
                'colliding with the ceiling',
                KILLED_BY,
                state,
            );
            state.gp.potion_nothing = 0;
        }
    } else if (otmp.blessed) {
        incr_itimeout(levitation, rn1(50, 250));
        levitation.intrinsic |= I_SPECIAL;
    } else {
        incr_itimeout(levitation, rn1(140, 10));
    }

    if (Levitation(state)
        && IS_SINK(state.level.at(u.ux, u.uy).typ))
        await spoteffects(false, state);
    float_vs_flight(state);
}

// C ref: potion.c peffect_acid() (1297-1315). A quaffed acid potion can also
// cure petrification after applying its own acid damage.
async function peffect_acid(otmp, state = game) {
    if (Acid_resistance(state)) {
        await ttyPline(
            `This tastes ${Hallucination(state) ? 'tangy' : 'sour'}.`, state,
        );
    } else {
        await ttyPline(
            `This burns${otmp.blessed ? ' a little'
                : otmp.cursed ? ' a lot' : ' like acid'}!`,
            state,
        );
        const damage = d(otmp.cursed ? 2 : 1, otmp.blessed ? 4 : 8);
        await losehp(
            Maybe_Half_Phys(damage, state),
            'potion of acid',
            KILLED_BY_AN,
            state,
        );
        await exercise(A_CON, false, state, { rn2 }, {
            encumberMessage: encumber_msg,
        });
    }
    if (state.u?.uprops?.[STONED]?.intrinsic)
        await fix_petrification(state);
    state.gp.potion_unkn++;
}

// C ref: potion.c peffect_gain_level() (1083-1118). A cursed potion can
// ascend through the ceiling when the dungeon topology permits it; an
// uncursed potion delegates the ordinary advancement to exper.c pluslvl().
async function peffect_gain_level(otmp, state = game) {
    const { u } = state;
    if (otmp.cursed) {
        const onLevel1 = ledger_no(u.uz, state) === 1;
        state.gp.potion_unkn++;
        if (onLevel1 ? u.uhave.amulet
            : Can_rise_up(u.ux, u.uy, u.uz, state)) {
            let newlevel;
            if (onLevel1) {
                // C copies earth_level into a local d_level before goto_level;
                // keep the same separation because goto_level may clamp it.
                newlevel = { ...state.earth_level };
            } else {
                newlevel = { dnum: u.uz.dnum, dlevel: u.uz.dlevel };
                get_level(newlevel, depth(u.uz, state) - 1, state);
                if (on_level(newlevel, u.uz)) {
                    await ttyPline('It tasted bad.', state);
                    return;
                }
            }
            await ttyPline(
                `You rise up, through the ${ceiling(u.ux, u.uy, state)}!`,
                state,
            );
            await goto_level(newlevel, false, false, false, state);
        } else {
            await ttyPline('You have an uneasy feeling.', state);
        }
        return;
    }

    await pluslvl(false, state, { message: ttyPline });
    // Blessed potions randomize the new-level placement using the same
    // source-ordered experience draw after pluslvl's HP and energy draws.
    if (otmp.blessed) u.uexp = rndexp(true, state);
}

// C ref: potion.c peffect_gain_energy() (1224-1258). The potion changes
// current and maximum spell energy together; u.uenpeak tracks only a new
// maximum, while both lower bounds are clamped after their source updates.
async function peffect_gain_energy(otmp, state = game) {
    const { u } = state;
    if (otmp.cursed)
        await ttyPline('You feel lackluster.', state);
    else
        await ttyPline('Magical energies course through your body.', state);

    let amount = d(otmp.blessed ? 3 : !otmp.cursed ? 2 : 1, 6);
    if (otmp.cursed) amount = -amount;

    u.uenmax += amount;
    if (u.uenmax > u.uenpeak)
        u.uenpeak = u.uenmax;
    else if (u.uenmax <= 0)
        u.uenmax = 0;
    u.uen += 3 * amount;
    if (u.uen > u.uenmax)
        u.uen = u.uenmax;
    else if (u.uen <= 0)
        u.uen = 0;
    state.disp.botl = true;
    await exercise(A_WIS, true, state);
}

// C ref: potion.c peffect_monster_detection() (914-954). Blessed detection
// first refreshes HDetect_monsters, removes remembered invisible glyphs, and
// redraws the map; swallowed/underwater heroes then fall through to the
// ordinary monster_detect() path exactly as in C.
async function peffect_monster_detection(otmp, state = game) {
    // potion.c's gp flags are static globals and start zeroed even when a
    // spell calls peffects() directly, without dopotion()'s per-quaff reset.
    state.gp.potion_nothing ??= 0;
    state.gp.potion_unkn ??= 0;

    if (otmp.blessed) {
        const prop = state.u.uprops[DETECT_MONSTERS] ??= {
            intrinsic: 0,
            extrinsic: 0,
        };
        if (prop.intrinsic || prop.extrinsic)
            state.gp.potion_nothing++;
        state.gp.potion_unkn++;

        const duration = (prop.intrinsic & TIMEOUT) >= 300
            ? 1
            : otmp.oclass === SPBOOK_CLASS
                ? rn1(40, 21)
                : rn2(100) + 100;
        incr_itimeout(prop, duration);

        for (let x = 1; x < COLNO; x++) {
            for (let y = 0; y < ROWNO; y++) {
                if (state.level.at(x, y).remembered_glyph?.glyph
                    === GLYPH_INVISIBLE) {
                    unmap_object(x, y, state);
                    newsym(x, y);
                }
                if (m_at(x, y, state))
                    state.gp.potion_unkn = 0;
            }
        }

        // C falls through for swallowed or underwater heroes.
        if (!state.u.uswallow && !state.u.uinwater) {
            see_monsters(state);
            if (state.gp.potion_unkn)
                await ttyPline('You feel lonely.', state);
            return 0;
        }
    }

    if (await monster_detect(otmp, 0, state)) return 1;
    await exercise(A_WIS, true, state);
    return 0;
}

// C ref: potion.c peffects() (1333-1425). Dispatch the effect of a quaffed
// potion or spell. Returns >=0 if the effect short-circuits dopotion()'s tail
// (0 = no time, 1 = time), -1 to continue to the tail.
export async function peffects(otmp, state = game, env = {}) {
    switch (otmp.otyp) {
    case POT_RESTORE_ABILITY:
    case SPE_RESTORE_ABILITY:
        await peffect_restore_ability(
            otmp, state, potionEffectEnvironment(env),
        );
        break;
    case POT_HALLUCINATION:
        await peffect_hallucination(
            otmp, state, potionEffectEnvironment(env),
        );
        break;
    case POT_WATER:
        await peffect_water(otmp, state, potionEffectEnvironment(env));
        break;
    case POT_BOOZE:
        await peffect_booze(otmp, state);
        break;
    case POT_ENLIGHTENMENT:
        throw new UnsupportedQuaffError('peffect_enlightenment()');
    case SPE_INVISIBILITY:
    case POT_INVISIBILITY:
        await peffect_invisibility(otmp, state);
        break;
    case POT_SEE_INVISIBLE:
    case POT_FRUIT_JUICE:
        await peffect_see_invisible(otmp, state, env);
        break;
    case POT_PARALYSIS:
        await peffect_paralysis(otmp, state);
        break;
    case POT_SLEEPING:
        await peffect_sleeping(otmp, state, env);
        break;
    case POT_MONSTER_DETECTION:
    case SPE_DETECT_MONSTERS:
        if (await peffect_monster_detection(otmp, state)) return 1;
        break;
    case POT_OBJECT_DETECTION:
    case SPE_DETECT_TREASURE:
        throw new UnsupportedQuaffError('peffect_object_detection()');
    case POT_SICKNESS:
        await peffect_sickness(otmp, state, potionEffectEnvironment(env));
        break;
    case POT_CONFUSION:
        await peffect_confusion(otmp, state);
        break;
    case POT_GAIN_ABILITY:
        await peffect_gain_ability(
            otmp, state, potionEffectEnvironment(env),
        );
        break;
    case POT_SPEED:
    case SPE_HASTE_SELF:
        await peffect_speed(otmp, state);
        break;
    case POT_BLINDNESS:
        await peffect_blindness(otmp, state);
        break;
    case POT_GAIN_LEVEL:
        await peffect_gain_level(otmp, state);
        break;
    case POT_HEALING:
        await peffect_healing(otmp, state);
        break;
    case POT_EXTRA_HEALING:
        await peffect_extra_healing(otmp, state);
        break;
    case POT_FULL_HEALING:
        throw new UnsupportedQuaffError('peffect_full_healing()');
    case POT_LEVITATION:
    case SPE_LEVITATION:
        await peffect_levitation(otmp, state);
        break;
    case POT_GAIN_ENERGY:
        await peffect_gain_energy(otmp, state);
        break;
    case POT_OIL:
        await peffect_oil(otmp, state);
        break;
    case POT_ACID:
        await peffect_acid(otmp, state);
        break;
    case POT_POLYMORPH:
        await peffect_polymorph(otmp, state);
        break;
    default:
        throw new Error(`What a funny potion! (${otmp.otyp})`);
    }
    return -1;
}

// C ref: youprop.h:115-120. A hallucination timeout is effective only without
// intrinsic or extrinsic hallucination resistance.
function Hallucination(state) {
    const prop = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(prop?.intrinsic
        && !(resistance?.intrinsic || resistance?.extrinsic));
}

// C ref: potion.c strange_feeling() (1461-1475). An absent object is used by
// crystal-ball trap detection and make_blinded(); otherwise a known object can
// be called and the selected object is consumed after that prompt completes.
export async function strange_feeling(obj, txt, state = game) {
    const message = state.flags?.beginner || !txt
        ? `You have a ${Hallucination(state) ? 'normal' : 'strange'}`
            + ' feeling for a moment, then it passes.'
        : txt;
    await ttyPline(message, state);

    if (!obj) return;
    if (obj.dknown) await trycall(obj, state);
    useup(obj, { state });
}

// C ref: potion.c dopotion() (618-641). Called by dodrink() after the potion
// has been selected and milky/smoky checks have passed.
export async function dopotion(otmp, state = game, env = {}) {
    otmp.in_use = true;
    state.gp.potion_nothing = 0;
    state.gp.potion_unkn = 0;

    const retval = await peffects(otmp, state, env);
    if (retval >= 0) return retval ? ECMD_TIME : ECMD_OK;

    if (state.gp.potion_nothing) {
        state.gp.potion_unkn++;
        await ttyPline(
            `You have a ${Hallucination(state) ? 'normal' : 'peculiar'}`
            + ' feeling for a moment, then it passes.',
            state);
    }
    if (otmp.dknown && !objectType(otmp, state).oc_name_known) {
        if (!state.gp.potion_unkn) {
            // hack.h:1530 makeknown(x) is discover_object(x, TRUE, TRUE, TRUE).
            discover_object(otmp.otyp, true, true, true, state);
            more_experienced(0, 10, state);
        } else {
            await trycall(otmp, state);
        }
    }
    const hooks = {
        ...(env.hooks ?? {}),
        stopObjectTimers: env.hooks?.stopObjectTimers
            ?? ((obj, hookEnv) =>
                obj_stop_timers(obj, hookEnv.state, hookEnv)),
        deleteObjectLightSource: env.hooks?.deleteObjectLightSource
            ?? ((obj, hookEnv) =>
                del_light_source(LS_OBJECT, obj, hookEnv.state)),
    };
    useup(otmp, { ...env, state, hooks });
    return ECMD_TIME;
}

// C ref: potion.c dodrink() (526-615). The #quaff command entry point.
//
// Source-ordered port of potion.c:dodrink(). The void ghost_from_bottle()
// and remove_worn_item() dependencies remain named gaps when reached.
export async function dodrink(state = game) {
    const hero = state.u;

    // C ref: potion.c:530-533. Strangled hero cannot drink.
    if (hero.uprops[STRANGLED]?.intrinsic) {
        await ttyPline(
            "If you can't breathe air, how can you drink liquid?", state);
        return ECMD_OK;
    }

    // C ref: potion.c drink_ok_extra is a file-scope static that drink_ok()
    // reads. The closure below captures it.
    let drink_ok_extra = 0;

    // C ref: potion.c:540-569. Fountain, sink, and underwater checks are
    // guarded by !iflags.menu_requested (i.e. no 'm' prefix).
    if (!state.iflags.menu_requested) {
        // C ref: potion.c:542-549. Fountain on the hero's square.
        const typ = state.level.at(hero.ux, hero.uy).typ;
        if (IS_FOUNTAIN(typ) && can_reach_floor(false, state)) {
            // Dynamic import: y_n lives in cmd.js, which imports
            // potion.js. A static import would create a circular
            // dependency that changes module initialization order.
            const { y_n } = await import('./cmd.js');
            // yn_function() returns the raw keystroke byte, so the
            // comparison is against 'y'.charCodeAt(0), not 'y'.
            if (await y_n('Drink from the fountain?', state)
                === 'y'.charCodeAt(0)) {
                await drinkfountain(state);
                return ECMD_TIME;
            }
            ++drink_ok_extra;
        }
        // C ref: potion.c:552-559. Kitchen sink on the hero's square.
        if (IS_SINK(typ) && can_reach_floor(false, state)) {
            const { y_n } = await import('./cmd.js');
            if (await y_n('Drink from the sink?', state)
                === 'y'.charCodeAt(0)) {
                await drinksink(state);
                return ECMD_TIME;
            }
            ++drink_ok_extra;
        }
        // C ref: potion.c:562-564. Surrounded by water.
        if (hero.uinwater && !hero.uswallow) {
            const { y_n } = await import('./cmd.js');
            if (await y_n('Drink the water around you?', state)
                === 'y'.charCodeAt(0)) {
                await ttyPline('Do you know what lives in this water?', state);
                return ECMD_TIME;
            }
            ++drink_ok_extra;
        }
    }

    // C ref: potion.c drink_ok() (505-521). getobj() callback: potions are
    // suggested, everything else is excluded. The hands/self check communicates
    // that the hero has already declined a dungeon-feature prompt.
    function drink_ok(obj) {
        if (!obj)
            return drink_ok_extra
                ? GETOBJ_EXCLUDE_NONINVENT : GETOBJ_EXCLUDE;
        if (obj.oclass === POTION_CLASS) return GETOBJ_SUGGEST;
        return GETOBJ_EXCLUDE;
    }

    let otmp = await getobj('drink', drink_ok, GETOBJ_NOFLAGS, state);
    if (!otmp) return ECMD_CANCEL;

    // C ref: potion.c:591-598. Split a single potion off a worn stack so the
    // rest stays worn; for one worn potion C calls the void
    // steal.c:remove_worn_item() helper.
    if (otmp.owornmask) {
        if (otmp.quan > 1) {
            otmp = splitobj(otmp, 1, { state });
            otmp.owornmask = 0;
        } else {
            note_unported('steal.c remove_worn_item');
        }
    }
    otmp.in_use = true; // you've opened the stopper

    // C ref: potion.c:601-612. objdescr_is(otmp, s) compares the object's
    // description with s. POTION_OCCUPANT_CHANCE(n) is 13 + 2*n.
    const descr = OBJ_DESCR(objectType(otmp, state), state);
    if (descr === 'milky') {
        const ghostVital = state.mvitals[PM_GHOST];
        if (!(ghostVital.mvflags & G_GONE)
            && !rn2(13 + 2 * ghostVital.born)) {
            note_unported('potion.c ghost_from_bottle');
            useup(otmp, { state });
            return ECMD_TIME;
        }
    } else if (descr === 'smoky') {
        const djinniVital = state.mvitals[PM_DJINNI];
        if (!(djinniVital.mvflags & G_GONE)
            && !rn2(13 + 2 * djinniVital.born)) {
            // C discards djinni_from_bottle()'s void result; preserve its
            // awaited effects, then consume the bottle and return ECMD_TIME.
            await djinni_from_bottle(otmp, state);
            useup(otmp, { state });
            return ECMD_TIME;
        }
    }

    return await dopotion(otmp, state);
}

// C ref: potion.c toggle_blindness() (336-364). Called by Blindf_on() and
// Blindf_off() after the blindness state has already changed. Forces a full
// vision rebuild and updates the monster display for heroes whose senses
// (telepathy, infravision, or Sting-glow) depend on the blind/sighted split.
//
// The Sting_effects(-1) result is discarded by C.  The implemented artifact
// owner accepts the message seam below so planning clones stay silent.
export async function toggle_blindness(state = game, env = {}) {
    const hero = state.u;

    // C ref: potion.c:338. Stinging = (uwep && (EWarn_of_mon & W_WEP) != 0L).
    // True only when the hero wields the artifact Sting.
    const EWarn_of_mon = hero.uprops?.[WARN_OF_MON]?.extrinsic ?? 0;
    const Stinging = Boolean(state.uwep && (EWarn_of_mon & W_WEP));

    state.disp.botl = true;               // status conditions need update
    state.vision_full_recalc = 1;          // vision has changed
    // vision_recalc() and see_monsters() can operate on a planning clone when
    // their caller gives them the clone's redraw seam. The fallback is silent
    // for a non-live state because newsym() is the live display owner.
    const redraw = env.redraw ?? (state === game ? undefined : () => {});
    const visionRecalc = env.visionRecalc
        ?? ((control) => vision_recalc(control, { state, redraw }));
    visionRecalc(0, { state, redraw });

    // C ref: potion.c:349. Blind_telepat = (HTelepat || ETelepat);
    // Infravision = (HInfravision || EInfravision).
    const Blind_telepat = Boolean(
        hero.uprops?.[TELEPAT]?.intrinsic
        || hero.uprops?.[TELEPAT]?.extrinsic,
    );
    const Infravision = Boolean(
        hero.uprops?.[INFRAVISION]?.intrinsic
        || hero.uprops?.[INFRAVISION]?.extrinsic,
    );
    if (Blind_telepat || Infravision || Stinging)
        see_monsters(state, { redraw });

    // C ref: potion.c:359-360. Sting_effects(-1) resets the Sting glow/quiver
    // message to match the new blindness state. Its result is discarded; the
    // async owner accepts a silent clone message seam.
    if (Stinging) {
        await Sting_effects(-1, state, {
            message: env.message ?? (state === game ? undefined : async () => {}),
        });
    }

    // C ref: potion.c:362-363. learn_unseen_invent() marks dknown on objects
    // the hero picked up while blind. Fires only when the hero regains sight.
    if (!heroIsBlind(state)) {
        await learn_unseen_invent(state, env);
    }
}

// C ref: youprop.h:198 Invis, "either source minus the block that cancels
// both". js/vision.js m_canseeu() spells the same three terms inline for its
// own local; this is the first copy any other module can call.
function Invis(state) {
    const property = state.u?.uprops?.[INVIS];
    return Boolean((property?.intrinsic || property?.extrinsic)
        && !property?.blocked);
}

// C ref: youprop.h:152 See_invisible. Unlike Invis it has no blocked term.
function See_invisible(state) {
    const property = state.u?.uprops?.[SEE_INVIS];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: youprop.h:36 Sleep_resistance and :215 Free_action. Both are the
// plain "either source" spelling, with no blocking term.
function eitherSource(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function Sleep_resistance(state) {
    return eitherSource(state, SLEEP_RES);
}

function Free_action(state) {
    return eitherSource(state, FREE_ACTION);
}

// C ref: youprop.h:132 Acid_resistance, the plain "either source" spelling.
function Acid_resistance(state) {
    return eitherSource(state, ACID_RES);
}

// hack.h:1236 Maybe_Half_Phys(). youprop.h:341 defines Half_physical_damage
// as the intrinsic or the extrinsic, with no blocking term.
function Maybe_Half_Phys(dmg, state) {
    const halved = state.u?.uprops?.[HALF_PHDAM];
    return (halved?.intrinsic || halved?.extrinsic)
        ? Math.trunc((dmg + 1) / 2) : dmg;
}

// C ref: youprop.h:405 Half_gas_damage, "wrap it round your head to ward off
// noxious fumes [we require it to be damp or wet]". It is the one property
// here with no u.uprops slot: a worn towel with charges left, and nothing else.
function Half_gas_damage(state) {
    return Boolean(state.ublindf && state.ublindf.otyp === TOWEL
        && state.ublindf.spe > 0);
}

// C ref: potion.c bottlenames[] (1478-1479) and hbottlenames[] (1480-1485).
const bottlenames = [
    'bottle', 'phial', 'flagon', 'carafe', 'flask', 'jar', 'vial',
];
const hbottlenames = [
    'jug', 'pitcher', 'barrel', 'tin', 'bag', 'box', 'glass', 'beaker',
    'tumbler', 'vase', 'flowerpot', 'pan', 'thingy', 'mug', 'teacup',
    'teapot', 'keg', 'bucket', 'thermos', 'amphora', 'wineskin', 'parcel',
    'bowl', 'ampoule',
];

// C ref: potion.c bottlename() (1487-1494). hack.h:1493 expands
// ROLL_FROM(array) to array[rn2(SIZE(array))], so this always spends one draw.
export function bottlename(state = game, random = { rn2 }) {
    const names = Hallucination(state) ? hbottlenames : bottlenames;
    return names[random.rn2(names.length)];
}

// C ref: potion.c H2Opotion_dip() (1498-1589). This return is consumed by
// potionhit()'s monster-saddle branch; water_damage() is called only for a
// carried target, while the saddle's BUC transition uses the same ordered
// feedback, bill update, and object mutation as the source.
async function H2Opotion_dip(potion, target, useeit, objphrase, state, env) {
    if (!potion || potion.otyp !== POT_WATER) return false;

    const message = env.message ?? ttyPline;
    let action = null;
    let glowcolor = null;
    let costchange = -1; // potion.c COST_none
    let altfmt = false;
    let res = false;
    if (potion.blessed) {
        if (target.cursed) {
            action = uncurse;
            glowcolor = 'amber';
            costchange = COST_UNCURS;
        } else if (!target.blessed) {
            action = bless;
            glowcolor = 'light blue';
            costchange = -2; // potion.c COST_alter
            altfmt = true;
        }
    } else if (potion.cursed) {
        if (target.blessed) {
            action = unbless;
            glowcolor = 'brown';
            costchange = COST_UNBLSS;
        } else if (!target.cursed) {
            action = curse;
            glowcolor = 'black';
            costchange = -2;
            altfmt = true;
        }
    } else if (carried(target)) {
        state.gm.mentioned_water = false;
        if (await water_damage(target, 0, true, env) !== ER_NOTHING)
            res = true;
        if (state.gm.mentioned_water)
            await discover_object(POT_WATER, true, true, true, state, env);
        state.gm.mentioned_water = false;
    }

    if (action) {
        if (useeit) {
            glowcolor = hcolor(glowcolor, state, env);
            await message(
                altfmt ? `${objphrase} with ${an(glowcolor)} aura.`
                    : `${objphrase} ${glowcolor}.`,
                state,
            );
            state.iflags.last_msg = PLNMSG_OBJ_GLOWS;
            target.bknown = !Hallucination(state);
        } else if (!potion.bknown || !potion.dknown) {
            target.bknown = 0;
        }
        if (target.unpaid && target.otyp === POT_WATER) {
            if (costchange === -2) {
                alter_cost(target, 0, state, env);
            } else if (costchange !== -1) {
                await costly_alteration(target, costchange, { ...env, state });
            }
        }
        await action(target, { ...env, state });
        res = true;
    }
    return res;
}

// C ref: potion.c potionhit() (1625-1928), "potion obj hits monster mon,
// which might be youmonst; obj always used up". The single C function owns
// both target arms, the saddle subcase, the selected monster effect, vapor
// reach, optional calling, shop disposition, and final object release.
export async function potionhit(mon, obj, how, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { d, rn1, rn2, rnd, rnl, rne, rnz };
    const message = rawEnv.message ?? ttyPline;
    const env = { ...rawEnv, state, random, message };
    const botlnam = bottlename(state, random);
    const isyou = mon === state.youmonst;
    const distance = isyou ? 0 : dist2(
        mon.mx, mon.my, state.u.ux, state.u.uy,
    );
    const tx = isyou ? state.u.ux : mon.mx;
    const ty = isyou ? state.u.uy : mon.my;
    let saddle = null;
    let hit_saddle = false;
    const your_fault = how <= POTHIT_HERO_THROW;

    if (isyou) {
        await message(
            `The ${botlnam} crashes on your `
                + `${body_part(HEAD, state.youmonst)} and breaks into shards.`,
            state,
        );
        await losehp(
            Maybe_Half_Phys(random.rnd(2), state),
            how === POTHIT_OTHER_THROW ? 'propelled potion' : 'thrown potion',
            KILLED_BY_AN,
            state,
            env,
        );
        // end.c done() is NORETURN in C.  Keep the JavaScript tail from using
        // an object whose terminal cleanup has already ended the game.
        if (state.program_state?.gameover) return;
    } else {
        if ((mon.misc_worn_check & W_SADDLE)
            && (saddle = which_armor(mon, W_SADDLE, state))
            && (!random.rn2(10)
                || (obj.otyp === POT_WATER
                    && ((random.rnl(10) > 7 && obj.cursed)
                        || (random.rnl(10) < 4 && obj.blessed)
                        || !random.rn2(3))))) {
            hit_saddle = true;
        }

        if (!cansee(tx, ty, state)) {
            // C's sound event has no gameplay-visible return or state.
            note_unported('sounds.c Soundeffect');
            await message('Crash!', state);
        } else {
            const monsterName = mon_nam(mon, state, env);
            let targetName;
            if (hit_saddle && saddle) {
                targetName = `${s_suffix(x_monnam(
                    mon, ARTICLE_THE, null,
                    SUPPRESS_IT | SUPPRESS_SADDLE, false, state, env,
                ))} saddle`;
            } else if (has_head(mon.data)) {
                targetName = `${s_suffix(monsterName)} `
                    + `${state.gn?.notonhead ? 'body' : 'head'}`;
            } else {
                targetName = monsterName;
            }
            note_unported('sounds.c Soundeffect');
            await message(
                `The ${botlnam} crashes on ${targetName} and breaks into shards.`,
                state,
            );
        }
        // C evaluates rn2(5) even when the target already has one HP or the
        // saddle was hit; preserve its short-circuit position exactly.
        if (random.rn2(5) && mon.mhp > 1 && !hit_saddle)
            mon.mhp--;
    }

    // Oil does not instantly evaporate; a direct saddle hit does not either.
    if (obj.otyp !== POT_OIL && !hit_saddle && cansee(tx, ty, state))
        await message(`${Tobjnam(obj, 'evaporate', state)}.`, state);

    if (isyou) {
        switch (obj.otyp) {
        case POT_OIL:
            if (obj.lamplit)
                await explode_oil(obj, tx, ty, state, env);
            if (state.program_state?.gameover) return;
            break;
        case POT_POLYMORPH:
            await message(
                `You feel a little ${Hallucination(state) ? 'normal' : 'strange'}.`,
                state,
            );
            if (!(state.u.uprops[UNCHANGING]?.intrinsic
                || state.u.uprops[UNCHANGING]?.extrinsic)
                && !(state.u.uprops[ANTIMAGIC]?.intrinsic
                    || state.u.uprops[ANTIMAGIC]?.extrinsic))
                await polyself(POLY_NOFLAGS, state, env);
            break;
        case POT_ACID:
            if (!Acid_resistance(state)) {
                await message(`This burns${obj.blessed ? ' a little'
                    : obj.cursed ? ' a lot' : ''}!`, state);
                await losehp(
                    Maybe_Half_Phys(
                        random.d(obj.cursed ? 2 : 1, obj.blessed ? 4 : 8),
                        state,
                    ),
                    'potion of acid', KILLED_BY_AN, state, env,
                );
                if (state.program_state?.gameover) return;
            }
            break;
        }
    } else if (hit_saddle && saddle) {
        const useeit = !heroIsBlind(state) && canseemon(mon, state)
            && cansee(tx, ty, state);
        const monsterName = x_monnam(
            mon, ARTICLE_THE, null, SUPPRESS_IT | SUPPRESS_SADDLE,
            false, state, env,
        );
        const prefix = upstart(s_suffix(monsterName));
        let affected = false;
        switch (obj.otyp) {
        case POT_WATER: {
            const saddleGlows = `${prefix} ${aobjnam(saddle, 'glow', state)}`;
            affected = await H2Opotion_dip(
                obj, saddle, useeit, saddleGlows, state, env,
            );
            break;
        }
        case POT_POLYMORPH:
            // C intentionally leaves the saddle unchanged.
            break;
        }
        if (useeit && !affected)
            await message(`${prefix} ${aobjnam(saddle, 'get', state)} wet.`, state);
    } else {
        let angermon = your_fault;
        let cureblind = false;
        let healing = false;
        let illness = false;
        switch (obj.otyp) {
        case POT_FULL_HEALING:
            cureblind = true;
            // C fallthrough.
        case POT_EXTRA_HEALING:
            if (!obj.cursed) cureblind = true;
            // C fallthrough.
        case POT_HEALING:
            if (obj.blessed) cureblind = true;
            if (mon.data === state.mons[PM_PESTILENCE]) {
                illness = true;
                break;
            }
            healing = true;
            break;
        case POT_RESTORE_ABILITY:
        case POT_GAIN_ABILITY:
            healing = true;
            break;
        case POT_SICKNESS:
            if (mon.data === state.mons[PM_PESTILENCE]) {
                healing = true;
                break;
            }
            if (dmgtype(mon.data, AD_DISE) || dmgtype(mon.data, AD_PEST)
                || monster_resists_element(mon, POISON_RES, state)) {
                if (canseemon(mon, state))
                    await message(`${Monnam(mon, state, env)} looks unharmed.`, state);
                break;
            }
            illness = true;
            break;
        case POT_CONFUSION:
        case POT_BOOZE:
            if (!await resist(mon, POTION_CLASS, 0, NOTELL,
                state, random, env)) {
                mon.mconf = true;
            }
            break;
        case POT_INVISIBILITY: {
            const sawit = canSpotMonster(mon, state);
            const cursedPotion = Boolean(obj.cursed);
            angermon = Boolean(mon.minvis && cursedPotion);
            mon_set_minvis(mon, cursedPotion, state);
            if (sawit && !canSpotMonster(mon, state)) {
                if (cansee(mon.mx, mon.my, state))
                    (env.planning && state !== game
                        ? map_invisible_planning : map_invisible)(
                        mon.mx, mon.my, state,
                    );
            } else if (sawit && cursedPotion) {
                await message(`${Monnam(mon, state, env)} briefly seems to be transparent.`, state);
            } else if (!sawit && canSpotMonster(mon, state)) {
                await message(`${Monnam(mon, state, env)} appears!`, state);
            }
            break;
        }
        case POT_SLEEPING:
            if (await sleep_monst(mon, random.rnd(12), POTION_CLASS, env)) {
                await message(`${Monnam(mon, state, env)} falls asleep.`, state);
                slept_monst(mon);
            }
            break;
        case POT_PARALYSIS:
            if (mon.mcanmove)
                paralyze_monst(mon, random.rnd(25));
            break;
        case POT_SPEED:
            angermon = false;
            await mon_adjust_speed(mon, 1, obj, state, env);
            break;
        case POT_BLINDNESS:
            if (haseyes(mon.data) && (mon.mcansee || mon.mblinded)) {
                // mon_perma_blind(mon) is `!mcansee && !mblinded`.
                let blinded = 64 + random.rn2(32);
                const second = random.rn2(32);
                const resisted = await resist(
                    mon, POTION_CLASS, 0, NOTELL, state, random, env,
                );
                blinded += second * !resisted;
                blinded += mon.mblinded;
                mon.mblinded = Math.min(blinded, 127);
                mon.mcansee = false;
            }
            break;
        case POT_WATER:
            if (mon_hates_blessings(mon) || is_were(mon.data)
                || is_vampshifter(mon)) {
                if (obj.blessed) {
                    await message(
                        `${Monnam(mon, state, env)} `
                            + `${is_silent(mon.data) ? 'writhes' : 'shrieks'} in pain!`,
                        state,
                    );
                    if (!is_silent(mon.data))
                        await wake_nearto(tx, ty, mon.data.mlevel * 10, env);
                    mon.mhp -= random.d(2, 6);
                    if (mon.mhp < 1)
                        await killed(mon, state, env);
                    else if (is_were(mon.data) && !is_human(mon.data))
                        await new_were(mon, env);
                } else if (obj.cursed) {
                    angermon = false;
                    if (canseemon(mon, state))
                        await message(`${Monnam(mon, state, env)} looks healthier.`, state);
                    await healmon(mon, random.d(2, 6), 0);
                    if (is_were(mon.data) && is_human(mon.data)
                        && !(state.u.uprops[PROT_FROM_SHAPE_CHANGERS]?.intrinsic
                            || state.u.uprops[PROT_FROM_SHAPE_CHANGERS]?.extrinsic)) {
                        await new_were(mon, env);
                    }
                }
            } else if (mon.data === state.mons[PM_GREMLIN]) {
                angermon = false;
                await split_mon(mon, null, env);
            } else if (mon.data === state.mons[PM_IRON_GOLEM]) {
                if (canseemon(mon, state))
                    await message(`${Monnam(mon, state, env)} rusts.`, state);
                mon.mhp -= random.d(1, 6);
                if (mon.mhp < 1)
                    await killed(mon, state, env);
            }
            break;
        case POT_OIL:
            if (obj.lamplit)
                await explode_oil(obj, tx, ty, state, env);
            if (state.program_state?.gameover) return;
            break;
        case POT_ACID:
            if (!monster_resists_element(mon, ACID_RES, state)
                && !await resist(mon, POTION_CLASS, 0, NOTELL,
                    state, random, env)) {
                await message(
                    `${Monnam(mon, state, env)} `
                        + `${is_silent(mon.data) ? 'writhes' : 'shrieks'} in pain!`,
                    state,
                );
                if (!is_silent(mon.data))
                    await wake_nearto(tx, ty, mon.data.mlevel * 10, env);
                mon.mhp -= random.d(
                    obj.cursed ? 2 : 1, obj.blessed ? 4 : 8,
                );
                if (mon.mhp < 1) {
                    if (your_fault)
                        await killed(mon, state, env);
                    else
                        await monkilled(mon, '', AD_ACID, state, env);
                }
            }
            break;
        case POT_POLYMORPH:
            // C explicitly discards bhitm()'s return. The potion path in
            // zap.c remains a named gap until that source arm is ported.
            note_unported('zap.c bhitm potion polymorph');
            break;
        }

        if (healing) {
            angermon = false;
            if (mon.mhp < mon.mhpmax) {
                healmon(mon, mon.mhpmax, 0);
                if (canseemon(mon, state))
                    await message(`${Monnam(mon, state, env)} looks sound and hale again.`, state);
            }
            if (cureblind)
                note_unported('mon.c mcureblindness');
        } else if (illness && mon.mhp > 2) {
            mon.mhp = Math.trunc(mon.mhp / 2);
            if (canseemon(mon, state))
                await message(`${Monnam(mon, state, env)} looks rather ill.`, state);
        }

        // target might have been killed
        if (mon.mhp > 0) {
            if (angermon)
                await wakeup(mon, true, env);
            else
                mon.msleeping = 0;
        }
    }

    // potion.c potionhit():1906-1911. Keep the distance/RNG short-circuit
    // order: hero hits never roll the nearby-monster inhalation chance.
    const breathe = (distance === 0
        || (distance < 3
            && !random.rn2(Math.trunc((1 + acurr(state, A_DEX)) / 2))))
        && (!breathless(state.youmonst.data)
            || haseyes(state.youmonst.data));
    if (breathe) {
        await potionbreathe(obj, state, env);
    } else if (obj.dknown && cansee(tx, ty, state)) {
        await trycall(obj, state);
    }

    if (state.u.ushops?.[0] && obj.unpaid) {
        const shkp = shop_keeper(
            in_rooms(state.u.ux, state.u.uy, SHOPBASE, state)[0] ?? 0,
            state,
        );
        if (!shkp) {
            obj.unpaid = 0;
        } else if (state.context?.mon_moving) {
            subfrombill(obj, shkp, state, env);
        } else {
            await stolen_value(obj, state.u.ux, state.u.uy,
                Boolean(shkp.mpeaceful), false, state);
        }
    }
    obfree(obj, null, env);
}

// C ref: potion.c potionbreathe() (1932-2118). Preserve every vapor arm,
// fallthrough, random call, hero update and naming step. The discarded void
// calls to were.c transformations remain named gaps.
//
// obj stays in the caller's inventory: C sets in_use so that a wielded
// potion of unholy water cannot be dropped out from under maybe_destroy_item(),
// then restores the flag before makeknown() or trycall(). There is no obfree();
// zap.c:5919 leaves object release to the caller.
export async function potionbreathe(obj, state = game, env = {}) {
    let kn = 0;
    let cureblind = false;
    const already_in_use = obj.in_use;
    const random = env.random ?? { rn2, rnd };
    // potionhit() can call this inside a monster planning clone, which must
    // send feedback through its own message operation.
    const message = env.message ?? ttyPline;

    /* potion of unholy water might be wielded; prevent
       you_were() -> drop_weapon() from dropping it so that it
       remains in inventory where our caller expects it to be */
    obj.in_use = true;

    /* wearing a wet towel protects both eyes and breathing, even when
       the breath effect might be beneficial; we still pass down to the
       naming opportunity in case potion was thrown at hero by a monster */
    switch (Half_gas_damage(state) ? TOWEL : obj.otyp) {
    case TOWEL:
        await message('Some vapor passes harmlessly around you.', state);
        break;
    case POT_RESTORE_ABILITY:
    case POT_GAIN_ABILITY:
        if (obj.cursed) {
            if (!breathless(state.youmonst.data)) {
                await message('Ulch!  That potion smells terrible!', state);
            } else if (haseyes(state.youmonst.data)) {
                let eyes = body_part(EYE, state.youmonst);
                const species = state.youmonst.data;
                const eyeCount = species.pmidx === PM_CYCLOPS
                    || species.pmidx === PM_FLOATING_EYE ? 1 : 2;
                if (eyeCount !== 1) eyes = makeplural(eyes);
                await message(
                    'Your ' + eyes + ' ' + vtense(eyes, 'sting') + '!',
                    state,
                );
            }
            break;
        }
        {
            let index = random.rn2(A_MAX);
            let isdone = false;
            for (let attempt = 0; !isdone && attempt < A_MAX; attempt++) {
                if (state.u.acurr.a[index] < state.u.amax.a[index]) {
                    state.u.acurr.a[index]++;
                    isdone = !obj.blessed;
                    state.disp.botl = true;
                }
                if (++index >= A_MAX) index = 0;
            }
        }
        break;
    case POT_FULL_HEALING:
        if (Upolyd(state.u) && state.u.mh < state.u.mhmax) {
            state.u.mh++;
            state.disp.botl = true;
        }
        if (state.u.uhp < state.u.uhpmax) {
            state.u.uhp++;
            state.disp.botl = true;
        }
        cureblind = true;
        // C falls through to the extra-healing and healing arms.
    case POT_EXTRA_HEALING:
        if (Upolyd(state.u) && state.u.mh < state.u.mhmax) {
            state.u.mh++;
            state.disp.botl = true;
        }
        if (state.u.uhp < state.u.uhpmax) {
            state.u.uhp++;
            state.disp.botl = true;
        }
        if (!obj.cursed) cureblind = true;
        // C falls through to the healing arm.
    case POT_HEALING:
        if (Upolyd(state.u) && state.u.mh < state.u.mhmax) {
            state.u.mh++;
            state.disp.botl = true;
        }
        if (state.u.uhp < state.u.uhpmax) {
            state.u.uhp++;
            state.disp.botl = true;
        }
        if (obj.blessed) cureblind = true;
        if (cureblind) {
            await make_blinded(0, !state.u.ucreamed, state, {
                ...env, random, message,
            });
            await make_deaf(0, true, state, { ...env, random, message });
        }
        await exercise(A_CON, true, state, random, {
            encumberMessage: env.encumberMessage ?? encumber_msg,
        });
        break;
    case POT_SICKNESS:
        if (state.urole?.mnum !== PM_HEALER) {
            if (Upolyd(state.u))
                state.u.mh = state.u.mh <= 5 ? 1 : state.u.mh - 5;
            else
                state.u.uhp = state.u.uhp <= 5 ? 1 : state.u.uhp - 5;
            state.disp.botl = true;
            await exercise(A_CON, false, state, random, {
                encumberMessage: env.encumberMessage ?? encumber_msg,
            });
        }
        break;
    case POT_HALLUCINATION:
        await message('You have a momentary vision.', state);
        break;
    case POT_CONFUSION:
    case POT_BOOZE:
        {
            const confusion = state.u.uprops[CONFUSION];
            if (!(confusion.intrinsic || confusion.extrinsic))
                await message('You feel somewhat dizzy.', state);
            await make_confused(
                itimeout_incr(confusion.intrinsic, random.rnd(5)),
                false,
                state,
                { ...env, random, message },
            );
        }
        break;
    case POT_INVISIBILITY:
        if (!heroIsBlind(state) && !Invis(state)) {
            kn++;
            await message(
                'For an instant you '
                    + (See_invisible(state)
                        ? 'could see right through yourself'
                        : "couldn't see yourself") + '!',
                state,
            );
        }
        break;
    case POT_PARALYSIS:
        kn++;
        if (!Free_action(state)) {
            await message('Something seems to be holding you.', state);
            nomul(-random.rnd(5), state);
            state.multi_reason = 'frozen by a potion';
            state.nomovemsg = You_can_move_again;
            await exercise(A_DEX, false, state, random);
        } else {
            await message('You stiffen momentarily.', state);
        }
        break;
    case POT_SLEEPING:
        kn++;
        if (!Free_action(state) && !Sleep_resistance(state)) {
            await message('You feel rather tired.', state);
            nomul(-random.rnd(5), state);
            state.multi_reason = 'sleeping off a magical draught';
            state.nomovemsg = You_can_move_again;
            await exercise(A_DEX, false, state, random);
        } else {
            await message('You yawn.', state);
            monstseesu(M_SEEN_SLEEP, state);
        }
        break;
    case POT_SPEED:
        {
            const fast = state.u.uprops[FAST];
            if (!(fast.intrinsic || fast.extrinsic))
                await message('Your knees seem more flexible now.', state);
            incr_itimeout(fast, random.rnd(5));
            await exercise(A_DEX, true, state, random);
        }
        break;
    case POT_BLINDNESS:
        {
            const unaware = Unaware(state);
            if (!heroIsBlind(state) && !unaware) {
                kn++;
                await message('It suddenly gets dark.', state);
            }
            const blinded = state.u.uprops[BLINDED];
            await make_blinded(
                itimeout_incr(blinded.intrinsic, random.rnd(5)),
                false,
                state,
                { ...env, random, message },
            );
            if (!heroIsBlind(state) && !unaware)
                await message('Your vision quickly clears.', state);
            break;
        }
    case POT_WATER:
        if (state.u.umonnum === PM_GREMLIN) {
            await split_mon(state.youmonst, null, {
                ...env, state, random, message,
            });
        } else if (ismnum(state.u.ulycn)) {
            if (obj.blessed
                && state.youmonst.data === state.mons[state.u.ulycn]) {
                note_unported('were.c you_unwere');
            } else if (obj.cursed && !Upolyd(state.u)) {
                note_unported('were.c you_were');
            }
        }
        break;
    case POT_ACID:
    case POT_POLYMORPH:
        await exercise(A_CON, false, state, random, {
            encumberMessage: env.encumberMessage ?? encumber_msg,
        });
        break;
    /*
    case POT_GAIN_LEVEL:
    case POT_GAIN_ENERGY:
    case POT_LEVITATION:
    case POT_FRUIT_JUICE:
    case POT_MONSTER_DETECTION:
    case POT_OBJECT_DETECTION:
    case POT_OIL:
        break;
     */
    }

    if (!already_in_use)
        obj.in_use = false;
    /* note: no obfree() -- that's our caller's responsibility */
    if (obj.dknown) {
        // hack.h:1530 makeknown(x) is discover_object(x, TRUE, TRUE, TRUE).
        // kn counts the arms whose message told the hero what the potion
        // was; every other arm offers the naming prompt instead.
        if (kn) await discover_object(obj.otyp, true, true, true, state, env);
        else await trycall(obj, state);
    }
}

// C ref: potion.c healup() (1428-1458). Heals the hero's hit points and
// optionally cures sickness and blindness. nhp is the hit-point gain, nxtra
// is an extra max-HP boost when healing exceeds maximum HP, curesick and
// cureblind gate make_sick(0) and make_blinded(0) respectively.
export async function healup(nhp, nxtra, curesick, cureblind, state = game) {
    const u = state.u;
    if (nhp) {
        if (Upolyd(u)) {
            u.mh += nhp;
            if (u.mh > u.mhmax)
                u.mh = (u.mhmax += nxtra);
        } else {
            u.uhp += nhp;
            if (u.uhp > u.uhpmax) {
                u.uhp = (u.uhpmax += nxtra);
                if (u.uhpmax > u.uhppeak)
                    u.uhppeak = u.uhpmax;
            }
        }
    }
    if (cureblind) {
        u.ucreamed = 0;
        await make_blinded(0, true, state);
        await make_deaf(0, true, state);
    }
    if (curesick) {
        await make_vomiting(0, true, state);
        note_unported('potion.c make_sick');
    }
    state.disp = state.disp || {};
    state.disp.botl = true;
}

// ── dodip ──
// C ref: potion.c dodip() (2267-2372). The #dip command entry point.
// Asks which object to dip, then checks terrain (fountain, sink, pool)
// or asks which potion to dip into.
//
// Fail-closed arms: pool (water_damage/wash_hands) and potion-into-potion
// (potion_dip). Sink dipping is wired through fountain.c:dipsink().
export async function dodip(state = game) {
    const message = ttyPline;
    const hero = state.u;
    const here = state.level.at(hero.ux, hero.uy).typ;
    const at_pool = (await import('./trap.js')).is_pool(hero.ux, hero.uy, state);
    const at_fountain = IS_FOUNTAIN(here);
    const at_sink = IS_SINK(here);
    const at_here = !state.iflags.menu_requested
        && (at_pool || at_fountain || at_sink);

    // C ref: potion.c:2279. getobj() with dip callback.
    const obj = await getobj(
        'dip',
        at_here ? dip_hands_ok(state) : dip_ok,
        GETOBJ_PROMPT,
        state);
    if (!obj) return ECMD_CANCEL;
    // C ref: potion.c:2282-2283. The getobj filter excludes inaccessible
    // equipment from its suggested choices, but '*' can still select one.
    if (await inaccessible_equipment(obj, 'dip', false, state)) {
        return ECMD_OK;
    }

    const is_hands = (obj === hands_obj);
    const shortestname = (is_hands || is_plural(obj) || pair_of(obj))
        ? 'them' : 'it';

    // C ref: potion.c:2288. drink_ok_extra is a file-scope static that
    // communicates to drink_ok() that a dip prompt preceded the drink
    // prompt. Since dodrink keeps its own local drink_ok_extra, this
    // has no cross-function effect in our port.

    // C ref: potion.c:2298-2306. Format the object name for the prompt.
    // QBUFSZ is 128 in C. The getobj prompt is the longest consumer:
    // "What do you want to dip  into? [<letters> or ?*] " (up to ~79 chars
    // of overhead), leaving 49 characters for the object name.
    const QBUFSZ = 128;
    const SHORT_ONAME_LIMIT = QBUFSZ
        - 'What do you want to dip  into? [abdeghjkmnpqstvwyzBCEFHIKLNOQRTUWXZ#-# or ?*] '
            .length;
    let obuf;
    if (is_hands) {
        // C body_part(HAND) reads youmonst; pass the monster explicitly.
        obuf = `your ${makeplural(body_part(HAND, state.youmonst))}`;
    } else {
        // C ref: potion.c:2301-2305. short_oname() tries doname first;
        // if the result is too long, strips bknown/rknown/erosion and
        // falls back to thesimpleoname().
        obuf = short_oname(
            obj, donameFresh, thesimpleoname, SHORT_ONAME_LIMIT, state);
    }

    // C ref: potion.c:2310-2363. Terrain dipping.
    if (!state.iflags.menu_requested) {
        if (!can_reach_floor(false, state)) {
            // Cannot reach; skip all terrain prompts.
        } else if (at_fountain) {
            const { y_n } = await import('./cmd.js');
            const verbose = state.flags?.verbose !== false;
            const prompt = `Dip ${verbose ? obuf : shortestname}`
                + ' into the fountain?';
            if (await y_n(prompt, state) === 'y'.charCodeAt(0)) {
                if (!is_hands) obj.pickup_prev = 0;
                const { dipfountain } = await import('./fountain.js');
                await dipfountain(obj, state);
                return ECMD_TIME;
            }
            // Hero declined; drink_ok_extra would be incremented in C
            // but dodrink keeps its own local copy, so this has no effect.
        } else if (at_sink) {
            const { y_n } = await import('./cmd.js');
            const verbose = state.flags?.verbose !== false;
            const prompt = `Dip ${verbose ? obuf : shortestname}`
                + ' into the sink?';
            if (await y_n(prompt, state) === 'y'.charCodeAt(0)) {
                if (!is_hands) obj.pickup_prev = 0;
                const { dipsink } = await import('./fountain.js');
                await dipsink(obj, state);
                return ECMD_TIME;
            }
        } else if (at_pool) {
            throw new UnsupportedDipError('the pool dipping path');
        }
    }

    // C ref: potion.c:2366-2372. Ask for a potion to dip into.
    throw new UnsupportedDipError('the potion-into-potion path (potion_dip)');
}

// C ref: potion.c dip_ok() (2214-2227). getobj callback for dipping.
export function dip_ok(obj, state = game) {
    if (!obj) return GETOBJ_DOWNPLAY;
    if (obj.oclass === COIN_CLASS) return GETOBJ_EXCLUDE;
    if (inaccessible_equipment(obj, null, false, state))
        return GETOBJ_EXCLUDE_INACCESS;
    return GETOBJ_SUGGEST;
}

// C ref: potion.c dip_hands_ok() (2230-2237). getobj callback when hero
// has slippery hands and is at a terrain feature.
function dip_hands_ok(state) {
    return function(obj) {
        if (!obj && (Glib(state) && can_reach_floor(false, state))) {
            return GETOBJ_SUGGEST;
        }
        return dip_ok(obj, state);
    };
}

// C ref: obj.h pair_of() macro.
function pair_of(obj) {
    return obj.otyp === LENSES || is_gloves(obj) || is_boots(obj);
}

// Local Glib check: youprop.h #define Glib u.uprops[GLIB].intrinsic
function Glib(state) {
    return Boolean(state.u?.uprops?.[GLIB]?.intrinsic & TIMEOUT);
}

// Thrown when dodip() reaches a branch this port has not ported.
export class UnsupportedDipError extends Error {
    constructor(reason) {
        super(`dip requires ${reason}`);
        this.name = 'UnsupportedDipError';
        this.reason = reason;
    }
}
