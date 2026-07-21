// Object initialization and unidentified-description shuffling.
// C ref: src/o_init.c setgemprobs through oinit.

import { game } from './gstate.js';
import { PM_SAMURAI } from './monsters.js';
import { JAPANESE_ITEM_TYPES } from './objnam_data.js';
import { rn2 } from './rng.js';
import { HALLUC, HALLUC_RES } from './const.js';
import {
    AMULET_CLASS,
    AQUAMARINE,
    ARMOR_CLASS,
    CLOAK_OF_DISPLACEMENT,
    CLOAK_OF_PROTECTION,
    DIAMOND,
    EMERALD,
    FLUORITE,
    FIRST_OBJECT,
    GAUNTLETS_OF_DEXTERITY,
    GEM_CLASS,
    HELMET,
    HELM_OF_TELEPATHY,
    ILLOBJ_CLASS,
    IMMEDIATE,
    LAST_REAL_GEM,
    LEATHER_GLOVES,
    LEVITATION_BOOTS,
    MAXOCLASSES,
    NODIR,
    NUM_OBJECTS,
    POTION_CLASS,
    POT_WATER,
    RING_CLASS,
    SAPPHIRE,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    SPEED_BOOTS,
    TURQUOISE,
    VENOM_CLASS,
    WAN_NOTHING,
    WAND_CLASS,
    OBJ_DESCR,
    OBJ_NAME,
    objects_globals_init,
} from './objects.js';

function ensureObjectGlobals(state) {
    if (!Array.isArray(state.objects)
        || state.objects.length !== NUM_OBJECTS + 1) {
        objects_globals_init(state);
    }
    state.svb ??= {};
    state.svd ??= {};
    state.go ??= {};
    state.svb.bases ??= new Array(MAXOCLASSES + 2).fill(0);
    state.svd.disco ??= new Array(NUM_OBJECTS).fill(0);
    state.go.oclass_prob_totals ??= new Array(MAXOCLASSES).fill(0);
    return state.objects;
}

function ledger_no(dlev, state) {
    const dnum = Math.trunc(dlev?.dnum ?? 0);
    const dlevel = Math.trunc(dlev?.dlevel ?? 0);
    const ledgerStart = Math.trunc(state.dungeons?.[dnum]?.ledger_start ?? 0);
    return dlevel + ledgerStart;
}

function maxledgerno(state) {
    const dungeons = state.dungeons;
    if (!Array.isArray(dungeons) || dungeons.length === 0)
        return 0;

    let lastLedger = 0;
    let inferredStart = 0;
    for (const dungeon of dungeons) {
        const ledgerStart = Math.trunc(dungeon?.ledger_start ?? inferredStart);
        const levelCount = Math.trunc(dungeon?.num_dunlevs ?? 0);
        lastLedger = Math.max(lastLedger, ledgerStart + levelCount);
        inferredStart = ledgerStart + levelCount;
    }
    return lastLedger;
}

// C ref: src/o_init.c setgemprobs.
export function setgemprobs(dlev = null, state = game) {
    const objects = ensureObjectGlobals(state);
    const bases = state.svb.bases;
    let lev = 0;
    let sum = 0;

    if (dlev) {
        const ledger = ledger_no(dlev, state);
        const maxLedger = maxledgerno(state);
        lev = ledger > maxLedger ? maxLedger : ledger;
    }

    let first = bases[GEM_CLASS];
    let j = 0;
    for (; j < 9 - Math.trunc(lev / 3); ++j)
        objects[first + j].oc_prob = 0;
    first += j;

    if (first > LAST_REAL_GEM
        || objects[first].oc_class !== GEM_CLASS
        || OBJ_NAME(objects[first], state) === null) {
        throw new Error(
            `setgemprobs: invalid real-gem range (first=${first}, skipped=${j})`,
        );
    }

    for (j = first; j <= LAST_REAL_GEM; ++j) {
        objects[j].oc_prob = Math.trunc(
            (171 + j - first) / (LAST_REAL_GEM + 1 - first),
        );
    }

    for (j = bases[GEM_CLASS]; j < bases[GEM_CLASS + 1]; ++j)
        sum += objects[j].oc_prob;
    state.go.oclass_prob_totals[GEM_CLASS] = sum;
    return sum;
}

function copyObjectDescription(destination, source) {
    destination.oc_descr_idx = source.oc_descr_idx;
    destination.oc_color = source.oc_color;
}

// C ref: src/o_init.c randomize_gem_colors.
export function randomize_gem_colors(state = game, random = rn2) {
    const objects = ensureObjectGlobals(state);

    if (random(2))
        copyObjectDescription(objects[TURQUOISE], objects[SAPPHIRE]);
    if (random(2))
        copyObjectDescription(objects[AQUAMARINE], objects[SAPPHIRE]);

    switch (random(4)) {
    case 0:
        break;
    case 1:
        copyObjectDescription(objects[FLUORITE], objects[SAPPHIRE]);
        break;
    case 2:
        copyObjectDescription(objects[FLUORITE], objects[DIAMOND]);
        break;
    case 3:
        copyObjectDescription(objects[FLUORITE], objects[EMERALD]);
        break;
    default:
        throw new RangeError('randomize_gem_colors: rn2(4) returned out of range');
    }
}

// C ref: src/o_init.c shuffle.
export function shuffle(
    oLow,
    oHigh,
    doMaterial,
    state = game,
    random = rn2,
) {
    const objects = ensureObjectGlobals(state);
    let numToShuffle = 0;

    for (let j = oLow; j <= oHigh; ++j) {
        if (!objects[j].oc_name_known)
            ++numToShuffle;
    }
    if (numToShuffle < 2)
        return;

    for (let j = oLow; j <= oHigh; ++j) {
        if (objects[j].oc_name_known)
            continue;

        let i;
        do {
            i = j + random(oHigh - j + 1);
        } while (objects[i].oc_name_known);

        [objects[j].oc_descr_idx, objects[i].oc_descr_idx]
            = [objects[i].oc_descr_idx, objects[j].oc_descr_idx];
        [objects[j].oc_tough, objects[i].oc_tough]
            = [objects[i].oc_tough, objects[j].oc_tough];
        [objects[j].oc_color, objects[i].oc_color]
            = [objects[i].oc_color, objects[j].oc_color];

        if (doMaterial) {
            [objects[j].oc_material, objects[i].oc_material]
                = [objects[i].oc_material, objects[j].oc_material];
        }
    }
}

// C ref: src/o_init.c init_oclass_probs.
export function init_oclass_probs(state = game) {
    const objects = ensureObjectGlobals(state);
    const bases = state.svb.bases;
    const totals = state.go.oclass_prob_totals;

    for (let objectClass = 0; objectClass < MAXOCLASSES; ++objectClass) {
        let sum = 0;
        for (let i = bases[objectClass]; i < bases[objectClass + 1]; ++i)
            sum += objects[i].oc_prob;

        if (sum <= 0
            && objectClass !== ILLOBJ_CLASS
            && bases[objectClass] !== bases[objectClass + 1]) {
            for (let i = bases[objectClass]; i < bases[objectClass + 1]; ++i) {
                objects[i].oc_prob = 1;
                ++sum;
            }
        }
        totals[objectClass] = sum;
    }
    return totals;
}

// C ref: src/o_init.c obj_shuffle_range. Returning a pair replaces C's two
// output pointers without changing the range-selection rules.
export function obj_shuffle_range(otyp, state = game) {
    const objects = ensureObjectGlobals(state);
    const bases = state.svb.bases;
    const objectClass = objects[otyp].oc_class;
    let low = otyp;
    let high = otyp;

    switch (objectClass) {
    case ARMOR_CLASS:
        if (otyp >= HELMET && otyp <= HELM_OF_TELEPATHY) {
            low = HELMET;
            high = HELM_OF_TELEPATHY;
        } else if (otyp >= LEATHER_GLOVES
                   && otyp <= GAUNTLETS_OF_DEXTERITY) {
            low = LEATHER_GLOVES;
            high = GAUNTLETS_OF_DEXTERITY;
        } else if (otyp >= CLOAK_OF_PROTECTION
                   && otyp <= CLOAK_OF_DISPLACEMENT) {
            low = CLOAK_OF_PROTECTION;
            high = CLOAK_OF_DISPLACEMENT;
        } else if (otyp >= SPEED_BOOTS && otyp <= LEVITATION_BOOTS) {
            low = SPEED_BOOTS;
            high = LEVITATION_BOOTS;
        }
        break;
    case POTION_CLASS:
        low = bases[POTION_CLASS];
        high = POT_WATER - 1;
        break;
    case AMULET_CLASS:
    case SCROLL_CLASS:
    case SPBOOK_CLASS: {
        low = bases[objectClass];
        let i = low;
        for (; i < NUM_OBJECTS && objects[i].oc_class === objectClass; ++i) {
            if (objects[i].oc_unique || !objects[i].oc_magic)
                break;
        }
        high = i - 1;
        break;
    }
    case RING_CLASS:
    case WAND_CLASS:
    case VENOM_CLASS:
        low = bases[objectClass];
        high = bases[objectClass + 1] - 1;
        break;
    default:
        break;
    }

    if (otyp < low || otyp > high)
        low = high = otyp;
    return [low, high];
}

// C ref: src/o_init.c shuffle_all.
export function shuffle_all(state = game, random = rn2) {
    const shuffleClasses = [
        AMULET_CLASS,
        POTION_CLASS,
        RING_CLASS,
        SCROLL_CLASS,
        SPBOOK_CLASS,
        WAND_CLASS,
        VENOM_CLASS,
    ];
    const shuffleTypes = [
        HELMET,
        LEATHER_GLOVES,
        CLOAK_OF_PROTECTION,
        SPEED_BOOTS,
    ];
    const bases = state.svb.bases;

    for (const objectClass of shuffleClasses) {
        const [first, last] = obj_shuffle_range(bases[objectClass], state);
        shuffle(first, last, true, state, random);
    }
    for (const objectType of shuffleTypes) {
        const [first, last] = obj_shuffle_range(objectType, state);
        shuffle(first, last, false, state, random);
    }
}

// C ref: src/o_init.c init_objects. jsmain.js normally creates the mutable
// catalog during early initialization; the guard also supports focused calls.
export function init_objects(state = game, random = rn2) {
    const objects = ensureObjectGlobals(state);
    state.svb ??= {};
    state.go ??= {};
    const bases = state.svb.bases = new Array(MAXOCLASSES + 2).fill(0);
    state.svd ??= {};
    state.svd.disco = new Array(NUM_OBJECTS).fill(0);
    state.go.oclass_prob_totals = new Array(MAXOCLASSES).fill(0);

    for (let i = 1; i < MAXOCLASSES; ++i) {
        if (objects[i].oc_class !== i) {
            throw new Error(
                `init_objects: generic object ${i} has class ${objects[i].oc_class}`,
            );
        }
    }

    for (let i = 0; i < NUM_OBJECTS; ++i) {
        objects[i].oc_name_idx = i;
        objects[i].oc_descr_idx = i;
    }

    let first = MAXOCLASSES;
    let previousClass = -1;
    while (first < NUM_OBJECTS) {
        const objectClass = objects[first].oc_class;
        if (objectClass < previousClass) {
            throw new Error(
                `init_objects: object ${first} class ${objectClass} is out of order`,
            );
        }

        let last = first + 1;
        while (last < NUM_OBJECTS
               && objects[last].oc_class === objectClass) {
            ++last;
        }
        bases[objectClass] = first;

        if (objectClass === GEM_CLASS) {
            setgemprobs(null, state);
            randomize_gem_colors(state, random);
        }
        first = last;
        previousClass = objectClass;
    }

    bases[MAXOCLASSES] = NUM_OBJECTS;
    bases[MAXOCLASSES + 1] = NUM_OBJECTS;
    for (let last = MAXOCLASSES - 1; last >= 0; --last) {
        if (!bases[last])
            bases[last] = bases[last + 1];
    }

    for (let i = MAXOCLASSES; i < NUM_OBJECTS; ++i) {
        const hasDescription = OBJ_DESCR(objects[i], state) !== null;
        const nameKnown = objects[i].oc_name_known !== 0;
        if (hasDescription === nameKnown)
            objects[i].oc_name_known = nameKnown ? 0 : 1;
    }

    init_oclass_probs(state);
    shuffle_all(state, random);
    objects[WAN_NOTHING].oc_dir = random(2) ? NODIR : IMMEDIATE;
    return objects;
}

// C ref: src/o_init.c oinit.
export function oinit(state = game) {
    return setgemprobs(state.u?.uz ?? null, state);
}

function propertyActive(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function hallucinating(state) {
    return propertyActive(state.u, HALLUC)
        && !propertyActive(state.u, HALLUC_RES);
}

// C ref: o_init.c discover_object().  New-game callers execute before the
// move loop, so the live inventory refresh, gem-price, and wisdom-exercise
// branches are deliberately rejected rather than silently approximated.
export function discover_object(
    oindx,
    markAsKnown,
    markAsEncountered,
    creditHero,
    state = game,
) {
    const objects = ensureObjectGlobals(state);
    if (oindx < FIRST_OBJECT) return false;
    const objectType = objects[oindx];
    if (!objectType)
        throw new RangeError(`discover_object: invalid object type ${oindx}`);

    const learnsName = !objectType.oc_name_known && markAsKnown;
    const encounters = !objectType.oc_encountered && markAsEncountered;
    const samuraiName = state.urole?.mnum === PM_SAMURAI
        && JAPANESE_ITEM_TYPES.has(oindx);
    if (!learnsName && !encounters && !samuraiName) return false;
    if (learnsName && (creditHero || state.program_state?.in_moveloop)) {
        throw new Error(
            'discover_object live knowledge effects are not implemented',
        );
    }

    const objectClass = objectType.oc_class;
    const classEnd = state.svb.bases[objectClass + 1] ?? NUM_OBJECTS;
    let index = state.svb.bases[objectClass];
    while (index < classEnd && state.svd.disco[index]
        && state.svd.disco[index] !== oindx) ++index;
    if (index >= classEnd)
        throw new Error(`discover_object: class ${objectClass} discovery list is full`);
    state.svd.disco[index] = oindx;
    if (markAsEncountered) objectType.oc_encountered = 1;
    if (markAsKnown) objectType.oc_name_known = 1;
    return true;
}

// C ref: o_init.c observe_object().
export function observe_object(obj, state = game) {
    if (!obj || typeof obj !== 'object')
        throw new TypeError('observe_object requires an object');
    if (obj.otyp >= FIRST_OBJECT && !hallucinating(state)) {
        obj.dknown = true;
        discover_object(obj.otyp, false, true, false, state);
    }
    return obj;
}
