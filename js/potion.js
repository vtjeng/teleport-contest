// potion.js -- quaffing and vapor effects for potions.
// C ref: src/potion.c dodrink() (526-615), drink_ok() (505-521),
//        dopotion() (618-641), peffects() (1333-1425),
//        make_confused() (89-104), peffect_confusion() (1014-1027),
//        peffect_speed() (1052-1070), peffect_oil() (1259-1294),
//        speed_up() (2918-2928),
//        itimeout/itimeout_incr/set_itimeout/incr_itimeout (55-86),
//        bottlename() (1487-1494), potionhit() (1624-1928),
//        potionbreathe() (1931-2118), make_blinded() (261-331),
//        make_hallucinated() (387-442), toggle_blindness() (336-364).
//
// dodrink() is the #quaff command entry point. Branches for strangled,
// fountain/sink, underwater, worn-potion, milky/smoky are fail-closed;
// the common path calls getobj() -> dopotion() -> peffects().
//
// peffects() dispatches 26 potion types; POT_CONFUSION, POT_SICKNESS,
// POT_SPEED (with spell alias SPE_HASTE_SELF), and POT_OIL are ported. The
// other 22 arms throw
// UnsupportedQuaffError.
//
// toggle_blindness() is called by Blindf_on() and Blindf_off() when blindness
// status changes. It forces a full vision rebuild and updates monster display.

import {
    ACID_RES,
    A_CON,
    A_DEX,
    A_MAX,
    A_WIS,
    BLINDED,
    CONFUSION,
    DEAF,
    GLIB,
    DISP_ALWAYS,
    DISP_END,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FACE,
    FAST,
    FAINTED,
    FROMOUTSIDE,
    HALLUC,
    HALLUC_RES,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_NONINVENT,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    HALF_PHDAM,
    INFRAVISION,
    INTRINSIC,
    INVIS,
    IS_FOUNTAIN,
    IS_SINK,
    KILLED_BY,
    KILLED_BY_AN,
    FIXED_ABIL,
    FREE_ACTION,
    HEAD,
    LEG,
    MM_NOMSG,
    POISON_RES,
    POTHIT_OTHER_THROW,
    SEE_INVIS,
    SLEEP_RES,
    STRANGLED,
    TELEPAT,
    TIMEOUT,
    Upolyd,
    WARN_OF_MON,
    WOUNDED_LEGS,
    W_WEP,
} from './const.js';
import { adjattrib, exercise, poisontell } from './attrib.js';
import {
    see_monsters, see_objects, see_traps, swallowed, tmp_at,
} from './display.js';
import { heal_legs, trycall } from './do.js';
import { Amonnam, capitalizedMonsterName } from './do_name.js';
import { tamedog } from './dog.js';
import { can_reach_floor } from './engrave.js';
import { drinkfountain } from './fountain.js';
import { more_experienced } from './exper.js';
import { makeplural, makesingular } from './fruit.js';
import { game } from './gstate.js';
import { losehp, nomul, You_can_move_again } from './hack.js';
import {
    getobj, learn_unseen_invent, obfree, update_inventory, useup,
} from './invent.js';
import { set_malign } from './makemon.js';
import { makemon_runtime, mongone } from './makemon_create.js';
import { breathless, haseyes, likes_fire } from './mondata.js';
import { PM_DJINNI, PM_HEALER } from './monsters.js';
import { bcsign, objectType } from './obj.js';
import { Tobjnam } from './objnam.js';
import { discover_object } from './o_init.js';
import { body_part } from './polyself.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { canSpotMonster } from './startup_a11y.js';
import { burn_away_slime } from './timeout.js';
import { unconscious } from './trap.js';
import { cansee, vision_recalc } from './vision.js';
import { Cold_resistance, Fire_resistance, makewish } from './zap.js';
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
} from './objects.js';
import { heroIsBlind } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';

// Thrown where potion.c reaches a vapor effect this port has not ported.
export class UnsupportedPotionError extends Error {
    constructor(branch) {
        super(`a potion's vapors require ${branch}`);
        this.name = 'UnsupportedPotionError';
        this.branch = branch;
    }
}

// Thrown where dodrink/dopotion/peffects reaches a branch this port has not
// ported: the 23 potion types besides POT_CONFUSION, POT_SPEED, and POT_OIL,
// and the
// strangled, fountain, sink, underwater, worn-potion, milky and smoky
// branches of dodrink().
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
// outcome family is shared by a rubbed magic lamp and a smoky potion. The
// latter caller remains fail-closed in dodrink(); dorub() is the live owner.
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

// C ref: potion.c make_glib() (460-468). Set or clear "slippery fingers".
// polymon() calls make_glib(0) when the new form has no hands, clearing any
// Glib timeout so the status line updates.
export function make_glib(xtime, state = game) {
    const prop = state.u?.uprops?.[GLIB];
    if (!prop) return; // property not initialized
    const wasGlib = Boolean(prop.intrinsic & TIMEOUT);
    const willBeGlib = Boolean(xtime);
    if (wasGlib !== willBeGlib) {
        state.disp ??= {};
        state.disp.botl = true;
    }
    set_itimeout(prop, xtime);
    // C: if (uarmg) update_inventory(); — may change "(being worn; slippery)"
    // The dragon-HP slice reaches this only with xtime=0 and no gloves
    // (nohands form), so the uarmg guard is always false here.
}

// C ref: potion.c make_blinded() (261-331), restricted to two ordinary cream
// paths: use_cream_pie()'s silent sighted-to-blind transition and wipeoff()'s
// one-turn timed-blindness probe back to sight. Other callers need the
// already-blind, Eyes of the Overworld, Punished, and alternate message arms,
// so they remain fail-closed here.
export async function make_blinded(xtime, talk, state = game) {
    const prop = state.u?.uprops?.[BLINDED];
    if (!prop)
        throw new Error('make_blinded requires initialized BLINDED state');
    const old = prop.intrinsic & TIMEOUT;
    const punished = Boolean(state.uball ?? state.go?.uball);
    const stinging = Boolean(
        state.uwep
        && ((state.u.uprops?.[WARN_OF_MON]?.extrinsic ?? 0) & W_WEP),
    );
    const startsCreamBlindness = talk === false
        && old === 0
        && !heroIsBlind(state)
        && !punished
        && !prop.extrinsic
        && !prop.blocked
        && Number.isInteger(xtime)
        && xtime >= 1
        && xtime <= TIMEOUT;
    const restoresWipedSight = talk === true
        && xtime === 0
        && old === 1
        && prop.intrinsic === 1
        && !prop.extrinsic
        && !prop.blocked
        && heroIsBlind(state)
        && state.u.ucreamed === 0
        && !punished
        && !stinging
        && !Unaware(state)
        && !Upolyd(state.u)
        && state.urace?.noun === 'human'
        && !(state.u.uprops?.[HALLUC]?.intrinsic
            || state.u.uprops?.[HALLUC]?.extrinsic);
    // C no-op: xtime=0 on a sighted hero with no blindness timeout.
    // Carrot eating calls make_blinded(ucreamed, TRUE); when ucreamed=0
    // and the hero is sighted, C probes u_could_see=true, can_see_now=true
    // and returns immediately.
    const sightedNoop = xtime === 0
        && old === 0
        && !heroIsBlind(state);
    if (!startsCreamBlindness && !restoresWipedSight && !sightedNoop) {
        throw new UnsupportedPotionError(
            'make_blinded() outside the ordinary cream-pie transitions',
        );
    }

    // Probe the status with one timed turn, then restore the old timeout,
    // exactly as C does in case blocked blindness overrides the property.
    const uCouldSee = !heroIsBlind(state);
    set_itimeout(prop, xtime ? 1 : 0);
    const canSeeNow = !heroIsBlind(state);
    set_itimeout(prop, old);

    if (restoresWipedSight)
        await ttyPline('You can see again.', state);

    set_itimeout(prop, xtime);
    if (uCouldSee !== canSeeNow)
        toggle_blindness(state);
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
export async function make_confused(xtime, talk, state = game) {
    const prop = state.u.uprops[CONFUSION] ??= {
        intrinsic: 0,
        extrinsic: 0,
    };
    const old = prop.intrinsic;

    if (Unaware(state)) talk = false;

    if (!xtime && old && talk) {
        await ttyPline(
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
    xtime, talk, mask = 0, state = game,
) {
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
        await swallowed(false, state);
    } else {
        // potion.c calls all three display helpers before it emits the
        // message, so each newsym() sees the new Hallucination property.
        see_monsters(state);
        see_objects(state);
        see_traps(state);
    }
    update_inventory({ state });
    state.disp.botl = true;
    if (talk) {
        const verb = heroIsBlind(state) ? 'feels' : 'looks';
        const message = xtime
            ? `Oh wow!  Everything ${verb} so cosmic!`
            : `Everything ${verb} SO boring now.`;
        await ttyPline(message, state);
    }
    return true;
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

// ---------------------------------------------------------------------------
// peffect_sickness
// C ref: potion.c peffect_sickness() (964-1012).
// ---------------------------------------------------------------------------

function fruitname(juice, state) {
    const configured = state.svp?.pl_fruit ?? 'slime mold';
    const marker = configured.toLowerCase().indexOf(' of ');
    const base = marker >= 0 ? configured.slice(marker + 4) : configured;
    return makesingular(base) + (juice ? ' juice' : '');
}

function poisonResistance(state) {
    const property = state.u?.uprops?.[POISON_RES];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function fixedAbilities(state) {
    return Boolean(state.u?.uprops?.[FIXED_ABIL]?.extrinsic);
}

// C ref: potion.c peffect_sickness() (964-1012). This covers the ordinary
// blessed and unblessed potion paths, including the source-ordered attribute
// loss, hit-point loss, and constitution exercise. The healer immunity and
// hallucination cleanup arms are retained here because the active divergence
// is the blessed potion path; the cleanup call still stops if its separate
// vision owner is reached.
async function peffect_sickness(otmp, state = game) {
    await ttyPline('Yecch!  This stuff tastes like poison.', state);

    if (otmp.blessed) {
        await ttyPline(
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
            await ttyPline(
                `(But in fact it was biologically contaminated ${fruitname(
                    true, state)}.)`,
                state,
            );
        }
        if (state.urole?.mnum === PM_HEALER) {
            await ttyPline('Fortunately, you have been immunized.', state);
        } else {
            const typ = rn2(A_MAX);
            const contaminant = `${resistant ? 'mildly ' : ''}`
                + (otmp.fromsink
                    ? 'contaminated tap water'
                    : 'contaminated potion');
            if (!fixedAbilities(state)) {
                await poisontell(typ, false, state);
                await adjattrib(
                    typ,
                    resistant ? -1 : -rn1(4, 3),
                    1,
                    state,
                );
            }
            if (!resistant) {
                await losehp(
                    rnd(10) + 5 * Number(Boolean(otmp.cursed)),
                    contaminant,
                    otmp.fromsink ? KILLED_BY : KILLED_BY_AN,
                    state,
                );
            } else {
                await losehp(
                    1 + rn2(2),
                    contaminant,
                    otmp.fromsink ? KILLED_BY : KILLED_BY_AN,
                    state,
                );
            }
            await exercise(A_CON, false, state);
        }
    }

    if (Hallucination(state)) {
        await ttyPline('You are shocked back to your senses!', state);
        await make_hallucinated(0, false, 0, state);
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

// ---------------------------------------------------------------------------
// peffects / dopotion / dodrink
// C ref: potion.c peffects() (1333-1425), dopotion() (618-641),
//        drink_ok() (505-521), dodrink() (526-615).
// ---------------------------------------------------------------------------

// C ref: potion.c peffects() (1333-1425). Dispatch the effect of a quaffed
// potion or spell. Returns >=0 if the effect short-circuits dopotion()'s tail
// (0 = no time, 1 = time), -1 to continue to the tail.
export async function peffects(otmp, state = game) {
    switch (otmp.otyp) {
    case POT_RESTORE_ABILITY:
    case SPE_RESTORE_ABILITY:
        throw new UnsupportedQuaffError('peffect_restore_ability()');
    case POT_HALLUCINATION:
        throw new UnsupportedQuaffError('peffect_hallucination()');
    case POT_WATER:
        throw new UnsupportedQuaffError('peffect_water()');
    case POT_BOOZE:
        throw new UnsupportedQuaffError('peffect_booze()');
    case POT_ENLIGHTENMENT:
        throw new UnsupportedQuaffError('peffect_enlightenment()');
    case SPE_INVISIBILITY:
    case POT_INVISIBILITY:
        throw new UnsupportedQuaffError('peffect_invisibility()');
    case POT_SEE_INVISIBLE:
    case POT_FRUIT_JUICE:
        throw new UnsupportedQuaffError('peffect_see_invisible()');
    case POT_PARALYSIS:
        throw new UnsupportedQuaffError('peffect_paralysis()');
    case POT_SLEEPING:
        throw new UnsupportedQuaffError('peffect_sleeping()');
    case POT_MONSTER_DETECTION:
    case SPE_DETECT_MONSTERS:
        throw new UnsupportedQuaffError('peffect_monster_detection()');
    case POT_OBJECT_DETECTION:
    case SPE_DETECT_TREASURE:
        throw new UnsupportedQuaffError('peffect_object_detection()');
    case POT_SICKNESS:
        await peffect_sickness(otmp, state);
        break;
    case POT_CONFUSION:
        await peffect_confusion(otmp, state);
        break;
    case POT_GAIN_ABILITY:
        throw new UnsupportedQuaffError('peffect_gain_ability()');
    case POT_SPEED:
    case SPE_HASTE_SELF:
        await peffect_speed(otmp, state);
        break;
    case POT_BLINDNESS:
        throw new UnsupportedQuaffError('peffect_blindness()');
    case POT_GAIN_LEVEL:
        throw new UnsupportedQuaffError('peffect_gain_level()');
    case POT_HEALING:
        throw new UnsupportedQuaffError('peffect_healing()');
    case POT_EXTRA_HEALING:
        throw new UnsupportedQuaffError('peffect_extra_healing()');
    case POT_FULL_HEALING:
        throw new UnsupportedQuaffError('peffect_full_healing()');
    case POT_LEVITATION:
    case SPE_LEVITATION:
        throw new UnsupportedQuaffError('peffect_levitation()');
    case POT_GAIN_ENERGY:
        throw new UnsupportedQuaffError('peffect_gain_energy()');
    case POT_OIL:
        await peffect_oil(otmp, state);
        break;
    case POT_ACID:
        throw new UnsupportedQuaffError('peffect_acid()');
    case POT_POLYMORPH:
        throw new UnsupportedQuaffError('peffect_polymorph()');
    default:
        throw new Error(`What a funny potion! (${otmp.otyp})`);
    }
    return -1;
}

// C ref: youprop.h:119-120 Hallucination, the bare HALLUC intrinsic minus
// the blocked term. Local because each file that needs it defines its own.
function Hallucination(state) {
    const prop = state.u?.uprops?.[HALLUC];
    return Boolean(prop?.intrinsic && !prop?.blocked);
}

// C ref: potion.c dopotion() (618-641). Called by dodrink() after the potion
// has been selected and milky/smoky checks have passed.
async function dopotion(otmp, state = game) {
    otmp.in_use = true;
    state.gp.potion_nothing = 0;
    state.gp.potion_unkn = 0;

    const retval = await peffects(otmp, state);
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
            trycall(otmp, state);
        }
    }
    useup(otmp);
    return ECMD_TIME;
}

// C ref: potion.c dodrink() (526-615). The #quaff command entry point.
//
// Fail-closed branches:
// - Strangled: the hero cannot drink while strangled.
// - Fountain, sink, underwater: the hero is not near these features on the
//   speed-potion path this slice ports.
// - Worn-potion (owornmask): splitobj/remove_worn_item for worn potions.
// - Milky potion: ghost_from_bottle().
// - Smoky potion: djinni_from_bottle().
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
    // guarded by !iflags.menu_requested (i.e. no 'm' prefix). Fail-closed
    // because the speed-potion validation path does not exercise any of them.
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
        // C ref: potion.c:552-554. Kitchen sink on the hero's square.
        if (IS_SINK(typ)) {
            throw new UnsupportedQuaffError('the sink prompt in dodrink()');
        }
        // C ref: potion.c:562-564. Surrounded by water.
        if (hero.uinwater && !hero.uswallow) {
            throw new UnsupportedQuaffError(
                'the underwater prompt in dodrink()');
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

    const otmp = await getobj('drink', drink_ok, GETOBJ_NOFLAGS, state);
    if (!otmp) return ECMD_CANCEL;

    // C ref: potion.c:591-598. If the potion is worn (owornmask nonzero),
    // split it off or remove it. Fail-closed because no ported path wears a
    // potion.
    if (otmp.owornmask) {
        throw new UnsupportedQuaffError(
            'the worn-potion splitobj/remove_worn_item branch in dodrink()');
    }
    otmp.in_use = true; // you've opened the stopper

    // C ref: potion.c:601-612. Milky and smoky potion occupant checks.
    // objdescr_is(otmp, s) compares OBJ_DESCR(objects[otmp->otyp]) with s.
    // Fail-closed: both call helpers this port has not reached.
    const descr = OBJ_DESCR(objectType(otmp, state), state);
    if (descr === 'milky') {
        throw new UnsupportedQuaffError('ghost_from_bottle()');
    }
    if (descr === 'smoky') {
        throw new UnsupportedQuaffError('djinni_from_bottle()');
    }

    return await dopotion(otmp, state);
}

// C ref: potion.c toggle_blindness() (336-364). Called by Blindf_on() and
// Blindf_off() after the blindness state has already changed. Forces a full
// vision rebuild and updates the monster display for heroes whose senses
// (telepathy, infravision, or Sting-glow) depend on the blind/sighted split.
//
// Fail-closed items:
// - Sting_effects(-1): fires only when the hero wields the artifact Sting.
//   The Stinging local is checked for the see_monsters() gate (the condition
//   is cheap and wrong to skip) but the Sting_effects() call itself is
//   refused, since no ported session wields that artifact.
export function toggle_blindness(state = game) {
    const hero = state.u;

    // C ref: potion.c:338. Stinging = (uwep && (EWarn_of_mon & W_WEP) != 0L).
    // True only when the hero wields the artifact Sting.
    const EWarn_of_mon = hero.uprops?.[WARN_OF_MON]?.extrinsic ?? 0;
    const Stinging = Boolean(state.uwep && (EWarn_of_mon & W_WEP));

    state.disp.botl = true;               // status conditions need update
    state.vision_full_recalc = 1;          // vision has changed
    vision_recalc(0, { state });

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
        see_monsters(state);

    // C ref: potion.c:359-360. Sting_effects(-1) resets the Sting glow/quiver
    // message to match the new blindness state. Fires only for artifact Sting.
    if (Stinging) {
        throw new UnsupportedPotionError('Sting_effects(-1)');
    }

    // C ref: potion.c:362-363. learn_unseen_invent() marks dknown on objects
    // the hero picked up while blind. Fires only when the hero regains sight.
    if (!heroIsBlind(state)) {
        learn_unseen_invent(state);
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

// C ref: potion.c potionhit() (1624-1928), "potion obj hits monster mon, which
// might be youmonst; obj always used up".
//
// Only the hero-target half is ported: the isyou branch (1633-1641), the
// evaporation line (1679-1681), the isyou object switch (1683-1705), and the
// potionbreathe()/trycall(), shop-billing and obfree() tail (1906-1927). A
// monster target -- and with it hit_saddle, the saddle switch and the
// twenty-arm monster switch -- refuses.
//
// `how` is one of obj.h's POTHIT_* codes; only the killer string reads it, and
// only the two throw codes can reach the ported branch.
export async function potionhit(mon, obj, how, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { d, rn2, rnd };
    const unsupported = rawEnv.unsupported;
    if (typeof unsupported !== 'function')
        throw new TypeError('potionhit requires an unsupported operation');
    const message = rawEnv.message ?? ttyPline;

    const botlnam = bottlename(state, random);
    const isyou = mon === state.youmonst;
    // C computes `your_fault` here for the monster branch's anger and kill
    // attribution; the hero branch never reads it.
    if (!isyou) return unsupported('a potion crashing on a monster');

    /* hit_saddle is FALSE for a hero target, so every test on it below is
       written out of the ported branch. */
    const tx = state.u.ux;
    const ty = state.u.uy;
    const distance = 0;
    await message(
        `The ${botlnam} crashes on your `
        + `${body_part(HEAD, state.youmonst)} and breaks into shards.`,
        state,
    );
    const crashDamage = Maybe_Half_Phys(random.rnd(2), state);
    if (crashDamage >= state.u.uhp)
        return unsupported('a fatal potion crash');
    await losehp(
        crashDamage,
        how === POTHIT_OTHER_THROW ? 'propelled potion' : 'thrown potion',
        KILLED_BY_AN,
        state,
    );

    /* oil doesn't instantly evaporate; Neither does a saddle hit */
    if (obj.otyp !== POT_OIL && cansee(tx, ty, state))
        await message(`${Tobjnam(obj, 'evaporate', state)}.`, state);

    switch (obj.otyp) {
    case POT_OIL:
        if (obj.lamplit)
            return unsupported('lit lamp oil exploding on the hero');
        break;
    case POT_POLYMORPH:
        return unsupported('a potion of polymorph crashing on the hero');
    case POT_ACID:
        if (!Acid_resistance(state)) {
            await message(
                `This burns${obj.blessed ? ' a little'
                    : obj.cursed ? ' a lot' : ''}!`,
                state,
            );
            const dmg = Maybe_Half_Phys(
                random.d(obj.cursed ? 2 : 1, obj.blessed ? 4 : 8),
                state,
            );
            if (dmg >= state.u.uhp)
                return unsupported('a fatal potion of acid crash');
            await losehp(dmg, 'potion of acid', KILLED_BY_AN, state);
        }
        break;
    default:
        /* every other type reaches the vapors with no direct effect */
        break;
    }

    /* Note: potionbreathe() does its own docall() */
    // `distance` is 0 for a hero target, so C's second disjunct -- the
    // rn2((1 + ACURR(A_DEX)) / 2) draw for a nearby monster target -- is
    // short-circuited away and spends nothing.
    if ((distance === 0)
        && (!breathless(state.youmonst.data)
            || haseyes(state.youmonst.data))) {
        await potionbreathe(obj, state, { ...rawEnv, state, random, message });
    } else if (obj.dknown && cansee(tx, ty, state)) {
        trycall(obj, state);
    }

    if (state.u.ushops && obj.unpaid)
        return unsupported('shop billing for a potion broken on the hero');
    obfree(obj, null, { ...rawEnv, state });
    return undefined;
}

// C ref: potion.c potionbreathe() (1931-2118), "vapors are inhaled or get in
// your eyes".
//
// The switch runs over `Half_gas_damage ? TOWEL : obj->otyp`, so a hero wearing
// a wet towel takes the TOWEL arm whatever the potion is. Of its eighteen case
// labels four are ported -- POT_INVISIBILITY (2033-2040), POT_PARALYSIS
// (2041-2051), POT_SLEEPING (2052-2064), and the shared POT_ACID/POT_POLYMORPH
// arm (2092-2095). The last three are the vapors a potion a monster hurls at
// the hero can raise; POT_CONFUSION and POT_BLINDNESS are the two hurled types
// still missing, and every other label stops by name before changing state,
// drawing, or printing.
//
// Nine potion types carry no case label at all and fall straight out of the
// switch to the naming tail. C's commented-out block at 2096-2105 names seven
// of them; POT_SEE_INVISIBLE and POT_ENLIGHTENMENT are absent from that comment
// but reach the same nothing, because the switch has no `default:`. Both are
// listed below, so this port falls through exactly where C does and refuses
// only where C has a body.
//
// `obj` stays in the caller's inventory: C sets in_use so that a wielded potion
// of unholy water cannot be dropped out from under maybe_destroy_item(), and
// restores it here. There is no obfree() -- zap.c:5919's comment says that is
// the caller's job.
export async function potionbreathe(obj, state = game, env = {}) {
    let kn = 0;
    const already_in_use = obj.in_use;
    const random = env.random ?? { rn2, rnd };
    // The hero's own turn writes straight to the terminal. potionhit() reaches
    // this from a monster's turn, whose planning clone must stay silent.
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
        throw new UnsupportedPotionError(
            'the wet towel that wards off a potion\'s vapors',
        );
    case POT_RESTORE_ABILITY:
    case POT_GAIN_ABILITY:
        throw new UnsupportedPotionError(
            'the ability vapors that sting the eyes or raise an attribute',
        );
    case POT_FULL_HEALING:
    case POT_EXTRA_HEALING:
    case POT_HEALING:
        throw new UnsupportedPotionError(
            'the healing vapors, over make_blinded() and make_deaf()',
        );
    case POT_SICKNESS:
        throw new UnsupportedPotionError('the sickness vapors that cost 5 HP');
    case POT_HALLUCINATION:
        throw new UnsupportedPotionError('the momentary vision');
    case POT_CONFUSION:
    case POT_BOOZE:
        throw new UnsupportedPotionError(
            'the dizzying vapors, over make_confused()',
        );
    case POT_INVISIBILITY:
        if (!heroIsBlind(state) && !Invis(state)) {
            kn++;
            await message(
                `For an instant you ${See_invisible(state)
                    ? 'could see right through yourself'
                    : "couldn't see yourself"}!`,
                state,
            );
        }
        break;
    case POT_PARALYSIS:
        kn++;
        if (!Free_action(state)) {
            // C's Something is "something" capitalized by the format.
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
            // C follows the yawn with monstseesu(M_SEEN_SLEEP), which records
            // the resistance on every monster that can see the hero. Nothing
            // in this port reads that record back for sleep yet.
            throw new UnsupportedPotionError(
                'the yawn that tells watching monsters the hero resists sleep',
            );
        }
        break;
    case POT_SPEED:
        throw new UnsupportedPotionError(
            'the speed vapors, over incr_itimeout(&HFast)',
        );
    case POT_BLINDNESS:
        throw new UnsupportedPotionError(
            'the blinding vapors, over make_blinded()',
        );
    case POT_WATER:
        throw new UnsupportedPotionError(
            'the water vapors, over split_mon() and you_were()',
        );
    case POT_ACID:
    case POT_POLYMORPH:
        await exercise(A_CON, false, state, random, {
            // exercise() runs encumber_msg() for A_CON once play has begun.
            encumberMessage: env.encumberMessage,
        });
        break;
    /*
     * C's own comment lists the first seven of these as the types whose
     * vapors deliberately do nothing. POT_SEE_INVISIBLE and POT_ENLIGHTENMENT
     * are not in that comment and have no case label either, so they reach the
     * same nothing.
     */
    case POT_GAIN_LEVEL:
    case POT_GAIN_ENERGY:
    case POT_LEVITATION:
    case POT_FRUIT_JUICE:
    case POT_MONSTER_DETECTION:
    case POT_OBJECT_DETECTION:
    case POT_OIL:
    case POT_SEE_INVISIBLE:
    case POT_ENLIGHTENMENT:
        break;
    default:
        throw new UnsupportedPotionError(
            `potionbreathe() for object type ${obj.otyp}`,
        );
    }

    if (!already_in_use)
        obj.in_use = false;
    /* note: no obfree() -- that's our caller's responsibility */
    if (obj.dknown) {
        // hack.h:1530 makeknown(x) is discover_object(x, TRUE, TRUE, TRUE).
        // `kn` counts the arms whose message told the hero what the potion
        // was; every other arm offers the naming prompt instead.
        if (kn) discover_object(obj.otyp, true, true, true, state, env);
        else trycall(obj, state);
    }
}

// C ref: potion.c healup() (1428-1458). Heals the hero's hit points and
// optionally cures sickness and blindness. nhp is the hit-point gain, nxtra
// is an extra max-HP boost when the hero is already at full HP, curesick and
// cureblind gate make_sick(0) and make_blinded(0) respectively.
export function healup(nhp, nxtra, curesick, cureblind, state = game) {
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
        // C clears u.ucreamed, calls make_blinded(0L, TRUE) and
        // make_deaf(0L, TRUE). Neither is ported. Refuse only mutable timed
        // blindness, cream, or timed deafness; a worn blindfold is extrinsic
        // and remains worn after C clears the intrinsic conditions.
        const timedBlindness = (u.uprops?.[BLINDED]?.intrinsic ?? 0) & TIMEOUT;
        const timedDeafness = (u.uprops?.[DEAF]?.intrinsic ?? 0) & TIMEOUT;
        if (u.ucreamed || timedBlindness || timedDeafness)
            throw new UnsupportedPotionError(
                'healup() cureblind arm over make_blinded() / make_deaf()',
            );
        // No-op: there is no intrinsic condition for C to clear.
    }
    if (curesick) {
        // C calls make_vomiting(0L, TRUE) and make_sick(0L, ...). Neither is
        // ported.
        throw new UnsupportedPotionError(
            'healup() curesick arm over make_vomiting() / make_sick()',
        );
    }
    state.disp = state.disp || {};
    state.disp.botl = true;
}
