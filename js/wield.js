// wield.js -- what the hero's hands are doing, plus the one question wield.c
// asks about a monster's hands.
// C refs: src/wield.c erodeable_wep(), will_weld(), welded(), empty_handed(),
// and mwelded().

import { W_WEP } from './const.js';
import { game } from './gstate.js';
import { humanoid } from './mondata.js';
import { isWeptool, set_bknown } from './obj.js';
import {
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    TIN_OPENER,
    WEAPON_CLASS,
} from './objects.js';

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
