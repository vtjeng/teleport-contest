// wield.js -- what the hero's hands are doing, plus the one question wield.c
// asks about a monster's hands.
// C refs: src/wield.c erodeable_wep(), will_weld(), TWOWEAPOK(), welded(),
// empty_handed(), mwelded(), can_twoweapon(), and dotwoweapon().
//
// wield.c set_twoweap() lives in js/worn.js beside setworn() and setnotworn(),
// the two callers that would otherwise make js/worn.js and this file import
// each other.

import {
    A_DEX, ECMD_FAIL, ECMD_OK, ECMD_TIME, GLIB, HAND, plur, Upolyd, W_WEP,
} from './const.js';
import { artifact_light } from './artifacts.js';
import { setwornEnv } from './do_wear.js';
import { effective_attribute } from './attrib.js';
import { makeplural } from './fruit.js';
import { game } from './gstate.js';
import { prinv, update_inventory } from './invent.js';
import {
    could_twoweap,
    humanoid,
    nohands,
    touch_petrifies,
    verysmall,
} from './mondata.js';
import {
    is_ammo,
    is_launcher,
    is_missile,
    is_weptool,
    objectType,
    set_bknown,
} from './obj.js';
import { is_plural, vtense, Yname2 } from './objnam.js';
import {
    AKLYS,
    BELL_OF_OPENING,
    CORPSE,
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    SILVER,
    TIN_OPENER,
    WEAPON_CLASS,
} from './objects.js';
import { body_part } from './polyself.js';
import { rnd } from './rng.js';
import { ttyPline } from './tty_message.js';
import {
    bimanual,
    set_twoweap,
    setuswapwep,
    setuwep,
} from './worn.js';

/**
 * A branch of wield.c can_twoweapon() this port does not own yet.  js/cmd.js
 * converts it into the retryable command boundary, which is sound because
 * both remaining branches are decided before the command prints a message,
 * changes a slot, or draws its rnd(20).
 */
export class UnsupportedTwoWeaponError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedTwoWeaponError';
    }
}

// C ref: wield.c erodeable_wep() (61-64), the macro will_weld() reads. Despite
// the name, it selects what a curse can weld to the hand rather than what
// rusts; C's own comment says the name should probably change.
function erodeable_wep(obj, state) {
    return obj.oclass === WEAPON_CLASS || is_weptool(obj, state)
        || obj.otyp === HEAVY_IRON_BALL || obj.otyp === IRON_CHAIN;
}

// C ref: wield.c will_weld() (66-68). The two ported callers are welded() and
// mwelded(), both below; C calls the macro from four more places in wield.c
// that are not ported yet.
export function will_weld(obj, state) {
    return Boolean(obj.cursed)
        && (erodeable_wep(obj, state) || obj.otyp === TIN_OPENER);
}

// C ref: wield.c TWOWEAPOK() (75-78), with its note at 71-74. To be
// dual-wielded an item must be a weapon that is neither a launcher, ammunition
// nor a missile, or else a weapon-tool. Empty hands and two-handed weapons are
// can_twoweapon()'s business, not this macro's.
function TWOWEAPOK(obj, state) {
    return obj.oclass === WEAPON_CLASS
        ? !(is_launcher(obj, state) || is_ammo(obj, state)
            || is_missile(obj, state))
        : is_weptool(obj, state);
}

// youprop.h:112 defines Glib as the bare intrinsic field, so slippery fingers
// have no extrinsic source to consult. do_wear.c cursed() reads it too.
export function Glib(state) {
    return Boolean(state.u?.uprops?.[GLIB]?.intrinsic);
}

// C ref: wield.c can_twoweapon() (760-804). Answers whether the hero may
// dual-wield, printing the reason she may not. Five of its eight refusal arms
// and its success path at 802 are complete; the two arms below stop, each
// because reaching what C does there needs a subsystem this port has not
// ported, and neither can be reached from any input it accepts.
//
// wield.c:791-793 refuses an artifact in the secondary slot with
// Yobjnam2(uswapwep, "resist"), and objnam.c yobjnam() under it is not ported;
// weldmsg() below stops at the same pair. No input reaches the arm in any
// case: u_init.c:1315 calls mksobj() with artif FALSE, so no role starts with
// an artifact in either hand, and wield.c dowield() is unported, so nothing
// puts one there later.
//
// wield.c:797-801 sets uswapwep's bknown and drops it through
// drop_uswapwep() (808-831). Two things there are still missing. Its three
// messages are built with objnam.c Yobjnam2() and yobjnam(), neither of which
// is ported, and it hands dropx() an object that is still in the secondary
// slot, which do.c preflight_dropx() refuses as worn or attached -- so
// dropz()'s own three slot clears at do.c:809-814, inert while every admitted
// object is already out of its slot, would have to become live. Nor can either
// condition arise, because u_init.c:1223 clears cursed on every starting
// object and nothing in the port grants Glib.
//
// wield.c:794-796, the CORPSE arm, is absent rather than stopped. Its own
// comment records that the !TWOWEAPOK() test above prevents ever reaching it,
// and the reason holds here too: a corpse is FOOD_CLASS, so TWOWEAPOK() falls
// through to obj.h is_weptool(), which demands TOOL_CLASS and so answers
// FALSE two arms earlier.
export async function can_twoweapon(state = game) {
    const uwep = state.uwep;
    const uswapwep = state.uswapwep;
    let otmp;

    if (!could_twoweap(state.youmonst?.data)) {
        if (Upolyd(state.u)) {
            await ttyPline(
                "You can't use two weapons in your current form.", state,
            );
        } else {
            // role.c names each role in the male form and, for the three
            // roles that have one, the female form as well.
            const role = state.urole;
            const roleName = (state.flags.female && role.name.f)
                ? role.name.f : role.name.m;
            await ttyPline(
                `${makeplural(roleName)} aren't able to use two weapons`
                + ' at once.', state,
            );
        }
    } else if (!uwep || !uswapwep) {
        let hand_s = body_part(HAND, state.youmonst);

        if (!uwep && !uswapwep)
            hand_s = makeplural(hand_s);
        /* "your hands are empty" or "your {left|right} hand is empty" */
        await ttyPline(
            `Your ${uwep ? 'left ' : uswapwep ? 'right ' : ''}${hand_s} `
            + `${vtense(hand_s, 'are')} empty.`, state,
        );
    } else if (!TWOWEAPOK(uwep, state) || !TWOWEAPOK(uswapwep, state)) {
        otmp = !TWOWEAPOK(uwep, state) ? uwep : uswapwep;
        await ttyPline(
            `${Yname2(otmp, state)} `
            + `${is_plural(otmp) ? "aren't" : "isn't a"} suitable `
            + `${(otmp === uwep) ? 'primary' : 'secondary'} `
            + `weapon${plur(otmp.quan)}.`, state,
        );
    } else if (bimanual(uwep, state) || bimanual(uswapwep, state)) {
        otmp = bimanual(uwep, state) ? uwep : uswapwep;
        await ttyPline(`${Yname2(otmp, state)} isn't one-handed.`, state);
    } else if (state.uarms) {
        await ttyPline(
            "You can't use two weapons while wearing a shield.", state,
        );
    } else if (uswapwep.oartifact) {
        throw new UnsupportedTwoWeaponError(
            "can_twoweapon()'s artifact refusal (wield.c:791-793)",
        );
    } else if (Glib(state) || uswapwep.cursed) {
        throw new UnsupportedTwoWeaponError(
            "can_twoweapon()'s slippery-or-cursed refusal (wield.c:797-801)",
        );
    } else {
        return true;
    }
    return false;
}

// C ref: wield.c dotwoweapon() (843-864), the #twoweapon command.
//
// Turning two-weapon combat off always succeeds and always costs nothing.
// Turning it on has to pass can_twoweapon() first, and then one draw settles
// the whole time cost: ACURR(A_DEX) is the hero's current Dexterity, so a
// nimble hero usually switches for free. A refused switch spends no move
// either, because can_twoweapon() answering FALSE falls through to ECMD_OK.
export async function dotwoweapon(state = game) {
    /* You can always toggle it off */
    if (state.u.twoweap) {
        await ttyPline('You switch to your primary weapon.', state);
        set_twoweap(false, state); /* u.twoweap = FALSE */
        update_inventory({ state });
        return ECMD_OK;
    }

    /* May we use two weapons? */
    if (await can_twoweapon(state)) {
        /* Success! */
        await ttyPline('You begin two-weapon combat.', state);
        set_twoweap(true, state); /* u.twoweap = TRUE */
        update_inventory({ state });
        return (rnd(20) > effective_attribute(state, A_DEX))
            ? ECMD_TIME : ECMD_OK;
    }
    return ECMD_OK;
}

// C ref: wield.c welded() (1050-1058). Answers whether the wielded weapon has
// stuck to the hero's hand, and teaches her it is cursed when it has.
export function welded(obj, state = game, env = {}) {
    if (obj && obj === state.uwep && will_weld(obj, state)) {
        set_bknown(obj, 1, { ...env, state });
        return 1;
    }
    return 0;
}

// C ref: wield.c empty_handed(). Describes hands that hold no weapon; the ^X
// attributes window and the wield messages share the wording.
export function empty_handed(state = game) {
    return state.uarmg ? 'empty handed' /* gloves imply hands */
        : humanoid(state.youmonst?.data ?? state.mons[state.u.umonnum])
            /* hands but no weapon and no gloves */
            ? 'bare handed'
            /* alternate phrasing for paws or lack of hands */
            : 'not wielding anything';
}

// C ref: wield.c mwelded() (1077-1084). The monster-side counterpart of
// welded(): it asks the same question of a monster's wielded weapon, and
// teaches nobody anything, because a monster has no bknown to set.
export function mwelded(obj, state = game) {
    return Boolean(obj && (obj.owornmask & W_WEP) && will_weld(obj, state));
}

// ── the hero changes weapons ──
//
// C ref: wield.c ready_weapon() (168-273) and doswapweapon() (459-501).
// dothrow.c dofire() queues doswapweapon() when the ammunition in the quiver
// matches the launcher in the secondary slot, so the swap is what puts the
// launcher in the hero's hand before the shot.

// A branch of wield.c this port has not translated. js/cmd.js
// failClosedCommandRefusals() lists it, so the segment keeps every frame the
// command already matched instead of failing hard.
export class UnsupportedWieldError extends Error {
    constructor(what) {
        super(`wield.c reached ${what}`);
        this.name = 'UnsupportedWieldError';
        this.what = what;
    }
}

// C ref: mondata.h:123 cantwield().
export function cantwield(species) {
    return nohands(species) || verysmall(species);
}

// C ref: wield.c:80-82, the two shared message tails.
const are_no_longer_twoweap = 'are no longer using two weapons at once';
const can_no_longer_twoweap = 'can no longer wield two weapons at once';

// C ref: wield.c weldmsg() (1060-1074). Its message needs objnam.c
// Yobjnam2(), which is yobjnam() over shk_your(); neither is ported, and
// js/do.js dropx() already stops at this same function for the same reason.
async function weldmsg(obj, state) {
    void obj;
    void state;
    throw new UnsupportedWieldError('weldmsg()');
}

// C ref: wield.c untwoweapon() (905-914).
export async function untwoweapon(state = game) {
    if (state.u.twoweap) {
        await ttyPline(`You ${can_no_longer_twoweap}.`, state);
        set_twoweap(false, state); /* u.twoweap = FALSE */
        update_inventory({ state });
    }
}

// C ref: artifact.c retouch_object() (2508-2591), reduced to the answer it
// gives for an object the hero can handle. touch_artifact() returns 1 at once
// for a non-artifact (artifact.c:914-915), and `ag` and `bane` are then both
// false, so the function returns 1 without touching anything. Every other
// object stops: the invocation bell, an artifact, and an item of silver in the
// hands of a silver-hater each reach a branch that can blast the hero, drop
// the item, or kill her.
function retouchOrdinaryObject(obj, state) {
    if (obj.oartifact) throw new UnsupportedWieldError('touch_artifact()');
    if (obj.otyp === BELL_OF_OPENING)
        throw new UnsupportedWieldError('the invocation bell');
    if (objectType(obj, state).oc_material === SILVER)
        throw new UnsupportedWieldError('handling silver');
    return true;
}

// C ref: wield.c ready_weapon() (168-273). "Separated function so swapping
// works easily": puts `wep` in the hero's hand and reports what happened,
// ECMD_TIME on every path that spends the turn.
//
// Four branches stop. A cockatrice corpse wielded bare-handed reaches
// instapetrify(); a two-handed weapon under a shield, an artifact that speaks,
// and an artifact that lights up each need a subsystem this port does not
// have. The bottom-line test at 270-271 is C's, and its condition never
// holds: condtests[bl_bareh] is an opt-in status condition that botl.c leaves
// disabled, so a hero who goes from armed to empty-handed marks nothing here.
// setworn(), which setuwep() calls, is what actually marks the status line.
export async function ready_weapon(wep, state = game) {
    /* Separated function so swapping works easily */
    let res = ECMD_OK;
    const was_twoweap = state.u.twoweap;

    if (!wep) {
        /* No weapon */
        if (state.uwep) {
            await ttyPline(`You are ${empty_handed(state)}.`, state);
            setuwep(null, setwornEnv(state));
            res = ECMD_TIME;
        } else {
            await ttyPline(`You are already ${empty_handed(state)}.`, state);
        }
    } else if (wep.otyp === CORPSE && cant_wield_corpse(wep, state)) {
        /* hero must have been life-saved to get here; use a turn */
        res = ECMD_TIME; /* corpse won't be wielded */
    } else if (state.uarms && bimanual(wep, state)) {
        throw new UnsupportedWieldError('a two-handed weapon under a shield');
    } else if (!retouchOrdinaryObject(wep, state)) {
        res = ECMD_TIME; /* takes a turn even though it doesn't get wielded */
    } else {
        /* Weapon WILL be wielded after this point */
        res = ECMD_TIME;
        if (will_weld(wep, state)) {
            throw new UnsupportedWieldError('a cursed weapon welding itself');
        } else {
            /* The message must say "weapon in hand", so give the object the
               mask doname() reads before printing and take it away again. */
            const dummy = wep.owornmask;

            wep.owornmask |= W_WEP;
            if (wep.otyp === AKLYS && (wep.owornmask & W_WEP) !== 0)
                await ttyPline('You secure the tether.', state);
            await prinv(null, wep, 0, { state });
            wep.owornmask = dummy;
        }

        setuwep(wep, setwornEnv(state));
        if (was_twoweap && !state.u.twoweap && state.flags.verbose) {
            /* skip this message if we already got "empty handed" one above */
            if (state.uwep) {
                await ttyPline(
                    `You ${(TWOWEAPOK(state.uwep, state)
                        && !bimanual(state.uwep, state))
                        ? are_no_longer_twoweap
                        : can_no_longer_twoweap}.`,
                    state,
                );
            }
        }

        /* KMH -- Talking artifacts are finally implemented */
        if (wep.oartifact) {
            throw new UnsupportedWieldError('arti_speak()');
        }

        if (artifact_light(wep) && !wep.lamplit) {
            throw new UnsupportedWieldError('an artifact that begins to shine');
        }
        if (wep.unpaid) {
            throw new UnsupportedWieldError('wielding unpaid merchandise');
        }
    }
    return res;
}

// C ref: wield.c cant_wield_corpse() (137-153). Every hero this port reaches
// answers FALSE at the first test; the arm past it kills her.
function cant_wield_corpse(obj, state) {
    if (state.uarmg || obj.otyp !== CORPSE
        || !touch_petrifies(state.mons[obj.corpsenm])) {
        return false;
    }
    /* Stone_resistance, C's fourth disjunct, has no ported reader; a hero who
       has it would answer FALSE here too, so stopping is never wrong. */
    throw new UnsupportedWieldError('instapetrify()');
}

// C ref: wield.c doswapweapon() (459-501), the #swap command. Exchanges the
// primary and secondary weapon slots and describes both.
//
// gm.multi is zeroed by assignment rather than through nomul(), which matters
// now that the command queue exists: nomul() ends with cmdq_clear(CQ_CANNED),
// so routing this through it would discard the dofire() that queued the swap.
export async function doswapweapon(state = game) {
    /* May we attempt this? */
    state.multi = 0;
    if (cantwield(state.youmonst?.data ?? state.mons[state.u.umonnum])) {
        await ttyPline("Don't be ridiculous!", state);
        return ECMD_FAIL;
    }
    if (welded(state.uwep, state)) {
        await weldmsg(state.uwep, state);
        return ECMD_FAIL;
    }

    /* Unwield your current secondary weapon */
    const oldwep = state.uwep ?? null;
    const oldswap = state.uswapwep ?? null;
    setuswapwep(null, setwornEnv(state));

    /* Set your new primary weapon */
    const result = await ready_weapon(oldswap, state);

    /* Set your new secondary weapon */
    if ((state.uwep ?? null) === oldwep) {
        /* Wield failed for some reason */
        setuswapwep(oldswap, setwornEnv(state));
    } else {
        setuswapwep(oldwep, setwornEnv(state));
        if (state.uswapwep)
            await prinv(null, state.uswapwep, 0, { state });
        else
            await ttyPline('You have no secondary weapon readied.', state);
    }

    if (state.u.twoweap && !await can_twoweapon(state))
        await untwoweapon(state);

    return result;
}
