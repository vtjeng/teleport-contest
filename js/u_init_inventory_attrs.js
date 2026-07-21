// Starting role/race inventory orchestration, discoveries, and attributes.
// C refs: src/u_init.c u_init_role(), u_init_race(), knows_object(),
// knows_class(), u_init_carry_attr_boost(), and u_init_inventory_attrs();
// src/do_wear.c find_ac().

import {
    AC_MAX,
    A_CON,
    A_STR,
    FIXED_ABIL,
    FROMOUTSIDE,
    INTRINSIC,
    JUMPING,
    PROTECTION,
    P_BOW,
    P_CROSSBOW,
    P_DAGGER,
    P_LANCE,
    P_POLEARMS,
    P_SPEAR,
} from './const.js';
import { effective_attribute, init_attr, vary_init_attr } from './attrib.js';
import { game } from './gstate.js';
import { resetInventory } from './invent.js';
import { discover_object } from './o_init.js';
import { JAPANESE_ITEM_TYPES } from './objnam_data.js';
import {
    PM_ARCHEOLOGIST,
    PM_BARBARIAN,
    PM_CAVE_DWELLER,
    PM_CLERIC,
    PM_DWARF,
    PM_ELF,
    PM_GNOME,
    PM_HEALER,
    PM_HUMAN,
    PM_KNIGHT,
    PM_MONK,
    PM_ORC,
    PM_RANGER,
    PM_ROGUE,
    PM_SAMURAI,
    PM_TOURIST,
    PM_VALKYRIE,
    PM_WIZARD,
} from './monsters.js';
import * as O from './objects.js';
import { rn1, rn2, rnd, rne } from './rng.js';
import {
    ini_inv,
    reset_ini_inv_nocreate,
} from './u_init_inventory.js';
import {
    ELF_STARTING_INSTRUMENT_ROLES,
    STARTING_INVENTORY_TABLES,
    rollElfStartingInstrument,
} from './u_init_inventory_data.js';

const DEFAULT_RANDOM = Object.freeze({ rn1, rn2, rnd, rne });

const {
    Archeologist,
    Barbarian_0,
    Barbarian_1,
    Cave_man,
    Healer,
    Knight,
    Monk,
    Priest,
    Ranger,
    Rogue,
    Samurai,
    Tourist,
    Valkyrie,
    Wizard,
    Healing_book,
    Protection_book,
    Confuse_monster_book,
    Tinopener,
    Magicmarker,
    Lamp,
    Blindfold,
    Xtra_food,
    Leash,
    Towel,
    Wishing,
    Money,
} = STARTING_INVENTORY_TABLES;

const ELVEN_OBJECTS = Object.freeze([
    O.ELVEN_SHORT_SWORD,
    O.ELVEN_ARROW,
    O.ELVEN_BOW,
    O.ELVEN_SPEAR,
    O.ELVEN_DAGGER,
    O.ELVEN_BROADSWORD,
    O.ELVEN_MITHRIL_COAT,
    O.ELVEN_LEATHER_HELM,
    O.ELVEN_SHIELD,
    O.ELVEN_BOOTS,
    O.ELVEN_CLOAK,
]);

const DWARVISH_OBJECTS = Object.freeze([
    O.DWARVISH_SPEAR,
    O.DWARVISH_SHORT_SWORD,
    O.DWARVISH_MATTOCK,
    O.DWARVISH_IRON_HELM,
    O.DWARVISH_MITHRIL_COAT,
    O.DWARVISH_CLOAK,
    O.DWARVISH_ROUNDSHIELD,
]);

const ORCISH_OBJECTS = Object.freeze([
    O.ORCISH_SHORT_SWORD,
    O.ORCISH_ARROW,
    O.ORCISH_BOW,
    O.ORCISH_SPEAR,
    O.ORCISH_DAGGER,
    O.ORCISH_CHAIN_MAIL,
    O.ORCISH_RING_MAIL,
    O.ORCISH_HELM,
    O.ORCISH_SHIELD,
    O.URUK_HAI_SHIELD,
    O.ORCISH_CLOAK,
]);

// Magic harp remains in the shared objnam.c table because discover_object()
// recognizes every entry; u_init_role() separately skips magical objects.
const JAPANESE_OBJECTS = JAPANESE_ITEM_TYPES;

function requireInventoryCatalog(state) {
    if (!Array.isArray(state.objects)
        || !Array.isArray(state.svb?.bases)) {
        throw new Error('starting inventory requires init_objects first');
    }
    return state.objects;
}

export function knows_object(otyp, overridePauper = false, state = game) {
    if (state.u?.uroleplay?.pauper && !overridePauper) return false;
    return discover_object(otyp, true, false, false, state);
}

function isPole(object) {
    return object.oc_skill === P_POLEARMS || object.oc_skill === P_LANCE;
}

function isLauncher(object) {
    return object.oc_skill >= P_BOW && object.oc_skill <= P_CROSSBOW;
}

function isAmmo(object) {
    return object.oc_skill >= -P_CROSSBOW && object.oc_skill <= -P_BOW;
}

function isSpear(object) {
    return object.oc_skill === P_SPEAR;
}

export function knows_class(objectClass, state = game) {
    if (state.u?.uroleplay?.pauper) return 0;
    const objects = requireInventoryCatalog(state);
    const first = state.svb.bases[objectClass];
    const last = state.svb.bases[objectClass + 1];
    const role = state.urole?.mnum;
    let count = 0;

    for (let otyp = first; otyp < last; ++otyp) {
        if (otyp === O.CORNUTHAUM
            || otyp === O.DUNCE_CAP
            || otyp === O.SMALL_SHIELD) continue;

        const object = objects[otyp];
        if (objectClass === O.WEAPON_CLASS) {
            if (role !== PM_KNIGHT && role !== PM_SAMURAI && isPole(object))
                continue;
            if (role === PM_RANGER
                && !isLauncher(object) && !isAmmo(object) && !isSpear(object)) {
                continue;
            }
            if (role === PM_ROGUE && object.oc_skill !== P_DAGGER)
                continue;
        }
        if (object.oc_class === objectClass && !object.oc_magic
            && knows_object(otyp, false, state)) count += 1;
    }
    return count;
}

function normalizedEnvironment(state, random, options) {
    if (!state?.u || !state.urole || !state.urace)
        throw new Error('starting inventory requires initialized hero role and race');
    if (typeof random?.rn2 !== 'function' || typeof random?.rnd !== 'function')
        throw new TypeError('starting inventory requires rn2 and rnd');
    const iniInv = options?.iniInv ?? ini_inv;
    if (typeof iniInv !== 'function')
        throw new TypeError('starting inventory requires an iniInv callback');
    return {
        state,
        random,
        options: options ?? {},
        iniInv,
        objectEnv: {
            state,
            random,
            hooks: options.objectHooks ?? options.hooks ?? {},
        },
    };
}

function give(table, env) {
    return env.iniInv(table, env.objectEnv);
}

function knowEach(types, state) {
    for (const type of types) knows_object(type, false, state);
}

// Role-specific state and ini_inv() calls remain in one function so every
// conditional draw stays on the same side of its corresponding object calls.
export function u_init_role(
    state = game,
    random = DEFAULT_RANDOM,
    options = {},
) {
    const env = normalizedEnvironment(state, random, options);
    state.moves = 1;

    switch (state.urole.mnum) {
    case PM_ARCHEOLOGIST:
        give(Archeologist, env);
        if (!random.rn2(10)) give(Tinopener, env);
        else if (!random.rn2(4)) give(Lamp, env);
        else if (!random.rn2(5)) give(Magicmarker, env);
        knows_object(O.SACK, false, state);
        knows_object(O.TOUCHSTONE, false, state);
        break;
    case PM_BARBARIAN:
        give(random.rn2(100) >= 50 ? Barbarian_0 : Barbarian_1, env);
        if (!random.rn2(6)) give(Lamp, env);
        knows_class(O.WEAPON_CLASS, state);
        knows_class(O.ARMOR_CLASS, state);
        break;
    case PM_CAVE_DWELLER:
        give(Cave_man, env);
        break;
    case PM_HEALER:
        state.u.umoney0 = random.rn2(1000) + 1001;
        give(Healer, env);
        if (!random.rn2(25)) give(Lamp, env);
        knows_object(O.POT_FULL_HEALING, false, state);
        break;
    case PM_KNIGHT:
        give(Knight, env);
        knows_class(O.WEAPON_CLASS, state);
        knows_class(O.ARMOR_CLASS, state);
        state.u.uprops[JUMPING].intrinsic |= FROMOUTSIDE;
        break;
    case PM_MONK: {
        const spellbooks = [
            Healing_book,
            Protection_book,
            Confuse_monster_book,
        ];
        give(Monk, env);
        give(spellbooks[Math.trunc(random.rn2(90) / 30)], env);
        if (!random.rn2(4)) give(Magicmarker, env);
        else if (!random.rn2(10)) give(Lamp, env);
        knows_class(O.ARMOR_CLASS, state);
        knows_object(O.SHURIKEN, false, state);
        break;
    }
    case PM_CLERIC:
        give(Priest, env);
        if (!random.rn2(5)) give(Magicmarker, env);
        else if (!random.rn2(10)) give(Lamp, env);
        knows_object(O.POT_WATER, true, state);
        break;
    case PM_RANGER:
        give(Ranger, env);
        knows_class(O.WEAPON_CLASS, state);
        break;
    case PM_ROGUE:
        state.u.umoney0 = 0;
        give(Rogue, env);
        if (!random.rn2(5)) give(Blindfold, env);
        knows_object(O.SACK, false, state);
        knows_class(O.WEAPON_CLASS, state);
        break;
    case PM_SAMURAI:
        give(Samurai, env);
        if (!random.rn2(5)) give(Blindfold, env);
        knows_class(O.WEAPON_CLASS, state);
        knows_class(O.ARMOR_CLASS, state);
        for (let otyp = O.MAXOCLASSES; otyp < O.NUM_OBJECTS; ++otyp) {
            if (!state.objects[otyp].oc_magic && JAPANESE_OBJECTS.has(otyp))
                knows_object(otyp, false, state);
        }
        break;
    case PM_TOURIST:
        state.u.umoney0 = random.rnd(1000);
        give(Tourist, env);
        if (!random.rn2(25)) give(Tinopener, env);
        else if (!random.rn2(25)) give(Leash, env);
        else if (!random.rn2(25)) give(Towel, env);
        else if (!random.rn2(20)) give(Magicmarker, env);
        break;
    case PM_VALKYRIE:
        give(Valkyrie, env);
        if (!random.rn2(6)) give(Lamp, env);
        knows_class(O.WEAPON_CLASS, state);
        knows_class(O.ARMOR_CLASS, state);
        break;
    case PM_WIZARD:
        give(Wizard, env);
        if (!random.rn2(5)) give(Blindfold, env);
        break;
    default:
        break;
    }

    reset_ini_inv_nocreate(state);
    return state;
}

export function u_init_race(
    state = game,
    random = DEFAULT_RANDOM,
    options = {},
) {
    const env = normalizedEnvironment(state, random, options);
    switch (state.urace.mnum) {
    case PM_HUMAN:
        break;
    case PM_ELF:
        if (ELF_STARTING_INSTRUMENT_ROLES.includes(state.urole.filecode)) {
            // ROLL_FROM(trotyp) happens before ini_inv(), even for paupers.
            give(rollElfStartingInstrument(random), env);
        }
        knowEach(ELVEN_OBJECTS, state);
        break;
    case PM_DWARF:
        knowEach(DWARVISH_OBJECTS, state);
        break;
    case PM_GNOME:
        break;
    case PM_ORC:
        if (state.urole.mnum !== PM_WIZARD) give(Xtra_food, env);
        knowEach(ORCISH_OBJECTS, state);
        break;
    default:
        break;
    }
    return state;
}

function effectiveStrengthForCapacity(state) {
    const strength = effective_attribute(state, A_STR);
    if (strength <= 18) return strength;
    if (strength <= 121) return 19 + Math.trunc(strength / 50);
    return Math.min(strength, 125) - 100;
}

// This is weight_cap() at the new-game boundary: the hero is not polymorphed,
// levitating, mounted, wounded, or wearing attribute-changing gear yet.
export function initial_weight_cap(state = game) {
    return Math.min(
        1000,
        25 * (effectiveStrengthForCapacity(state)
            + effective_attribute(state, A_CON)) + 50,
    );
}

export function initial_inv_weight(state = game) {
    let weight = 0;
    for (let object = state.invent; object; object = object.nobj) {
        if (object.oclass === O.COIN_CLASS)
            weight += Math.trunc((Math.trunc(object.quan) + 50) / 100);
        else
            weight += Math.trunc(object.owt ?? 0);
    }
    state.gw ??= {};
    state.gw.wc = initial_weight_cap(state);
    return weight - state.gw.wc;
}

function adjustCarryAttribute(index, state) {
    const u = state.u;
    if (u.uprops?.[FIXED_ABIL]?.extrinsic) return false;
    const base = u.acurr.a;
    const maximum = u.amax.a;
    const old = effective_attribute(state, index);
    base[index] += 1;
    if (base[index] > maximum[index]) {
        maximum[index] = base[index];
        const racialMaximum = Math.trunc(state.urace.attrmax[index]);
        if (maximum[index] > racialMaximum)
            base[index] = maximum[index] = racialMaximum;
    }
    if (effective_attribute(state, index) === old) return false;
    if (Array.isArray(u.aexe)) u.aexe[index] = 0;
    else if (Array.isArray(u.aexe?.a)) u.aexe.a[index] = 0;
    state.disp ??= {};
    state.disp.botl = true;
    return true;
}

export function u_init_carry_attr_boost(
    state = game,
    {
        invWeight = initial_inv_weight,
        adjustAttribute = adjustCarryAttribute,
    } = {},
) {
    while (invWeight(state) > 0) {
        if (adjustAttribute(A_STR, state)) continue;
        if (adjustAttribute(A_CON, state)) continue;
        break;
    }
    return state;
}

function containedGold(container, evenIfUnknown) {
    let amount = 0;
    for (let object = container.cobj; object; object = object.nobj) {
        if (object.oclass === O.COIN_CLASS) amount += Math.trunc(object.quan);
        else if (object.cobj && (object.cknown || evenIfUnknown))
            amount += containedGold(object, evenIfUnknown);
    }
    return amount;
}

export function hidden_gold(evenIfUnknown, state = game) {
    let amount = 0;
    for (let object = state.invent; object; object = object.nobj) {
        if (object.cobj && (object.cknown || evenIfUnknown))
            amount += containedGold(object, evenIfUnknown);
    }
    return amount;
}

export function u_init_inventory_attrs(
    state = game,
    random = DEFAULT_RANDOM,
    options = {},
) {
    const env = normalizedEnvironment(state, random, options);
    const reset = options.resetInventory
        ?? ((resetState) => resetInventory({
            state: resetState,
            hooks: options.objectHooks ?? options.hooks ?? {},
        }));
    reset(state);
    state.u.umoney0 = 0;
    u_init_role(state, random, options);
    u_init_race(state, random, options);

    if (state.discover) give(Wishing, env);
    if (state.u.umoney0) give(Money, env);
    state.u.umoney0 += hidden_gold(true, state);

    init_attr(75, state, random);
    vary_init_attr(state, random);
    u_init_carry_attr_boost(state, options);
    return state;
}

function armorBonus(object, state) {
    const base = Math.trunc(state.objects[object.otyp].a_ac);
    const erosion = Math.max(
        Math.trunc(object.oeroded ?? 0),
        Math.trunc(object.oeroded2 ?? 0),
    );
    return base + Math.trunc(object.spe ?? 0) - Math.min(erosion, base);
}

// C ref: do_wear.c find_ac(). Equipment pointers are flattened globals on
// state, matching the inventory module's uwep/uquiver representation.
export function find_ac(state = game) {
    const u = state.u;
    const form = state.mons?.[u.umonnum] ?? state.youmonst?.data;
    if (!form) throw new Error('find_ac requires initialized monster data');
    let armorClass = Math.trunc(form.ac);

    for (const slot of [
        'uarm', 'uarmc', 'uarmh', 'uarmf', 'uarms', 'uarmg', 'uarmu',
    ]) {
        if (state[slot]) armorClass -= armorBonus(state[slot], state);
    }
    if (state.uleft?.otyp === O.RIN_PROTECTION)
        armorClass -= Math.trunc(state.uleft.spe ?? 0);
    if (state.uright?.otyp === O.RIN_PROTECTION)
        armorClass -= Math.trunc(state.uright.spe ?? 0);
    if (state.uamul?.otyp === O.AMULET_OF_GUARDING) armorClass -= 2;
    if ((u.uprops?.[PROTECTION]?.intrinsic ?? 0) & INTRINSIC)
        armorClass -= Math.trunc(u.ublessed ?? 0);
    armorClass -= Math.trunc(u.uspellprot ?? 0);

    if (Math.abs(armorClass) > AC_MAX)
        armorClass = Math.sign(armorClass) * AC_MAX;
    if (armorClass !== u.uac) {
        u.uac = armorClass;
        state.disp ??= {};
        state.disp.botl = true;
    }
    return armorClass;
}

export const _uInitInventoryAttrInternals = Object.freeze({
    DWARVISH_OBJECTS,
    ELVEN_OBJECTS,
    JAPANESE_OBJECTS,
    ORCISH_OBJECTS,
    adjustCarryAttribute,
    armorBonus,
    effectiveAttribute: effective_attribute,
    effectiveStrengthForCapacity,
});
