// wield.js -- what the hero's hands are doing, plus the one question wield.c
// asks about a monster's hands.
// C refs: src/wield.c erodeable_wep(), will_weld(), TWOWEAPOK(), welded(),
// empty_handed(), mwelded(), can_twoweapon(), and dotwoweapon().
//
// wield.c set_twoweap() lives in js/worn.js beside setworn() and setnotworn(),
// the two callers that would otherwise make js/worn.js and this file import
// each other.

import { A_DEX, ECMD_OK, ECMD_TIME, GLIB, W_WEP } from './const.js';
import { effective_attribute } from './attrib.js';
import { game } from './gstate.js';
import { update_inventory } from './invent.js';
import { could_twoweap, humanoid } from './mondata.js';
import { isWeptool, set_bknown } from './obj.js';
import {
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    TIN_OPENER,
    WEAPON_CLASS,
} from './objects.js';
import { rnd } from './rng.js';
import { ttyPline } from './tty_message.js';
import {
    bimanual,
    is_ammo,
    is_launcher,
    is_missile,
    set_twoweap,
} from './worn.js';

/**
 * A branch of wield.c can_twoweapon() or dotwoweapon() this port does not own
 * yet.  js/cmd.js converts it into the retryable command boundary, which is
 * sound because every one of them is decided before the command prints a
 * message, changes a slot, or draws its rnd(20).
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
    return obj.oclass === WEAPON_CLASS || isWeptool(obj, state)
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
        : isWeptool(obj, state);
}

// youprop.h:112 defines Glib as the bare intrinsic field, so slippery fingers
// have no extrinsic source to consult.
function Glib(state) {
    return Boolean(state.u?.uprops?.[GLIB]?.intrinsic);
}

// C ref: wield.c can_twoweapon() (760-832). Its success path at 803 is
// complete. Each arm that answers FALSE prints a refusal message this slice
// does not own, so each stops here by name instead; the slippery-or-cursed
// arm stops ahead of the set_bknown() and drop_uswapwep() it would run, so no
// arm leaves state half-changed.
//
// wield.c:794-796, the CORPSE arm, is deliberately absent. Its own comment
// records that the !TWOWEAPOK() test above prevents ever reaching it, and the
// reason holds in this port too: a corpse is FOOD_CLASS, so TWOWEAPOK() falls
// through to isWeptool(), which demands TOOL_CLASS. Porting it would add a
// branch no input can take on top of the unported cant_wield_corpse().
export function can_twoweapon(state = game) {
    const uwep = state.uwep;
    const uswapwep = state.uswapwep;

    if (!could_twoweap(state.youmonst?.data)) {
        throw new UnsupportedTwoWeaponError(
            "can_twoweapon()'s wrong-form refusal (wield.c:765-772)",
        );
    } else if (!uwep || !uswapwep) {
        throw new UnsupportedTwoWeaponError(
            "can_twoweapon()'s empty-hand refusal (wield.c:773-779)",
        );
    } else if (!TWOWEAPOK(uwep, state) || !TWOWEAPOK(uswapwep, state)) {
        throw new UnsupportedTwoWeaponError(
            "can_twoweapon()'s unsuitable-weapon refusal (wield.c:780-785)",
        );
    } else if (bimanual(uwep, state) || bimanual(uswapwep, state)) {
        throw new UnsupportedTwoWeaponError(
            "can_twoweapon()'s two-handed refusal (wield.c:786-788)",
        );
    } else if (state.uarms) {
        throw new UnsupportedTwoWeaponError(
            "can_twoweapon()'s shield refusal (wield.c:789-790)",
        );
    } else if (uswapwep.oartifact) {
        throw new UnsupportedTwoWeaponError(
            "can_twoweapon()'s artifact refusal (wield.c:791-793)",
        );
    } else if (Glib(state) || uswapwep.cursed) {
        throw new UnsupportedTwoWeaponError(
            "can_twoweapon()'s slippery-or-cursed refusal (wield.c:797-801)",
        );
    }
    return true;
}

// C ref: wield.c dotwoweapon() (843-864), the #twoweapon command. The
// toggle-off arm at 847-853 and can_twoweapon()'s refusal messages belong to a
// later slice; this one owns the gate at 856 and the success path behind it.
//
// The result is the command's whole time cost: ACURR(A_DEX) is the hero's
// current Dexterity, so a nimble hero usually switches for free.
export async function dotwoweapon(state = game) {
    /* You can always toggle it off */
    if (state.u.twoweap) {
        throw new UnsupportedTwoWeaponError(
            "dotwoweapon()'s toggle-off arm (wield.c:847-853)",
        );
    }

    /* May we use two weapons? */
    can_twoweapon(state);
    /* Success! */
    await ttyPline('You begin two-weapon combat.', state);
    set_twoweap(true, state); /* u.twoweap = TRUE */
    update_inventory({ state });
    return (rnd(20) > effective_attribute(state, A_DEX))
        ? ECMD_TIME : ECMD_OK;
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
