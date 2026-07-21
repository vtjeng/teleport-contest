// Starting inventory object generation.
// C ref: src/u_init.c trquan(), ini_inv_mkobj_filter(),
//        ini_inv_obj_substitution(), ini_inv_adjust_obj(), and ini_inv().

import { A_CHAOTIC } from './const.js';
import { game } from './gstate.js';
import { addinv } from './invent.js';
import { PM_MONK, PM_ORC, PM_WIZARD } from './monsters.js';
import {
    dealloc_obj,
    isContainer,
    mkobj,
    mksobj,
    objectType,
    weight,
} from './obj.js';
import {
    ARMOR_CLASS,
    COIN_CLASS,
    FLINT,
    GEM_CLASS,
    LOADSTONE,
    LUCKSTONE,
    MAGIC_MARKER,
    PANCAKE,
    POT_ACID,
    POT_HALLUCINATION,
    POT_POLYMORPH,
    RIN_AGGRAVATE_MONSTER,
    RIN_HUNGER,
    RIN_LEVITATION,
    RIN_POISON_RESISTANCE,
    RIN_POLYMORPH,
    RIN_POLYMORPH_CONTROL,
    RING_CLASS,
    SCR_AMNESIA,
    SCR_BLANK_PAPER,
    SCR_ENCHANT_WEAPON,
    SCR_FIRE,
    SPE_BLANK_PAPER,
    SPE_FORCE_BOLT,
    SPE_NOVEL,
    SPE_POLYMORPH,
    SPBOOK_CLASS,
    STATUE,
    STRANGE_OBJECT,
    TOOL_CLASS,
    TOUCHSTONE,
    WAN_NOTHING,
    WAN_POLYMORPH,
    WAN_WISHING,
    WEAPON_CLASS,
} from './objects.js';
import { restrictedSpellDiscipline } from './role_skills.js';
import { rn1, rn2, rnd, rne } from './rng.js';
import {
    INITIAL_INVENTORY_SUBSTITUTIONS,
    UNDEF_BLESS,
    UNDEF_SPE,
    UNDEF_TYP,
} from './u_init_inventory_data.js';

const NOCREATE_FIELDS = Object.freeze([
    'nocreate',
    'nocreate2',
    'nocreate3',
    'nocreate4',
]);

function inventoryInitEnv(env = {}) {
    const random = env.random ?? { rn1, rn2, rnd, rne };
    for (const name of ['rn1', 'rn2', 'rnd', 'rne']) {
        if (typeof random[name] !== 'function') {
            throw new TypeError(
                `starting inventory random injection requires ${name}`,
            );
        }
    }
    return {
        ...env,
        state: env.state ?? game,
        hooks: env.hooks ?? {},
        random,
    };
}

function prohibitionState(state) {
    state.gn ??= {};
    for (const field of NOCREATE_FIELDS) {
        if (!Number.isInteger(state.gn[field]))
            state.gn[field] = STRANGE_OBJECT;
    }
    return state.gn;
}

// C ref: u_init.c u_init_role() resets these after role inventory creation.
// The role orchestrator owns that call boundary; lazy initialization here
// preserves decl.c's zero-valued fresh-process state for direct ini_inv calls.
export function reset_ini_inv_nocreate(state = game) {
    const gn = prohibitionState(state);
    for (const field of NOCREATE_FIELDS) gn[field] = STRANGE_OBJECT;
    return gn;
}

// C ref: u_init.c trquan(). Fixed nonzero quantities deliberately consume
// rn2(1); the zero-valued sentinel is the only no-draw case.
export function trquan(trop, random = { rn2 }) {
    if (!trop || typeof trop !== 'object')
        throw new TypeError('trquan requires a trobj descriptor');
    const minimum = Math.trunc(trop.trquan_min ?? 0);
    const maximum = Math.trunc(trop.trquan_max ?? 0);
    if (!minimum) return 1;
    if (minimum < 0 || maximum < minimum) {
        throw new RangeError(
            `invalid starting quantity range ${minimum}..${maximum}`,
        );
    }
    return minimum + random.rn2(maximum - minimum + 1);
}

function rejectedRandomObject(obj, gotLevel1Spellbook, env) {
    const { state } = env;
    const gn = prohibitionState(state);
    const otyp = obj.otyp;
    if (otyp === WAN_WISHING
        || otyp === gn.nocreate
        || otyp === gn.nocreate2
        || otyp === gn.nocreate3
        || otyp === gn.nocreate4
        || otyp === RIN_LEVITATION
        || otyp === POT_HALLUCINATION
        || otyp === POT_ACID
        || otyp === SCR_AMNESIA
        || otyp === SCR_FIRE
        || otyp === SCR_BLANK_PAPER
        || otyp === SPE_BLANK_PAPER
        || otyp === RIN_AGGRAVATE_MONSTER
        || otyp === RIN_HUNGER
        || otyp === WAN_NOTHING
        || (otyp === RIN_POISON_RESISTANCE
            && state.urace?.mnum === PM_ORC)
        || (otyp === SCR_ENCHANT_WEAPON
            && state.urole?.mnum === PM_MONK)
        || (otyp === SPE_FORCE_BOLT
            && state.urole?.mnum === PM_WIZARD)) {
        return true;
    }
    if (obj.oclass !== SPBOOK_CLASS) return otyp === SPE_NOVEL;
    const type = objectType(obj, state);
    return type.oc_level > (gotLevel1Spellbook ? 3 : 1)
        || restrictedSpellDiscipline(otyp, state)
        || otyp === SPE_NOVEL;
}

// C ref: u_init.c ini_inv_mkobj_filter(). The 1001st rejected random
// object triggers the source's PANCAKE fallback.
export function ini_inv_mkobj_filter(
    oclass,
    gotLevel1Spellbook,
    env = {},
) {
    const normalized = inventoryInitEnv(env);
    let obj = mkobj(oclass, false, normalized);
    let trycnt = 0;
    while (rejectedRandomObject(obj, gotLevel1Spellbook, normalized)) {
        dealloc_obj(obj, normalized);
        ++trycnt;
        if (trycnt > 1000) {
            obj = mksobj(PANCAKE, true, false, normalized);
            break;
        }
        obj = mkobj(oclass, false, normalized);
    }
    return obj;
}

// C ref: u_init.c ini_inv_obj_substitution(). This intentionally changes
// only otyp; the generic object's initialization has already happened.
export function ini_inv_obj_substitution(trop, obj, state = game) {
    if (state.urace?.mnum === undefined || state.urace?.filecode === 'Hum')
        return obj.otyp;

    for (const substitution of INITIAL_INVENTORY_SUBSTITUTIONS) {
        if (substitution.race === state.urace.filecode
            && substitution.item_otyp === obj.otyp) {
            obj.otyp = substitution.subs_otyp;
            break;
        }
    }
    return obj.otyp;
}

function isGraystone(obj) {
    return obj.otyp === LUCKSTONE
        || obj.otyp === LOADSTONE
        || obj.otyp === FLINT
        || obj.otyp === TOUCHSTONE;
}

// C ref: u_init.c ini_inv_adjust_obj(). Returns true when the descriptor
// becomes one stack and the outer ini_inv quantity loop must stop.
export function ini_inv_adjust_obj(trop, obj, env = {}) {
    const normalized = inventoryInitEnv(env);
    const { state, random } = normalized;
    if (trop.trclass === COIN_CLASS) {
        obj.quan = Math.trunc(state.u?.umoney0 ?? 0);
        if (obj.quan < 1) {
            throw new RangeError(
                'starting money requires a positive u.umoney0',
            );
        }
        obj.owt = weight(obj, normalized);
        return false;
    }

    const type = objectType(obj, state);
    if (type.oc_uses_known) obj.known = true;
    obj.dknown = true;
    obj.bknown = true;
    obj.rknown = true;
    if (isContainer(obj) || obj.otyp === STATUE) {
        obj.cknown = true;
        obj.lknown = true;
        obj.otrapped = false;
    }
    obj.cursed = false;
    if (obj.opoisoned && state.u?.ualign?.type !== A_CHAOTIC)
        obj.opoisoned = false;

    let stop = false;
    if (obj.oclass === WEAPON_CLASS || obj.oclass === TOOL_CLASS) {
        obj.quan = trquan(trop, random);
        stop = true;
    } else if (obj.oclass === GEM_CLASS
               && isGraystone(obj)
               && obj.otyp !== FLINT) {
        obj.quan = 1;
    }

    if (trop.trspe !== UNDEF_SPE) {
        obj.spe = Math.trunc(trop.trspe);
        if (trop.trotyp === MAGIC_MARKER && obj.spe < 96)
            obj.spe += random.rn2(4);
    } else if (type.oc_class === RING_CLASS
               && type.oc_charged
               && obj.spe <= 0) {
        obj.spe = random.rne(3);
    }
    if (trop.trbless !== UNDEF_BLESS)
        obj.blessed = Boolean(trop.trbless);

    obj.owt = weight(obj, normalized);
    return stop;
}

function noteRandomObject(otyp, oclass, state) {
    const gn = prohibitionState(state);
    switch (otyp) {
    case WAN_POLYMORPH:
    case RIN_POLYMORPH:
    case POT_POLYMORPH:
        gn.nocreate = RIN_POLYMORPH_CONTROL;
        break;
    case RIN_POLYMORPH_CONTROL:
        gn.nocreate = RIN_POLYMORPH;
        gn.nocreate2 = SPE_POLYMORPH;
        gn.nocreate3 = POT_POLYMORPH;
        break;
    default:
        break;
    }
    if (oclass === RING_CLASS || oclass === SPBOOK_CLASS)
        gn.nocreate4 = otyp;
}

function validateInventoryTable(table) {
    if (!Array.isArray(table))
        throw new TypeError('ini_inv requires a starting inventory table');
    for (const trop of table) {
        if (!trop || typeof trop !== 'object')
            throw new TypeError('ini_inv table contains an invalid descriptor');
        if (!Number.isInteger(trop.trclass) || trop.trclass <= 0)
            throw new RangeError('ini_inv table contains an invalid class');
        if (!Number.isInteger(trop.trotyp) || trop.trotyp < UNDEF_TYP) {
            throw new RangeError('ini_inv table contains an invalid type');
        }
    }
}

// C ref: u_init.c ini_inv(). Role and race selection remain with their own
// orchestrators so their surrounding draws can be interleaved at source call
// boundaries.
export function ini_inv(table, env = {}) {
    const normalized = inventoryInitEnv(env);
    const { state, random } = normalized;
    validateInventoryTable(table);
    prohibitionState(state);
    if (state.u?.uroleplay?.pauper || table.length === 0)
        return state.invent ?? null;

    let index = 0;
    let quan = trquan(table[index], random);
    let gotLevel1Spellbook = false;

    while (index < table.length) {
        const trop = table[index];
        let obj;
        let otyp = trop.trotyp;
        if (otyp !== UNDEF_TYP) {
            obj = mksobj(otyp, true, false, normalized);
        } else {
            obj = ini_inv_mkobj_filter(
                trop.trclass,
                gotLevel1Spellbook,
                normalized,
            );
            otyp = obj.otyp;
            noteRandomObject(otyp, obj.oclass, state);
        }

        ini_inv_obj_substitution(trop, obj, state);

        // Preserve u_init.c's unusual continue boundary: skipping nudist
        // armor advances the descriptor without rolling its successor's
        // quantity. All source starting armor descriptors have quantity 1.
        if (state.u?.uroleplay?.nudist && obj.oclass === ARMOR_CLASS) {
            dealloc_obj(obj, normalized);
            ++index;
            continue;
        }

        if (ini_inv_adjust_obj(trop, obj, normalized)) quan = 1;
        obj = addinv(obj, normalized);
        if (!obj)
            throw new Error('ini_inv: addinv unexpectedly discarded an object');

        if (obj.oclass === SPBOOK_CLASS
            && objectType(obj, state).oc_level === 1) {
            gotLevel1Spellbook = true;
        }

        --quan;
        if (quan) continue;
        ++index;
        if (index < table.length) quan = trquan(table[index], random);
    }
    return state.invent ?? null;
}

export const _uInitInventoryInternals = Object.freeze({
    isGraystone,
    noteRandomObject,
    rejectedRandomObject,
    validateInventoryTable,
});
