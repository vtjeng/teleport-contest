// potion.js -- quaffing and vapor effects for potions.
// C ref: src/potion.c dodrink() (526-615), drink_ok() (505-521),
//        dopotion() (618-641), peffects() (1333-1425),
//        peffect_speed() (1052-1070), peffect_oil() (1259-1294),
//        speed_up() (2918-2928),
//        itimeout/itimeout_incr/set_itimeout/incr_itimeout (55-86),
//        potionbreathe() (1931-2118), toggle_blindness() (336-364).
//
// dodrink() is the #quaff command entry point. Branches for strangled,
// fountain/sink, underwater, worn-potion, milky/smoky are fail-closed;
// the common path calls getobj() -> dopotion() -> peffects().
//
// peffects() dispatches 26 potion types; POT_SPEED (with spell alias
// SPE_HASTE_SELF) and POT_OIL are ported. The other 24 arms throw
// UnsupportedQuaffError.
//
// toggle_blindness() is called by Blindf_on() and Blindf_off() when blindness
// status changes. It forces a full vision rebuild and updates monster display.

import {
    A_DEX,
    A_WIS,
    BLINDED,
    DEAF,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FACE,
    FAST,
    FROMOUTSIDE,
    HALLUC,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_NONINVENT,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    INFRAVISION,
    INTRINSIC,
    INVIS,
    IS_FOUNTAIN,
    IS_SINK,
    KILLED_BY,
    LEG,
    SEE_INVIS,
    STRANGLED,
    TELEPAT,
    TIMEOUT,
    Upolyd,
    WARN_OF_MON,
    WOUNDED_LEGS,
    W_WEP,
} from './const.js';
import { exercise } from './attrib.js';
import { see_monsters } from './display.js';
import { heal_legs, trycall } from './do.js';
import { more_experienced } from './exper.js';
import { makeplural } from './fruit.js';
import { game } from './gstate.js';
import { losehp } from './hack.js';
import { getobj, learn_unseen_invent, useup } from './invent.js';
import { likes_fire } from './mondata.js';
import { bcsign, objectType } from './obj.js';
import { discover_object } from './o_init.js';
import { body_part } from './polyself.js';
import { d, rn1 } from './rng.js';
import { burn_away_slime } from './timeout.js';
import { vision_recalc } from './vision.js';
import { Cold_resistance, Fire_resistance } from './zap.js';
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
// ported: the 24 potion types besides POT_SPEED and POT_OIL, and the
// strangled, fountain, sink, underwater, worn-potion, milky and smoky
// branches of dodrink().
export class UnsupportedQuaffError extends Error {
    constructor(reason) {
        super(`quaffing requires ${reason}`);
        this.name = 'UnsupportedQuaffError';
        this.reason = reason;
    }
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
        throw new UnsupportedQuaffError('peffect_sickness()');
    case POT_CONFUSION:
        throw new UnsupportedQuaffError('peffect_confusion()');
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
        // C ref: potion.c:542-544. Fountain on the hero's square.
        const typ = state.level.at(hero.ux, hero.uy).typ;
        if (IS_FOUNTAIN(typ)) {
            throw new UnsupportedQuaffError(
                'the fountain prompt in dodrink()');
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

// C ref: youprop.h:405 Half_gas_damage, "wrap it round your head to ward off
// noxious fumes [we require it to be damp or wet]". It is the one property
// here with no u.uprops slot: a worn towel with charges left, and nothing else.
function Half_gas_damage(state) {
    return Boolean(state.ublindf && state.ublindf.otyp === TOWEL
        && state.ublindf.spe > 0);
}

// C ref: potion.c potionbreathe() (1931-2118), "vapors are inhaled or get in
// your eyes".
//
// The switch runs over `Half_gas_damage ? TOWEL : obj->otyp`, so a hero wearing
// a wet towel takes the TOWEL arm whatever the potion is. Of its eighteen case
// labels only POT_INVISIBILITY (2033-2040) is ported; every other one stops by
// name before changing state, drawing, or printing.
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
            await ttyPline(
                `For an instant you ${See_invisible(state)
                    ? 'could see right through yourself'
                    : "couldn't see yourself"}!`,
                state,
            );
        }
        break;
    case POT_PARALYSIS:
        throw new UnsupportedPotionError(
            'the paralysing vapors, over nomul() and Free_action',
        );
    case POT_SLEEPING:
        throw new UnsupportedPotionError(
            'the sleeping vapors, over nomul() and monstseesu()',
        );
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
        throw new UnsupportedPotionError(
            'the acid or polymorph vapors, over exercise(A_CON, FALSE)',
        );
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
