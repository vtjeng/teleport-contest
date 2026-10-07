// wield.js -- what the hero's hands are doing, plus the one question wield.c
// asks about a monster's hands.
// C refs: src/wield.c erodeable_wep(), will_weld(), TWOWEAPOK(), welded(),
// empty_handed(), mwelded(), wield_tool(), can_twoweapon(), dotwoweapon(),
// uwepgone(), uswapwepgone(), and uqwepgone().
//
// wield.c set_twoweap() lives in js/worn.js beside setworn() and setnotworn(),
// the two callers that would otherwise make js/worn.js and this file import
// each other.

import {
    A_DEX,
    COST_DECHNT,
    COST_DEGRD,
    CXN_PFX_THE,
    RIGHT_HANDED,
    HALLUC_RES,
    OBJ_FREE,
    OBJ_INVENT,
    BLINDED,
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
    HALLUC,
    has_oname,
    plur,
    Upolyd,
    W_ACCESSORY,
    W_ARMOR,
    W_SADDLE,
    W_WEP,
} from './const.js';
import {
    ART_MAGICBANE,
    artifact_light,
    arti_speak,
    is_art,
    restrict_name,
    retouch_object,
    Stone_resistance,
} from './artifacts.js';
import { reset_remarm, setwornEnv } from './do_wear.js';
import { acurr, exercise } from './attrib.js';
import { makeplural } from './fruit.js';
import { game } from './gstate.js';
import { inv_cnt } from './hack.js';
import { strstri } from './hacklib.js';
import { hcolor } from './do_name.js';
import {
    addinv_nomerge,
    freeinv,
    getobj,
    hands_obj,
    prinv,
    update_inventory,
} from './invent.js';
import { encumber_msg } from './pickup.js';
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
    is_boots,
    is_gloves,
    is_launcher,
    is_missile,
    is_wet_towel,
    is_weptool,
    is_sword,
    costly_alteration,
    set_bknown,
    splitobj,
    uncurse,
    unsplitobj,
    weight,
} from './obj.js';
import {
    an,
    aobjnam,
    corpse_xname,
    killer_xname,
    The,
    Tobjnam,
    donameFresh,
    is_plural,
    otense,
    simpleonames,
    Yobjnam2,
    vtense,
    xnameFresh,
    yname,
    yobjnam,
    Yname2,
} from './objnam.js';
import {
    AKLYS,
    BATTLE_AXE,
    COIN_CLASS,
    CORPSE,
    CRYSKNIFE,
    ELVEN_ARROW,
    ELVEN_BOW,
    ELVEN_BROADSWORD,
    ELVEN_DAGGER,
    ELVEN_SHORT_SWORD,
    ELVEN_SPEAR,
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    LENSES,
    LOADSTONE,
    SCROLL_CLASS,
    TIN_OPENER,
    STRANGE_OBJECT,
    WEAPON_CLASS,
    WORM_TOOTH,
} from './objects.js';
import { discover_object } from './o_init.js';
import { alter_cost, inside_shop, shop_keeper } from './shk.js';
import { shkname } from './shknam.js';
import { arti_light_description } from './light.js';
import { begin_burn } from './timeout.js';
import { objectGenerationEnv } from './object_generation.js';
import { heroIsBlind } from './startup_a11y.js';
import { body_part } from './polyself.js';
import { strange_feeling } from './potion.js';
import { rn2, rnd } from './rng.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import {
    bimanual,
    set_twoweap,
    setuqwep,
    setuswapwep,
    setuwep,
} from './worn.js';

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

// C ref: wield.c can_twoweapon() (760-804). Each refusal prints its source
// reason and returns FALSE; only the successful path reaches dotwoweapon()'s
// rnd(20). Keep the CORPSE arm in C order even though TWOWEAPOK() makes it
// unreachable for a corpse.
//
export async function can_twoweapon(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const uwep = state.uwep;
    const uswapwep = state.uswapwep;
    let otmp;

    if (!could_twoweap(state.youmonst?.data)) {
        if (Upolyd(state.u)) {
            await message(
                "You can't use two weapons in your current form.", state,
            );
        } else {
            // role.c names each role in the male form and, for the three
            // roles that have one, the female form as well.
            const role = state.urole;
            const roleName = (state.flags.female && role.name.f)
                ? role.name.f : role.name.m;
            await message(
                `${makeplural(roleName)} aren't able to use two weapons`
                + ' at once.', state,
            );
        }
    } else if (!uwep || !uswapwep) {
        let hand_s = body_part(HAND, state.youmonst);

        if (!uwep && !uswapwep)
            hand_s = makeplural(hand_s);
        /* "your hands are empty" or "your {left|right} hand is empty" */
        await message(
            `Your ${uwep ? 'left ' : uswapwep ? 'right ' : ''}${hand_s} `
            + `${vtense(hand_s, 'are')} empty.`, state,
        );
    } else if (!TWOWEAPOK(uwep, state) || !TWOWEAPOK(uswapwep, state)) {
        otmp = !TWOWEAPOK(uwep, state) ? uwep : uswapwep;
        await message(
            `${Yname2(otmp, state)} `
            + `${is_plural(otmp, state) ? "aren't" : "isn't a"} suitable `
            + `${(otmp === uwep) ? 'primary' : 'secondary'} `
            + `weapon${plur(otmp.quan)}.`, state,
        );
    } else if (bimanual(uwep, state) || bimanual(uswapwep, state)) {
        otmp = bimanual(uwep, state) ? uwep : uswapwep;
        await message(`${Yname2(otmp, state)} isn't one-handed.`, state);
    } else if (state.uarms) {
        await message(
            "You can't use two weapons while wearing a shield.", state,
        );
    } else if (uswapwep.oartifact) {
        await message(
            `${Yobjnam2(uswapwep, 'resist', state)} being held second to `
            + 'another weapon!', state,
        );
    } else if (uswapwep.otyp === CORPSE
        && await cant_wield_corpse(uswapwep, state)) {
        // wield.c:794-796 leaves this arm empty because !TWOWEAPOK() has
        // already rejected a corpse.
    } else if (Glib(state) || uswapwep.cursed) {
        if (!Glib(state)) set_bknown(uswapwep, 1, { ...env, state });
        await drop_uswapwep(state, env);
    } else {
        return true;
    }
    return false;
}

// C ref: wield.c drop_uswapwep() (808-831). Print the selected message before
// do.c:dropx() frees the object and do.c:dropz() clears its secondary slot.
export async function drop_uswapwep(state = game, env = {}) {
    const obj = state.uswapwep;
    const message = env.message ?? ttyPline;
    const leftHand = `left ${body_part(HAND, state.youmonst)}`;

    if (!obj.cursed) {
        await message(
            `${Yobjnam2(obj, 'slip', state)} from your ${leftHand}!`, state,
        );
    } else if (!state.u.twoweap) {
        await message(
            `${Yobjnam2(obj, 'evade', state)} your grasp and `
            + `${otense(obj, 'drop', state)} from your ${leftHand}!`, state,
        );
    } else {
        await message(
            `Your ${leftHand} spasms and drops `
            + `${yobjnam(obj, null, state)}!`, state,
        );
    }

    // do.js imports wield.js for welded(); defer the reverse edge until this
    // source call, after module initialization has completed.
    const { dropCommandEnv, dropx } = await import('./do.js');
    await dropx(obj, dropCommandEnv(state, { ...env, state }));
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
        return (rnd(20) > acurr(state, A_DEX))
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

// C ref: wield.c cant_wield_corpse() (137-153).
export async function cant_wield_corpse(obj, state = game) {
    if (state.uarmg || obj.otyp !== CORPSE
        || !touch_petrifies(state.mons[obj.corpsenm])
        || Stone_resistance(state)) return false;

    await ttyPline(
        `You wield ${corpse_xname(obj, null, CXN_PFX_THE, state)} in your bare ${makeplural(body_part(HAND, state.youmonst))}.`,
        state,
    );
    const kbuf = `wielding ${killer_xname(obj, state)} bare-handed`;
    // C discards instapetrify's void result. Do not simulate its death or
    // life-saving state; the caller still takes the source TRUE return.
    void kbuf;
    note_unported('trap.c instapetrify');
    return true;
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

// C ref: wield.c chwepon() (916-1048). The caller consumes this return value:
// zero means strange_feeling() consumed the scroll; all other source arms
// leave it for read.c:doread() to consume after seffects().
export async function chwepon(otmp, amount, state = game) {
    const color = hcolor(amount < 0 ? 'black' : 'blue', state);
    const uwep = state.uwep;
    let otyp = STRANGE_OBJECT;

    if (!uwep || (uwep.oclass !== WEAPON_CLASS
        && !is_weptool(uwep, state))) {
        let text;
        if (amount >= 0 && uwep && will_weld(uwep, state)) {
            if (!propertyActiveForWield(state, BLINDED)) {
                text = `${Yobjnam2(uwep, 'glow', state)} with `
                    + `${an(hcolor('amber', state))} aura.`;
                // wield.c deliberately bypasses set_bknown() here.
                uwep.bknown = !hallucinationActiveForWield(state);
            } else {
                // C says this tin opener is in the right hand.
                text = `Your right ${body_part(HAND, state.youmonst)} tingles.`;
            }
            await uncurse(uwep, { state });
            update_inventory({ state });
        } else {
            text = `Your ${makeplural(body_part(HAND, state.youmonst))} `
                + `${amount >= 0 ? 'twitch' : 'itch'}.`;
        }
        await strange_feeling(otmp, text, state);
        await exercise(A_DEX, amount >= 0, state, { rn2 });
        return 0;
    }

    if (otmp?.oclass === SCROLL_CLASS) otyp = otmp.otyp;

    if (uwep.otyp === WORM_TOOTH && amount >= 0) {
        const multiple = uwep.quan > 1;
        await ttyPline(
            `Your ${simpleonames(uwep, state)} `
                + `${multiple ? 'fuse, and become' : 'is'} much sharper now.`,
            state,
        );
        uwep.otyp = CRYSKNIFE;
        uwep.oerodeproof = 0;
        if (multiple) {
            uwep.quan = 1;
            uwep.owt = weight(uwep, { state });
        }
        if (uwep.cursed) await uncurse(uwep, { state });
        if (uwep.unpaid) alter_cost(uwep, 0, state);
        if (otyp !== STRANGE_OBJECT)
            discover_object(otyp, true, true, true, state, { random: { rn2 } });
        if (multiple) await encumber_msg(state);
        return 1;
    } else if (uwep.otyp === CRYSKNIFE && amount < 0) {
        const multiple = uwep.quan > 1;
        await ttyPline(
            `Your ${simpleonames(uwep, state)} `
                + `${multiple ? 'fuse, and become' : 'is'} much duller now.`,
            state,
        );
        sourceCostlyAlteration(uwep, COST_DEGRD, state);
        uwep.otyp = WORM_TOOTH;
        uwep.oerodeproof = 0;
        if (multiple) {
            uwep.quan = 1;
            uwep.owt = weight(uwep, { state });
        }
        if (otyp !== STRANGE_OBJECT && otmp.bknown)
            discover_object(otyp, true, true, true, state, { random: { rn2 } });
        if (multiple) await encumber_msg(state);
        return 1;
    }

    const wepname = has_oname(uwep) ? uwep.oextra.oname : '';
    if (amount < 0 && uwep.oartifact
        && restrict_name(uwep, wepname, state)) {
        if (!propertyActiveForWield(state, BLINDED)) {
            await ttyPline(
                `${Yobjnam2(uwep, 'faintly glow', state)} ${color}.`, state,
            );
        }
        return 1;
    }

    // C's soft upper and lower limit can destroy the whole wielded stack.
    if (((uwep.spe > 5 && amount >= 0)
        || (uwep.spe < -5 && amount < 0)) && rn2(3)) {
        if (!propertyActiveForWield(state, BLINDED)) {
            await ttyPline(
                `${Yobjnam2(uwep, 'violently glow', state)} ${color} for a while and then `
                    + `${otense(uwep, 'evaporate', state)}.`,
                state,
            );
        } else {
            await ttyPline(`${Yobjnam2(uwep, 'evaporate', state)}.`, state);
        }
        // useupall() is a void C call. Its inventory/worn-slot lifecycle is
        // not complete in this port, so keep the precise gap rather than
        // inventing a partial weapon-removal transition.
        note_unported('invent.c useupall');
        return 1;
    }

    if (!propertyActiveForWield(state, BLINDED)) {
        const xtime = amount * amount === 1 ? 'moment' : 'while';
        await ttyPline(
            `${Yobjnam2(uwep, amount === 0 ? 'violently glow' : 'glow', state)} `
                + `${color} for a ${xtime}.`,
            state,
        );
        if (otyp !== STRANGE_OBJECT && uwep.known
            && (amount > 0 || (amount < 0 && otmp.bknown))) {
            discover_object(otyp, true, true, true, state, { random: { rn2 } });
        }
    }

    if (amount < 0) sourceCostlyAlteration(uwep, COST_DECHNT, state);
    uwep.spe += amount;
    if (amount > 0) {
        if (uwep.cursed) await uncurse(uwep, { state });
        if (uwep.unpaid) alter_cost(uwep, 0, state);
    }

    if (is_art(uwep, ART_MAGICBANE) && uwep.spe >= 0) {
        const verb = amount > 1 && uwep.spe > 1 ? 'flinches' : 'itches';
        await ttyPline(
            `Your right ${body_part(HAND, state.youmonst)} ${verb}!`, state,
        );
    }

    if (uwep.spe > 5 && (ELVEN_WEAPON_TYPES.has(uwep.otyp)
        || uwep.oartifact || !rn2(7))) {
        await ttyPline(
            `${Yobjnam2(uwep, 'suddenly vibrate', state)} unexpectedly.`, state,
        );
    }
    return 1;
}

const ELVEN_WEAPON_TYPES = new Set([
    ELVEN_ARROW, ELVEN_SPEAR, ELVEN_DAGGER,
    ELVEN_SHORT_SWORD, ELVEN_BROADSWORD, ELVEN_BOW,
]);

function hallucinationActiveForWield(state) {
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(hallucination?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
}

function sourceCostlyAlteration(obj, alterType, state) {
    if ((obj.where === OBJ_FREE || obj.where === OBJ_INVENT) && !obj.unpaid) {
        costly_alteration(obj, alterType, { state });
    } else {
        note_unported('shk.c costly_alteration');
    }
}

function propertyActiveForWield(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

// C ref: mondata.h:123 cantwield().
export function cantwield(species) {
    return nohands(species) || verysmall(species);
}

// C ref: wield.c:80-82, the two shared message tails.
const are_no_longer_twoweap = 'are no longer using two weapons at once';
const can_no_longer_twoweap = 'can no longer wield two weapons at once';

// C ref: wield.c weldmsg() (1061-1074). Temporarily suppress the worn
// annotation while naming the weapon; restore the source mask after output.
export async function weldmsg(obj, state = game) {
    let hand = body_part(HAND, state.youmonst);
    if (bimanual(obj, state)) hand = makeplural(hand);
    const savewornmask = obj.owornmask;
    obj.owornmask = 0;
    await ttyPline(`${Yobjnam2(obj, 'are', state)} welded to your ${hand}!`, state);
    obj.owornmask = savewornmask;
}

// C ref: wield.c untwoweapon() (905-914).
export async function untwoweapon(state = game) {
    if (state.u.twoweap) {
        await ttyPline(`You ${can_no_longer_twoweap}.`, state);
        set_twoweap(false, state); /* u.twoweap = FALSE */
        update_inventory({ state });
    }
}

// C ref: wield.c ready_weapon() (169-273). Message and curse knowledge
// precede installing the new primary slot, as they do in C.
export async function ready_weapon(wep, state = game) {
    let res = ECMD_OK;
    const was_twoweap = state.u.twoweap;
    const had_wep = Boolean(state.uwep);
    const objp = { obj: wep };

    if (!wep) {
        if (state.uwep) {
            await ttyPline(`You are ${empty_handed(state)}.`, state);
            await setuwep(null, setwornEnv(state));
            res = ECMD_TIME;
        } else {
            await ttyPline(`You are already ${empty_handed(state)}.`, state);
        }
    } else if (wep.otyp === CORPSE && await cant_wield_corpse(wep, state)) {
        res = ECMD_TIME; /* life-saved hero; corpse won't be wielded */
    } else if (state.uarms && bimanual(wep, state)) {
        const weaponType = is_sword(wep, state)
            ? 'sword' : wep.otyp === BATTLE_AXE ? 'axe' : 'weapon';
        await ttyPline(
            `You cannot wield a two-handed ${weaponType} while wearing a shield.`,
            state,
        );
        res = ECMD_FAIL;
    } else if (!await retouch_object(objp, false, state)) {
        res = ECMD_TIME;
    } else {
        wep = objp.obj; /* retouch_object receives C's &wep */
        res = ECMD_TIME;
        if (will_weld(wep, state)) {
            const name = xnameFresh(wep, state);
            const prefix = !name.startsWith('The ')
                && The(name, state).startsWith('The ') ? 'The ' : '';
            const twoHands = bimanual(wep, state);
            const hand = body_part(HAND, state.youmonst);
            const dominant = twoHands ? ''
                : state.u.uhandedness === RIGHT_HANDED
                    ? 'dominant right ' : 'dominant left ';
            await ttyPline(
                `${prefix}${aobjnam(wep, 'weld', state)} ${wep.quan === 1 ? 'itself' : 'themselves'} to your ${dominant}${twoHands ? makeplural(hand) : hand}!`,
                state,
            );
            set_bknown(wep, 1, { state });
        } else {
            const dummy = wep.owornmask;
            wep.owornmask |= W_WEP;
            if (wep.otyp === AKLYS && (wep.owornmask & W_WEP) !== 0)
                await ttyPline('You secure the tether.', state);
            await prinv(null, wep, 0, { state });
            wep.owornmask = dummy;
        }

        await setuwep(wep, setwornEnv(state));
        if (was_twoweap && !state.u.twoweap && state.flags.verbose && state.uwep) {
            await ttyPline(
                `You ${(TWOWEAPOK(state.uwep, state) && !bimanual(state.uwep, state))
                    ? are_no_longer_twoweap : can_no_longer_twoweap}.`, state,
            );
        }
        if (wep.oartifact) res |= await arti_speak(wep, state);
        if (artifact_light(wep) && !wep.lamplit) {
            begin_burn(wep, false, objectGenerationEnv({ state }));
            if (!heroIsBlind(state)) {
                await ttyPline(
                    `${Tobjnam(wep, 'begin', state)} to shine ${arti_light_description(wep, state)}!`, state,
                );
            }
        }
        if (wep.unpaid) {
            const this_shkp = shop_keeper(inside_shop(state.u.ux, state.u.uy, state), state);
            if (this_shkp) {
                await ttyPline(
                    `${shkname(this_shkp, state)} says "You be careful with my ${xnameFresh(wep, state)}!"`, state,
                );
            }
        }
    }
    if (had_wep !== Boolean(state.uwep) && state.iflags?.status_conditions?.barehanded) {
        state.disp ??= {};
        state.disp.botl = true;
    }
    return res;
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

// C ref: obj.h pair_of(). These armor categories name one logical item as a
// pair even when its quantity is one, so doquiver_core() uses "those" and
// plural verb agreement in its confirmation path.
function pair_of(obj, state) {
    return obj.otyp === LENSES
        || is_gloves(obj, state)
        || is_boots(obj, state);
}

// C ref: invent.c splittable() (1664-1671). This is kept at this caller's
// source boundary because invent.c does not export the helper; the predicate
// is deliberately identical and preserves welded primary weapons and cursed
// loadstones as indivisible objects.
function quiver_splittable(obj, state) {
    return !((obj.otyp === LOADSTONE && obj.cursed)
        || (obj === state.uwep && welded(obj, state)));
}

// C ref: hack.h ynq() (1330). lock.js owns the same macro wrapper; loading it
// here avoids introducing a static wield.c -> cmd.c -> wield.js cycle while
// retaining its y/n/q normalization and prompt input behavior.
async function quiver_ynq(query, state) {
    const { ynq } = await import('./lock.js');
    return ynq(query, state);
}

// C ref: wield.c Shk_Your(). The ordinary carried-object owner prefix is
// already source-backed by shk.js; capitalize it exactly as Shk_Your does.
async function shk_your_prefix(obj, state) {
    const { shk_your } = await import('./shk.js');
    const prefix = shk_your(obj, state);
    return prefix ? prefix[0].toUpperCase() + prefix.slice(1) : prefix;
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

// C ref: wield.c doquiver_core() (512-678). This is also the refill helper for
// dothrow.c dofire(). The prompt, counted-stack, wielded-primary, and
// alternate-weapon arms retain C's evaluation order before the common tail.
export async function doquiver_core(verb, state = game) {
    let was_uwep = false;
    const was_twoweap = Boolean(state.u.twoweap);
    state.multi = 0;
    if (!state.invent) {
        await ttyPline('You have nothing to ready for firing.', state);
        return ECMD_OK;
    }

    clear_splitobjs(state);
    let newquiver = await getobj(
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

    if (newquiver.o_id
        && newquiver.o_id === state.context?.objsplit?.child_oid) {
        if (state.uquiver
            && state.uquiver.o_id === state.context.objsplit.parent_oid) {
            unsplitobj(newquiver, { state });
            // C falls through this label after undoing the count split.
            await ttyPline('That ammunition is already readied!', state);
            return ECMD_OK;
        } else if (newquiver.oclass === COIN_CLASS) {
            await ttyPline("You can't ready only part of your gold.", state);
            unsplitobj(newquiver, { state });
            return ECMD_OK;
        }
        finish_splitting(newquiver, state);
    } else if (newquiver === state.uquiver) {
        await ttyPline('That ammunition is already readied!', state);
        return ECMD_OK;
    } else if (newquiver.owornmask & (W_ARMOR | W_ACCESSORY | W_SADDLE)) {
        await ttyPline(`You cannot ${verb} that!`, state);
        return ECMD_OK;
    } else if (newquiver === state.uwep) {
        const weldRes = !newquiver.bknown;

        if (welded(newquiver, state)) {
            await weldmsg(newquiver, state);
            reset_remarm(state);
            return weldRes ? ECMD_TIME : ECMD_OK;
        }

        if (newquiver.quan > 1
            && inv_cnt(false, state) < 52
            && quiver_splittable(newquiver, state)) {
            let qbuf = `You are wielding ${newquiver.quan} `
                + `${simpleonames(newquiver, state)}.  Ready `
                + `${newquiver.quan - 1} of them?`;
            const answer = await quiver_ynq(qbuf, state);
            if (answer === 'q') return ECMD_OK;
            if (answer === 'y') {
                newquiver = splitobj(
                    newquiver,
                    newquiver.quan - 1,
                    { state },
                );
                finish_splitting(newquiver, state);
                // C's goto quivering bypasses the wielded-primary tail.
            } else {
                qbuf = 'Ready all of them instead?';
                if (await quiver_ynq(qbuf, state) !== 'y') {
                    const prefix = await shk_your_prefix(newquiver, state);
                    await ttyPline(
                        `${prefix}${simpleonames(newquiver, state)} `
                        + `${otense(newquiver, 'remain', state)} wielded.`,
                        state,
                    );
                    return ECMD_OK;
                }
                await setuwep(null, setwornEnv(state));
                await untwoweapon(state);
                was_uwep = true;
            }
        } else {
            const usePlural = is_plural(newquiver, state)
                || pair_of(newquiver, state);
            // The source wording has two clauses; retain its exact pronouns.
            const fullQbuf = `You are wielding ${!usePlural ? 'that' : 'those'}`
                + `.  Ready ${!usePlural ? 'it' : 'them'} instead?`;
            if (await quiver_ynq(fullQbuf, state) !== 'y') {
                const prefix = await shk_your_prefix(newquiver, state);
                await ttyPline(
                    `${prefix}${simpleonames(newquiver, state)} `
                    + `${otense(newquiver, 'remain', state)} wielded.`,
                    state,
                );
                return ECMD_OK;
            }
            await setuwep(null, setwornEnv(state));
            await untwoweapon(state);
            was_uwep = true;
        }
    } else if (newquiver === state.uswapwep) {
        let qbuf;
        if (newquiver.quan > 1
            && inv_cnt(false, state) < 52
            && quiver_splittable(newquiver, state)) {
            qbuf = `${state.u.twoweap ? 'You are dual wielding'
                : 'Your alternate weapon is'} ${newquiver.quan} `
                + `${simpleonames(newquiver, state)}.  Ready `
                + `${newquiver.quan - 1} of them?`;
            const answer = await quiver_ynq(qbuf, state);
            if (answer === 'q') return ECMD_OK;
            if (answer === 'y') {
                newquiver = splitobj(
                    newquiver,
                    newquiver.quan - 1,
                    { state },
                );
                finish_splitting(newquiver, state);
            } else {
                qbuf = 'Ready all of them instead?';
                if (await quiver_ynq(qbuf, state) !== 'y') {
                    const prefix = await shk_your_prefix(newquiver, state);
                    await ttyPline(
                        `${prefix}${simpleonames(newquiver, state)} `
                        + `${otense(newquiver, 'remain', state)} `
                        + `${state.u.twoweap ? 'wielded' : 'as secondary weapon'}.`,
                        state,
                    );
                    return ECMD_OK;
                }
                setuswapwep(null, setwornEnv(state));
                await untwoweapon(state);
            }
        } else {
            const usePlural = is_plural(newquiver, state)
                || pair_of(newquiver, state);
            qbuf = `${!usePlural ? 'That is' : 'Those are'} your `
                + `${state.u.twoweap ? 'second' : 'alternate'} weapon.  `
                + `Ready ${!usePlural ? 'it' : 'them'} instead?`;
            if (await quiver_ynq(qbuf, state) !== 'y') {
                const prefix = await shk_your_prefix(newquiver, state);
                await ttyPline(
                    `${prefix}${simpleonames(newquiver, state)} `
                    + `${otense(newquiver, 'remain', state)} `
                    + `${state.u.twoweap ? 'wielded' : 'as secondary weapon'}.`,
                    state,
                );
                return ECMD_OK;
            }
            setuswapwep(null, setwornEnv(state));
            await untwoweapon(state);
        }
    }

    // C label quivering: a split child, or a newly selected ordinary item,
    // reaches this common slot/message tail without spending a turn.
    if (verb === 'ready') {
        setuqwep(newquiver, setwornEnv(state));
        await prinv(null, newquiver, 0, { state });
    } else {
        await prinv('You ready:', newquiver, 0, { state });
        setuqwep(newquiver, setwornEnv(state));
    }

    let res = 0;
    if (was_uwep) {
        await ttyPline(`You are now ${empty_handed(state)}.`, state);
        res = 1;
    } else if (was_twoweap && !state.u.twoweap) {
        await ttyPline(`${are_no_longer_twoweap}.`, state);
        res = 1;
    }
    return res ? ECMD_TIME : ECMD_OK;
}

// C ref: wield.c wield_tool() (683-758). Used by rub and by the apply paths
// for pick-axes, whips, grappling hooks, and polearms.
export async function wield_tool(obj, verb, state = game) {
    if (state.uwep && obj === state.uwep)
        return true;

    if (!verb) verb = 'wield';
    const what = xnameFresh(obj, state);
    let moreThanOne = obj.quan > 1
        || strstri(what, 'pair of ') >= 0
        || strstri(what, 's of ') >= 0;

    if (obj.owornmask & (W_ARMOR | W_ACCESSORY)) {
        await ttyPline(
            `You can't ${verb} ${yname(obj, state)} while wearing `
                + `${moreThanOne ? 'them' : 'it'}.`,
            state,
        );
        return false;
    }
    if (state.uwep && welded(state.uwep, state)) {
        if (state.flags.verbose) {
            let hand = body_part(HAND, state.youmonst);
            if (bimanual(state.uwep, state)) hand = makeplural(hand);
            if (strstri(what, 'pair of ') !== -1) moreThanOne = false;
            await ttyPline(
                `Since your weapon is welded to your ${hand}, you cannot `
                    + `${verb} ${moreThanOne ? 'those' : 'that'} ${what}.`,
                state,
            );
        } else {
            await ttyPline("You can't do that.", state);
        }
        return false;
    }
    if (cantwield(state.youmonst?.data ?? state.mons[state.u.umonnum])) {
        await ttyPline(
            `You can't hold ${moreThanOne ? 'them' : 'it'} strongly enough.`,
            state,
        );
        return false;
    }
    if (state.uarms && bimanual(obj, state)) {
        const kind = obj.oclass === WEAPON_CLASS ? 'weapon' : 'tool';
        await ttyPline(
            `You cannot ${verb} a two-handed ${kind} while wearing a shield.`,
            state,
        );
        return false;
    }
    if (state.uquiver === obj)
        setuqwep(null, setwornEnv(state));
    if (state.uswapwep === obj) {
        await doswapweapon(state);
        if (state.uswapwep === obj) return false;
    } else {
        const oldwep = state.uwep ?? null;
        if (will_weld(obj, state)) {
            // C discards ready_weapon()'s turn result here; it only checks
            // below whether the selected object ended up in the primary slot.
            await ready_weapon(obj, state);
        } else {
            await ttyPline(`You now wield ${donameFresh(obj, state)}.`, state);
            await setuwep(obj, setwornEnv(state));
        }
        if (state.flags.pushweapon && oldwep
            && (state.uwep ?? null) !== oldwep)
            setuswapwep(oldwep, setwornEnv(state));
    }

    if (state.uwep && state.uwep !== obj)
        return false;
    if (state.u.twoweap) await untwoweapon(state);

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
        const effects = setuwep(null, setwornEnv(state, env));
        const finish = () => { update_inventory({ state }); };
        return effects && typeof effects.then === 'function'
            ? Promise.resolve(effects).then(finish) : finish();
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

// C ref: wield.c uqwepgone() (897-903). Clear the quiver slot after an
// object disappears, including the explicit refresh after setworn's refresh.
export function uqwepgone(env = {}) {
    const state = env.state ?? game;
    if (state.uquiver) {
        setuqwep(null, setwornEnv(state));
        update_inventory({ state });
    }
}
