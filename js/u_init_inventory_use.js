// Initial inventory side effects: discovery, armor, weapon slots, and spells.
// C ref: src/u_init.c ini_inv_use_obj().

import { W_ARM, W_ARMC, W_ARMF, W_ARMG, W_ARMH, W_ARMS, W_ARMU } from './const.js';
import { game } from './gstate.js';
import { discover_object } from './o_init.js';
import { isWeptool, objectType } from './obj.js';
import {
    ARMOR_CLASS,
    ARM_BOOTS,
    ARM_CLOAK,
    ARM_GLOVES,
    ARM_HELM,
    ARM_SHIELD,
    ARM_SHIRT,
    ARM_SUIT,
    FLINT,
    OBJ_DESCR,
    OIL_LAMP,
    POT_OIL,
    ROCK,
    SPBOOK_CLASS,
    SPE_BLANK_PAPER,
    TIN_OPENER,
    WEAPON_CLASS,
} from './objects.js';
import {
    bimanual,
    is_ammo,
    is_missile,
    set_twoweap,
    setuqwep,
    setuswapwep,
    setuwep,
    setworn,
} from './worn.js';

function useEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        hooks: env.hooks ?? {},
    };
}

function armorSlot(obj, state) {
    switch (objectType(obj, state).oc_armcat) {
    case ARM_SHIELD: return { field: 'uarms', mask: W_ARMS };
    case ARM_HELM: return { field: 'uarmh', mask: W_ARMH };
    case ARM_GLOVES: return { field: 'uarmg', mask: W_ARMG };
    case ARM_SHIRT: return { field: 'uarmu', mask: W_ARMU };
    case ARM_CLOAK: return { field: 'uarmc', mask: W_ARMC };
    case ARM_BOOTS: return { field: 'uarmf', mask: W_ARMF };
    case ARM_SUIT: return { field: 'uarm', mask: W_ARM };
    default: return null;
    }
}

function initialArmor(obj, env) {
    const { state } = env;
    const slot = armorSlot(obj, state);
    if (!slot || state[slot.field]) return;
    if (slot.mask === W_ARMS) {
        if (state.uwep && bimanual(state.uwep, state)) return;
        set_twoweap(false, state);
    }
    setworn(obj, slot.mask, env);
}

function initialWeapon(obj, env) {
    const { state } = env;
    if (is_ammo(obj, state) || is_missile(obj, state)) {
        if (!state.uquiver) setuqwep(obj, env);
    } else if (!state.uwep && (!state.uarms || !bimanual(obj, state))) {
        setuwep(obj, env);
    } else if (!state.uswapwep) {
        setuswapwep(obj, env);
    }
}

export function ini_inv_use_obj(obj, env = {}) {
    if (!obj || typeof obj !== 'object')
        throw new TypeError('ini_inv_use_obj requires an inventory object');
    const normalized = useEnv(env);
    const { state } = normalized;
    const type = objectType(obj, state);

    if (OBJ_DESCR(type, state) && obj.known)
        discover_object(obj.otyp, true, true, false, state);
    if (obj.otyp === OIL_LAMP)
        discover_object(POT_OIL, true, true, false, state);

    if (obj.oclass === ARMOR_CLASS) initialArmor(obj, normalized);

    if (obj.oclass === WEAPON_CLASS || isWeptool(obj, state)
        || obj.otyp === TIN_OPENER || obj.otyp === FLINT
        || obj.otyp === ROCK) {
        initialWeapon(obj, normalized);
    }

    if (obj.oclass === SPBOOK_CLASS && obj.otyp !== SPE_BLANK_PAPER) {
        if (typeof normalized.initialSpell !== 'function') {
            throw new TypeError(
                'ini_inv_use_obj requires initialSpell for a spellbook',
            );
        }
        normalized.initialSpell(obj, state);
    }
    return obj;
}

export function use_initial_inventory(env = {}) {
    const normalized = useEnv(env);
    for (let obj = normalized.state.invent; obj; obj = obj.nobj)
        ini_inv_use_obj(obj, normalized);
    return normalized.state;
}

export const _uInitInventoryUseInternals = Object.freeze({
    armorSlot,
    initialArmor,
    initialWeapon,
});
