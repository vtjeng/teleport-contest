// wield.js -- what the hero's hands are doing, plus the one question wield.c
// asks about a monster's hands.
// C refs: src/wield.c erodeable_wep(), will_weld(), TWOWEAPOK(), welded(),
// empty_handed(), mwelded(), can_twoweapon(), and dotwoweapon().
//
// wield.c set_twoweap() lives in js/worn.js beside setworn() and setnotworn(),
// the two callers that would otherwise make js/worn.js and this file import
// each other.

import {
    A_DEX, ECMD_OK, ECMD_TIME, GLIB, HAND, plur, Upolyd, W_WEP,
} from './const.js';
import { effective_attribute } from './attrib.js';
import { makeplural } from './fruit.js';
import { game } from './gstate.js';
import { update_inventory } from './invent.js';
import { could_twoweap, humanoid } from './mondata.js';
import {
    is_ammo,
    is_launcher,
    is_missile,
    is_weptool,
    set_bknown,
} from './obj.js';
import { is_plural, vtense, Yname2 } from './objnam.js';
import {
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    TIN_OPENER,
    WEAPON_CLASS,
} from './objects.js';
import { body_part } from './polyself.js';
import { rnd } from './rng.js';
import { ttyPline } from './tty_message.js';
import { bimanual, set_twoweap } from './worn.js';

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
// Yobjnam2(uswapwep, "resist"). objnam.c yname(), under it, needs
// obj_is_pname() and artiname() to name an artifact, and u_init.c:1310 calls
// mksobj() with artif FALSE, so no role starts with one in either hand.
//
// wield.c:797-801 sets uswapwep's bknown and drops it through
// drop_uswapwep(). do.c's dropx() admits only an unequipped heavy iron ball,
// so dropping the secondary weapon is not portable yet; nor can either
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
