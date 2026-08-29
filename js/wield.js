// wield.js -- what the hero's hands are doing, plus the one question wield.c
// asks about a monster's hands.
// C refs: src/wield.c erodeable_wep(), will_weld(), TWOWEAPOK(), welded(),
// empty_handed(), mwelded(), wield_tool(), can_twoweapon(), dotwoweapon(),
// uwepgone(), and uswapwepgone().
//
// wield.c set_twoweap() lives in js/worn.js beside setworn() and setnotworn(),
// the two callers that would otherwise make js/worn.js and this file import
// each other.

import {
    A_DEX,
    ECMD_CANCEL,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    GETOBJ_ALLOWCNT,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    GLIB,
    HAND,
    plur,
    Upolyd,
    W_ACCESSORY,
    W_ARMOR,
    W_SADDLE,
    W_WEP,
} from './const.js';
import {
    artifact_light,
    arti_speak,
    touch_artifact,
} from './artifacts.js';
import { reset_remarm, setwornEnv } from './do_wear.js';
import { effective_attribute } from './attrib.js';
import { makeplural } from './fruit.js';
import { game } from './gstate.js';
import { strstri } from './hacklib.js';
import {
    addinv_nomerge,
    freeinv,
    getobj,
    hands_obj,
    prinv,
    update_inventory,
} from './invent.js';
import {
    could_twoweap,
    humanoid,
    nohands,
    touch_petrifies,
    verysmall,
} from './mondata.js';
import {
    ammo_and_launcher,
    clear_splitobjs,
    is_ammo,
    is_launcher,
    is_missile,
    is_wet_towel,
    is_weptool,
    objectType,
    set_bknown,
} from './obj.js';
import {
    donameFresh,
    is_plural,
    vtense,
    xnameFresh,
    Yname2,
} from './objnam.js';
import {
    AKLYS,
    BELL_OF_OPENING,
    COIN_CLASS,
    CORPSE,
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    MAGIC_LAMP,
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
    setuqwep,
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

// C ref: artifact.c retouch_object() (2508-2591). touch_artifact() is the
// first gate: it returns true at once for a non-artifact (artifact.c:914-915),
// and can blast the hero or refuse an aligned artifact, both of which stop
// here. When touch succeeds, the function checks `ag` (silver + Hate_silver)
// and `bane` (bane_applies against the hero). Neither can hold for a hero who
// does not Hate_silver and whom no artifact bane targets, so retouch_object
// returns 1 without touching anything. The invocation bell has its own guard
// at the top of C's function.
//
// Hate_silver is not ported as a predicate: no ported race hates silver and
// nothing in the port grants the property. Objects whose material is silver
// still stop if they are NOT artifacts, because then touch_artifact's early
// return bypasses the ag/bane check, and retouch_object's own ag check would
// be the next live code; it stays unported.
function retouchOrdinaryObject(obj, state) {
    if (obj.otyp === BELL_OF_OPENING)
        throw new UnsupportedWieldError('the invocation bell');
    if (obj.oartifact) {
        // For an artifact, touch_artifact() may spend rn2(4) and may throw
        // on a blast. When it succeeds, the function checks ag (silver +
        // Hate_silver) and bane (bane_applies against the hero). No ported
        // race hates silver, and no artifact bane targets a human, so both
        // are false and retouch_object returns 1.
        if (!touch_artifact(obj, state.youmonst, state)) {
            // C's retouch_object() removes the worn item and optionally
            // drops it; both need remove_worn_item() and dropx().
            throw new UnsupportedWieldError(
                'retouch_object() after touch_artifact() refused',
            );
        }
        return true;
    }
    // Non-artifact: touch_artifact() returns true at once for a non-artifact
    // (artifact.c:914-915), and ag/bane are both false. The only remaining
    // check is silver material and Hate_silver; no ported race hates silver.
    if (objectType(obj, state).oc_material === SILVER)
        throw new UnsupportedWieldError('handling silver (non-artifact)');
    return true;
}

// C ref: wield.c ready_weapon() (168-273). "Separated function so swapping
// works easily": puts `wep` in the hero's hand and reports what happened,
// ECMD_TIME on every path that spends the turn.
//
// Three branches stop. A cockatrice corpse wielded bare-handed reaches
// instapetrify(); a two-handed weapon under a shield; and an artifact that
// lights up (Sunsword). The arti_speak() path is ported for its early return
// (no SPFX_SPEAK), and the speaking case stops. The bottom-line test at
// 270-271 is C's, and its condition never holds: condtests[bl_bareh] is an
// opt-in status condition that botl.c leaves disabled, so a hero who goes
// from armed to empty-handed marks nothing here. setworn(), which setuwep()
// calls, is what actually marks the status line.
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
            res |= arti_speak(wep, state);
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

// C ref: wield.c ready_ok() (291-327). Null represents the '-' choice.
// Wielded singleton stacks, unmatched ammunition, launchers, and ordinary
// nonweapons stay selectable but are downplayed; stacks that can split,
// matched ammunition, other weapons, and coins are suggested.
export function ready_ok(obj, state = game) {
    if (!obj)
        return state.uquiver ? GETOBJ_SUGGEST : GETOBJ_DOWNPLAY;

    if (obj === state.uwep
        || (obj === state.uswapwep && state.u?.twoweap)) {
        return obj.quan === 1 ? GETOBJ_DOWNPLAY : GETOBJ_SUGGEST;
    }
    if (is_ammo(obj, state)) {
        return ((state.uwep
                && ammo_and_launcher(obj, state.uwep, state))
            || (state.uswapwep
                && ammo_and_launcher(obj, state.uswapwep, state)))
            ? GETOBJ_SUGGEST
            : GETOBJ_DOWNPLAY;
    }
    if (is_launcher(obj, state)) return GETOBJ_DOWNPLAY;
    if (obj.oclass === WEAPON_CLASS || obj.oclass === COIN_CLASS)
        return GETOBJ_SUGGEST;
    return GETOBJ_DOWNPLAY;
}

// C ref: wield.c wield_ok() (330-343), the getobj callback for #wield.
// Coins are excluded, weapons and weapon-tools are suggested, and everything
// else is downplayed (the hero can wield anything). Null (the "-" hands
// choice) is suggested, because wielding nothing is a valid deliberate act.
function wield_ok(obj, state) {
    if (!obj)
        return GETOBJ_SUGGEST;

    if (obj.oclass === COIN_CLASS)
        return GETOBJ_EXCLUDE;

    if (obj.oclass === WEAPON_CLASS || is_weptool(obj, state))
        return GETOBJ_SUGGEST;

    return GETOBJ_DOWNPLAY;
}

// C ref: wield.c finish_splitting() (345-351). When getobj() answers a
// partial stack (the hero typed a count), the child has no invlet of its own
// yet. freeinv() removes it from the chain; addinv_nomerge() assigns a fresh
// invlet and re-inserts without trying to merge it back.
function finish_splitting(obj, state) {
    freeinv(obj, { state });
    addinv_nomerge(obj, { state });
}

// C ref: wield.c dowield() (354-457), the #wield command. Prompts the hero
// for an object, handles conflicts with worn/quivered/swapped slots, and
// calls ready_weapon() to put it in the hand.
//
// Several branches stop. Choosing the quivered weapon when the quiver holds a
// stack invokes ynq() and setuqwep(), both of which reach unported subsystems.
// Choosing a worn item refuses with "You cannot wield that!" only when the
// item is armor, an accessory or a saddle, which is the full list of
// wornmasks the C function tests at 443. The objsplit arms that handle a
// counted selection (the hero typed a digit at the getobj prompt) stop because
// getobj() itself stops at the count path.
export async function dowield(state = game) {
    /* May we attempt this? */
    state.multi = 0;
    if (cantwield(state.youmonst?.data ?? state.mons[state.u.umonnum])) {
        await ttyPline("Don't be ridiculous!", state);
        return ECMD_FAIL;
    }
    /* Keep going even if inventory is completely empty, since wielding '-'
       to wield nothing can be construed as a positive act even when done
       so redundantly. */

    /* Prompt for a new weapon */
    clear_splitobjs(state);
    let wep = await getobj(
        'wield', (o) => wield_ok(o, state),
        GETOBJ_PROMPT | GETOBJ_ALLOWCNT, state,
    );
    if (!wep) {
        /* Cancelled */
        return ECMD_CANCEL;
    }
    if (wep === state.uwep) {
        await ttyPline('You are already wielding that!', state);
        if (is_weptool(wep, state) || is_wet_towel(wep))
            state.unweapon = false; /* [see setuwep()] */
        return ECMD_FAIL;
    }
    if (welded(state.uwep, state)) {
        await weldmsg(state.uwep, state);
        /* previously interrupted armor removal mustn't be resumed */
        reset_remarm(state);
        /* if player chose a partial stack but can't wield it, undo split */
        const split = state.context?.objsplit;
        if (wep.o_id && split && wep.o_id === split.child_oid)
            throw new UnsupportedWieldError('unsplitobj() after welded');
        return ECMD_FAIL;
    }
    if (wep.o_id && state.context?.objsplit
        && wep.o_id === state.context.objsplit.child_oid) {
        // The counted-selection path: getobj returned a partial stack.
        // getobj() itself stops at the count path, so this is unreachable.
        throw new UnsupportedWieldError('objsplit child in dowield');
    }

    /* Handle no object, or object in other slot */
    if (wep === hands_obj) {
        wep = null;
    } else if (wep === state.uswapwep) {
        return doswapweapon(state);
    } else if (wep === state.uquiver) {
        // The quiver path offers to split stacked quivered ammo through
        // ynq(), which is not ported in this form. Stop here.
        throw new UnsupportedWieldError('wielding the quivered weapon');
    } else if (wep.owornmask & (W_ARMOR | W_ACCESSORY | W_SADDLE)) {
        await ttyPline('You cannot wield that!', state);
        return ECMD_FAIL;
    }

    /* Set your new primary weapon */
    const oldwep = state.uwep ?? null;
    const result = await ready_weapon(wep, state);
    if (state.flags.pushweapon && oldwep && (state.uwep ?? null) !== oldwep)
        setuswapwep(oldwep, setwornEnv(state));
    await untwoweapon(state);

    return result;
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

// C ref: wield.c dowieldquiver() (503-506), the #quiver command.
export async function dowieldquiver(state = game) {
    return doquiver_core('ready', state);
}

// C ref: wield.c doquiver_core() (509-668), through the queued hands_obj arm
// at 532-544. The ordinary-item branches remain fail-closed below: they split
// stacks, negotiate weapon slots, or refill #fire and belong to later slices.
export async function doquiver_core(verb, state = game) {
    state.multi = 0;
    if (!state.invent) {
        await ttyPline('You have nothing to ready for firing.', state);
        return ECMD_OK;
    }

    clear_splitobjs(state);
    const newquiver = await getobj(
        verb, (obj) => ready_ok(obj, state),
        GETOBJ_PROMPT | GETOBJ_ALLOWCNT, state,
    );

    if (!newquiver)
        return ECMD_CANCEL;
    if (newquiver === hands_obj) {
        if (state.uquiver) {
            await ttyPline('You now have no ammunition readied.', state);
            setuqwep(null, setwornEnv(state));
        } else {
            await ttyPline('You already have no ammunition readied!', state);
        }
        return ECMD_OK;
    }

    throw new UnsupportedWieldError(
        'doquiver_core() with an ordinary inventory item',
    );
}

// C ref: wield.c wield_tool() (683-758), restricted to the ordinary unworn,
// unwelded lamp path reached by apply.c dorub(). The guards below keep the
// worn, welded, unable-to-wield, shield, quiver, alternate-weapon,
// self-welding, pushweapon, and two-weapon arms fail-closed before they print
// or change an equipment slot.
export async function wield_tool(obj, verb, state = game) {
    if (state.uwep && obj === state.uwep)
        throw new UnsupportedWieldError('wield_tool() with uwep');
    if (obj.otyp !== MAGIC_LAMP) {
        throw new UnsupportedWieldError(
            'wield_tool() with a non-magic lamp',
        );
    }

    if (!verb) verb = 'wield';
    const what = xnameFresh(obj, state);
    const moreThanOne = obj.quan > 1
        || strstri(what, 'pair of ') >= 0
        || strstri(what, 's of ') >= 0;

    if (obj.owornmask & (W_ARMOR | W_ACCESSORY)) {
        throw new UnsupportedWieldError(
            `wield_tool() ${verb} with a worn ${moreThanOne ? 'stack' : 'item'}`,
        );
    }
    if (state.uwep && will_weld(state.uwep, state))
        throw new UnsupportedWieldError('wield_tool() with welded uwep');
    if (cantwield(state.youmonst?.data ?? state.mons[state.u.umonnum]))
        throw new UnsupportedWieldError('wield_tool() without wielding hands');
    if (state.uarms && bimanual(obj, state)) {
        throw new UnsupportedWieldError(
            'wield_tool() with a two-handed object and shield',
        );
    }
    if (state.uquiver === obj)
        throw new UnsupportedWieldError('wield_tool() with uquiver');
    if (state.uswapwep === obj)
        throw new UnsupportedWieldError('wield_tool() with uswapwep');
    if (will_weld(obj, state))
        throw new UnsupportedWieldError('wield_tool() with a welding object');

    const oldwep = state.uwep ?? null;
    if (state.flags.pushweapon && oldwep)
        throw new UnsupportedWieldError('wield_tool() with pushweapon');
    if (state.u.twoweap)
        throw new UnsupportedWieldError('wield_tool() during two-weapon combat');

    await ttyPline(`You now wield ${donameFresh(obj, state)}.`, state);
    setuwep(obj, setwornEnv(state));
    if (obj.oclass !== WEAPON_CLASS)
        state.unweapon = true;
    return true;
}

// C ref: wield.c uwepgone() (873-885). Clear the primary weapon slot. Called
// when the item is eaten, stolen, burned, rotted, or force-dropped (polymorph).
// Handles artifact-light extinguishing, clears the slot via setuwep(null), and
// refreshes inventory.
export function uwepgone(env = {}) {
    const state = env.state ?? game;
    if (state.uwep) {
        // C: if (artifact_light(uwep) && uwep->lamplit) end_burn + message.
        // The dragon-HP slice exercises a magic lamp, which is not
        // artifact_light. The full artifact-light path needs end_burn hooks
        // (deleteObjectLightSource) that polyself does not wire. Fail-closed
        // so a future caller with an artifact weapon gets a clear error.
        if (artifact_light(state.uwep) && state.uwep.lamplit) {
            throw new Error(
                'uwepgone: artifact-light extinguishing not wired '
                + '(needs end_burn + Tobjnam message)',
            );
        }
        // setuwep(null) calls setworn(null, W_WEP) and sets unweapon = true,
        // matching C's setworn(NULL, W_WEP) + gu.unweapon = TRUE.
        setuwep(null, setwornEnv(state));
        update_inventory({ state });
    }
}

// C ref: wield.c uswapwepgone() (888-894). Clear the secondary weapon slot.
export function uswapwepgone(env = {}) {
    const state = env.state ?? game;
    if (state.uswapwep) {
        setuswapwep(null, setwornEnv(state));
        update_inventory({ state });
    }
}
