// Object initialization and unidentified-description shuffling.
// C ref: src/o_init.c setgemprobs through oinit.

import { disp_artifact_discoveries, dump_artifact_info, NROFARTIFACTS } from './artifacts.js';
import { exercise_nonphysical } from './attrib.js';
import { game } from './gstate.js';
import {
    encodeUtf8ByteString, strncmpi, strstri, strsubst, truncateByteString,
} from './hacklib.js';
import {
    _getobjInternals, let_to_name, preflight_update_inventory,
    update_inventory,
} from './invent.js';
import { PM_SAMURAI } from './monsters.js';
import { obj_typename } from './objnam.js';
import { JAPANESE_ITEM_TYPES } from './objnam_data.js';
import { rn2 } from './rng.js';
import { note_unported } from './unported.js';
import { append_price_quote, gem_learned } from './shk.js';
import {
    A_WIS, BUFSZ, ECMD_OK, HALLUC, HALLUC_RES, MENU_COMBINATION,
    MENU_PARTIAL, MENU_TRADITIONAL, PICK_ONE,
} from './const.js';
import { clearTtyMessageWindow, ttyPline } from './tty_message.js';
import { menuTitleStyle } from './tty_menu.js';
import { add_menu_heading, select_menu } from './windows.js';
import { def_char_to_objclass } from './drawing.js';
import { DEFAULT_PRIMARY_SYMBOLS, SYM_OFF_O } from './symbol_data.js';
import {
    AMULET_CLASS,
    AMULET_OF_YENDOR,
    AQUAMARINE,
    ARMOR_CLASS,
    BELL_OF_OPENING,
    CANDELABRUM_OF_INVOCATION,
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
    MAGIC_HARP,
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
    SPE_BOOK_OF_THE_DEAD,
    STRANGE_OBJECT,
    TURQUOISE,
    VENOM_CLASS,
    WAN_NOTHING,
    WAND_CLASS,
    WOODEN_HARP,
    OBJ_DESCR,
    OBJ_NAME,
    SLIME_MOLD,
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

// C ref: o_init.c objdescr_is() (352-364). TRUE when the object's unidentified
// description matches the given string. The hero's knowledge is irrelevant:
// the match is against the object's actual randomized description.
export function objdescr_is(obj, descr, state = game) {
    if (!obj) return false;
    const type = state.objects[obj.otyp];
    const objDescr = OBJ_DESCR(type, state);
    return objDescr != null && objDescr === descr;
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

// C ref: o_init.c discover_object(). The source calls shk.c gem_learned()
// directly when a gem becomes identified during live play.
export function discover_object(
    oindx,
    markAsKnown,
    markAsEncountered,
    creditHero,
    state = game,
    rawEnv = {},
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

    const objectClass = objectType.oc_class;
    const liveKnowledge = learnsName
        && Boolean(state.program_state?.in_moveloop)
        && !state.program_state?.gameover;
    const env = {
        ...rawEnv,
        state,
        random: rawEnv.random ?? { rn2 },
        hooks: rawEnv.hooks ?? {},
    };
    if (learnsName && creditHero
        && typeof env.random.rn2 !== 'function') {
        throw new TypeError('discover_object exercise requires rn2');
    }
    if (liveKnowledge) preflight_update_inventory(env);

    const classEnd = state.svb.bases[objectClass + 1] ?? NUM_OBJECTS;
    let index = state.svb.bases[objectClass];
    while (index < classEnd && state.svd.disco[index]
        && state.svd.disco[index] !== oindx) ++index;
    if (index >= classEnd)
        throw new Error(`discover_object: class ${objectClass} discovery list is full`);
    state.svd.disco[index] = oindx;
    if (markAsEncountered) objectType.oc_encountered = 1;
    if (learnsName) {
        objectType.oc_name_known = 1;
        if (creditHero)
            exercise_nonphysical(A_WIS, true, state, env.random);
        if (liveKnowledge) {
            if (objectClass === GEM_CLASS) gem_learned(oindx, state);
            update_inventory(env);
        }
    }
    return true;
}

// C ref: o_init.c undiscover_object() (498-523). When a user-assigned name
// (oc_uname) is cleared and the object is neither formally identified
// (oc_name_known) nor encountered (oc_encountered), remove it from the
// disco[] discovery list. Its GEM_CLASS arm recalculates unpaid gem prices.
export function undiscover_object(oindx, state = game) {
    const objects = ensureObjectGlobals(state);
    const type = objects[oindx];
    if (!type) return;
    if (type.oc_name_known || type.oc_encountered) return;

    const acls = type.oc_class;
    const bases = state.svb.bases;
    let found = false;
    let dindx;
    for (dindx = bases[acls];
         dindx < NUM_OBJECTS && state.svd.disco[dindx] !== 0
             && objects[dindx].oc_class === acls;
         dindx++) {
        if (found)
            state.svd.disco[dindx - 1] = state.svd.disco[dindx];
        else if (state.svd.disco[dindx] === oindx)
            found = true;
    }

    if (found)
        state.svd.disco[dindx - 1] = 0;
    // C: impossible("named object not in disco") -- should not happen

    if (found && acls === GEM_CLASS) gem_learned(oindx, state);
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

// C ref: o_init.c interesting_to_discover(). A Samurai sees the Japanese-named
// types as pre-discovered; every other type qualifies once it has been named
// or encountered and has a randomized description to reveal.
export function interesting_to_discover(i, state = game) {
    const type = state.objects[i];

    if (state.urole?.mnum === PM_SAMURAI && JAPANESE_ITEM_TYPES.has(i))
        return true;

    return Boolean(type.oc_uname
        || ((type.oc_name_known || type.oc_encountered)
            && OBJ_DESCR(type, state) !== null));
}

// C ref: o_init.c uniq_objs[].
const UNIQ_OBJS = Object.freeze([
    AMULET_OF_YENDOR,
    BELL_OF_OPENING,
    SPE_BOOK_OF_THE_DEAD,
    CANDELABRUM_OF_INVOCATION,
]);

// C refs: o_init.c disco_order_let[] and disco_orders_descr[]. The trailing
// null that terminates the C descriptions has no JavaScript counterpart.
const DISCO_ORDER_LET = 'osca';
const DISCO_ORDERS_DESCR = Object.freeze([
    'by order of discovery within each class',
    'sortloot order (by class with some sub-class groupings)',
    'alphabetical within each class',
    'alphabetical across all classes',
]);

// C ref: o_init.c choose_disco_sort() (611-655). The same menu is used by
// dodiscovered(), doclassdisco(), and options.c optfn_sortdiscoveries().
export async function choose_disco_sort(mode, state = game) {
    const items = DISCO_ORDER_LET.split('').map((order, index) => ({
        value: order,
        selector: order,
        label: DISCO_ORDERS_DESCR[index],
        selected: order === state.flags.discosort,
    }));
    if (mode === 2) {
        items.push(
            { text: '' },
            { text: 'Note: full alphabetical and alphabetical within class' },
            { text: '      are equivalent for single class discovery, but' },
            { text: '      will matter for future use of total discoveries.' },
        );
    }

    const selected = await select_menu(state, {
        title: 'Ordering of discoveries',
        items,
        how: PICK_ONE,
        cancelValue: -1,
        returnSelections: true,
    });
    if (selected === -1) return -1;

    const count = selected.length;
    if (count > 0) {
        let choice = selected[0].value;
        // C skips the preselected row when select_menu reports several rows.
        if (count > 1 && choice === state.flags.discosort)
            choice = selected[1].value;
        state.flags.discosort = choice;
    }
    return count;
}

// C refs: o_init.c discovered_cmp(), sortloot_descr(), and oclass_to_name().
export function discovered_cmp(first, second) {
    return strncmpi(first.slice(2), second.slice(2), -1);
}

// C ref: o_init.c disco_output_sorted(). qsort() compares after the two-byte
// encounter marker. Sortloot rows carry a six-byte key after that marker;
// C overwrites its final digit with the marker, then advances six bytes to
// show the marker and typename while keeping the key out of the text window.
function disco_output_sorted(lines, lootsort) {
    const sorted = [...lines].sort(discovered_cmp);
    return lootsort
        ? sorted.map((line) => line[0] + line.slice(7))
        : sorted;
}

export function sortloot_descr(otyp, state = game) {
    const type = state.objects[otyp];
    const obj = {
        otyp,
        oclass: type.oc_class,
        dknown: true,
        known: Boolean(type.oc_name_known || !type.oc_uses_known),
        corpsenm: -1, // NON_PM suppresses statue and figurine details.
        spe: otyp === SLIME_MOLD ? state.svc?.context?.current_fruit : 0,
    };
    const sortItem = { obj: null, str: null };
    _getobjInternals.loot_classify(sortItem, obj, state);
    return String(sortItem.orderclass).padStart(2, '0')
        + String(sortItem.subclass).padStart(2, '0')
        + String(sortItem.disco) + ' ';
}

export function oclass_to_name(oclass) {
    return let_to_name(oclass, false, false).toLowerCase();
}

function classSymbol(oclass) {
    return String.fromCharCode(DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + oclass]);
}

// C ref: o_init.c doclassdisco() (891-1128), the #knownclass command.
// The command owns menu and text-window creation in this port.
export async function doclassdisco(state = game, {
    message = ttyPline,
    textWindow,
    yesNo,
} = {}) {
    if (typeof textWindow !== 'function' || typeof yesNo !== 'function')
        throw new TypeError('doclassdisco needs textWindow and yesNo owners');

    if (!state.flags.discosort || !DISCO_ORDER_LET.includes(state.flags.discosort))
        state.flags.discosort = 'o';
    if (state.iflags?.menu_requested
        && await choose_disco_sort(2, state) < 0)
        return ECMD_OK;

    const alphabetized = state.flags.discosort === 'a'
        || state.flags.discosort === 'c';
    const lootsort = state.flags.discosort === 's';
    const traditional = state.flags.menu_style === MENU_TRADITIONAL
        || state.flags.menu_style === MENU_COMBINATION;
    const classes = [...(state.flags.inv_order ?? [])];
    if (!classes.includes(VENOM_CLASS)) classes.push(VENOM_CLASS);

    const discoveredSymbols = [];
    for (const uidx of UNIQ_OBJS) {
        const type = state.objects[uidx];
        if (type.oc_name_known
            || (type.oc_encountered && uidx !== AMULET_OF_YENDOR)) {
            discoveredSymbols.push('u');
            break;
        }
    }
    if (disp_artifact_discoveries(state) > 0) discoveredSymbols.push('a');
    for (const oclass of classes) {
        const symbol = classSymbol(oclass);
        for (let i = state.svb.bases[oclass]; i < NUM_OBJECTS
            && state.objects[i].oc_class === oclass; ++i) {
            const dis = state.svd.disco[i];
            if (dis && interesting_to_discover(dis, state)) {
                if (!discoveredSymbols.includes(symbol))
                    discoveredSymbols.push(symbol);
                break;
            }
        }
    }

    if (!discoveredSymbols.length) {
        await message("You haven't discovered any items yet.", state);
        return ECMD_OK;
    }

    let selectedClass = '\0';
    if (traditional) {
        const accepted = [...classes.map(classSymbol), 'a', 'u', 'r'];
        const additional = [];
        for (const symbol of accepted) {
            if (!discoveredSymbols.includes(symbol)) {
                if (!additional.includes('\x1b')) additional.push('\x1b');
                if (!additional.includes(symbol)) additional.push(symbol);
            }
        }
        selectedClass = await yesNo(
            'View discoveries for which sort of objects?',
            [...discoveredSymbols, ...additional].join(''), '\0', true, state,
        );
        if (!selectedClass || selectedClass === '\0')
            clearTtyMessageWindow(state);
    } else if (discoveredSymbols.length === 1
        && state.flags.menu_style === MENU_PARTIAL) {
        [selectedClass] = discoveredSymbols;
    } else {
        const items = [];
        let selector = 'a';
        for (const symbol of discoveredSymbols) {
            const oclass = classes.find((candidate) =>
                classSymbol(candidate) === symbol);
            items.push({
                value: symbol,
                selector,
                groupSelector: symbol === 'u' ? 'r'
                    : oclass ? symbol : undefined,
                label: symbol === 'u' ? 'unique items or relics'
                    : symbol === 'a' ? 'artifacts' : oclass_to_name(oclass),
            });
            selector = String.fromCharCode(selector.charCodeAt(0) + 1);
        }
        const selected = await select_menu(state, {
            title: 'View discoveries for which sort of objects?',
            items,
            how: PICK_ONE,
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        });
        selectedClass = selected ?? '\0';
    }
    if (!selectedClass || selectedClass === '\0') return ECMD_OK;

    const lines = [];
    const putstr = (text, heading = false) => lines.push({ text, heading });
    let count = 0;
    switch (selectedClass) {
    case 'u':
    case 'r':
        putstr('Unique items or relics', true);
        for (const uidx of UNIQ_OBJS) {
            const type = state.objects[uidx];
            if (type.oc_name_known
                || (type.oc_encountered && uidx !== AMULET_OF_YENDOR)) {
                ++count;
                putstr(disco_fmt_uniq(uidx, state));
            }
        }
        if (!count)
            await message("You haven't discovered any unique items or relics yet.", state);
        break;
    case 'a':
        if (state.wizard && await yesNo(
            'Dump information about all artifacts?', 'yn', 'n', true, state,
        ) === 'y') {
            await dump_artifact_info(state, putstr);
            count = NROFARTIFACTS;
            break;
        }
        count = disp_artifact_discoveries(state, (heading, text) =>
            putstr(text, heading));
        if (!count)
            await message("You haven't discovered any artifacts yet.", state);
        break;
    default: {
        const oclass = def_char_to_objclass(selectedClass);
        if (oclass === MAXOCLASSES) {
            note_unported('pline.c impossible');
            return ECMD_OK;
        }
        const order = state.flags.discosort === 'o' ? 'order of discovery'
            : state.flags.discosort === 's' ? "'sortloot' order"
                : 'alphabetical order';
        putstr('Discovered ' + let_to_name(oclass, false, false) + ' in ' + order);
        const sorted = [];
        for (let i = state.svb.bases[oclass]; i < state.svb.bases[oclass + 1]; ++i) {
            const dis = state.svd.disco[i];
            if (!dis || !interesting_to_discover(dis, state)) continue;
            ++count;
            const prefix = state.objects[dis].oc_encountered ? '  ' : '* ';
            const line = prefix + (lootsort ? sortloot_descr(dis, state) : '')
                + disco_append_typename('', dis, state);
            if (!alphabetized && !lootsort) putstr(line);
            else sorted.push(line);
        }
        if (!count) {
            await message("You haven't discovered any "
                + oclass_to_name(oclass) + ' yet.', state);
        } else if (sorted.length) {
            sorted.sort(discovered_cmp);
            for (let line of sorted) {
                if (lootsort) {
                    line = line.slice(0, 6) + line[0] + line.slice(7);
                    line = line.slice(6);
                }
                putstr(line);
            }
        }
        break;
    }
    }
    if (count) await textWindow(lines, state);
    return ECMD_OK;
}

// C ref: o_init.c disco_typename():661–689. Explain Japanese names before
// the user's alias or the appearance, in that order.
export function disco_typename(otyp, state) {
    let result = obj_typename(otyp, state);

    if (state.urole?.mnum === PM_SAMURAI && JAPANESE_ITEM_TYPES.has(otyp)) {
        // A wooden harp is non-magic and so pre-discovered; only a magic harp
        // reaches the fallback, and only once it has been called something.
        const actualn = ((otyp !== MAGIC_HARP && otyp !== WOODEN_HARP)
            || state.objects[otyp].oc_name_known)
            ? OBJ_NAME(state.objects[otyp], state)
            : 'harp';

        if (!actualn) {
            // C's static-analyzer guard leaves the result unchanged.
        } else if (strstri(result, ' called') >= 0)
            result = strsubst(result, ' called', ` [${actualn}] called`);
        else if (strstri(result, ' (') >= 0)
            result = strsubst(result, ' (', ` [${actualn}] (`);
        else
            result += ` [${actualn}]`;
    }
    return result;
}

// C ref: o_init.c disco_append_typename(). C appends into the caller's BUFSZ
// buffer and truncates when the type name does not fit; JavaScript returns the
// finished line. A long user-assigned name truncates before the appearance
// suffix when one is present.
function disco_append_typename(buf, dis, state) {
    const typnm = disco_typename(dis, state);
    const len = encodeUtf8ByteString(buf).length;
    let out;

    if (len + encodeUtf8ByteString(typnm).length < BUFSZ) {
        out = buf + typnm;
    } else {
        const paren = typnm.lastIndexOf('(');
        if (paren > 0 && typnm[paren - 1] === ' '
            && typnm.indexOf(')', paren) >= 0) {
            // Truncate the user-applied name and keep " (actual type)".
            const tail = typnm.slice(paren - 1);
            const room = BUFSZ - 1 - (len + encodeUtf8ByteString(tail).length);
            out = buf + truncateByteString(typnm, Math.max(0, room)) + tail;
        } else {
            out = buf + truncateByteString(typnm, Math.max(0, BUFSZ - 1 - len));
        }
    }
    return out + append_price_quote(out, dis, state);
}

// C ref: o_init.c disco_fmt_uniq().
function disco_fmt_uniq(uidx, state) {
    const type = state.objects[uidx];
    const outbuf = `  ${type.oc_name_known
        ? OBJ_NAME(type, state) : OBJ_DESCR(type, state)}`;
    // The relics section says "papyrus spellbook" where the spellbook section
    // says "spellbook (papyrus)".
    return (!type.oc_name_known && type.oc_class === SPBOOK_CLASS)
        ? `${outbuf} spellbook` : outbuf;
}

// C ref: o_init.c dodiscovered(), bound to '\'. Returns whether the command
// took game time, which for this one is never.
//
// C interleaves its putstr() calls with the walk that produces them. Nothing
// between them waits for input or draws, so this collects the lines first and
// hands the finished list to the window owner, the same shape display_pickinv()
// uses. `heading` marks the lines C writes with iflags.menu_headings.attr.
export async function dodiscovered(
    state = game,
    { message, textWindow } = {},
) {
    if (typeof message !== 'function' || typeof textWindow !== 'function')
        throw new TypeError('dodiscovered needs message and window owners');
    if (!state.flags.discosort
        || !DISCO_ORDER_LET.includes(state.flags.discosort))
        state.flags.discosort = 'o';

    if (state.iflags.menu_requested
        && await choose_disco_sort(1, state) < 0)
        return false;
    const alphabyclass = state.flags.discosort === 'c';
    const alphabetized = state.flags.discosort === 'a' || alphabyclass;
    const lootsort = state.flags.discosort === 's';
    const sortindx = DISCO_ORDER_LET.indexOf(state.flags.discosort);

    const lines = [];
    const putstr = (heading, text) => lines.push({ text, heading });
    putstr(false, `Discoveries, ${DISCO_ORDERS_DESCR[sortindx]}`);
    putstr(false, '');

    // Gather the unique objects, also called relics, into a pseudo-class;
    // they also appear individually within their regular class.
    let uniq_ct = 0;
    let dis = 0;
    for (const uidx of UNIQ_OBJS) {
        const type = state.objects[uidx];
        if (type.oc_name_known
            || (type.oc_encountered && uidx !== AMULET_OF_YENDOR)) {
            if (!dis++)
                putstr(true, 'Unique items or Relics');
            ++uniq_ct;
            putstr(false, disco_fmt_uniq(uidx, state));
        }
    }
    const arti_ct = disp_artifact_discoveries(state, putstr);

    // Several classes are omitted from the pack order; one matters here.
    const classes = [...state.flags.inv_order];
    if (!classes.includes(VENOM_CLASS)) classes.push(VENOM_CLASS);

    let ct = uniq_ct + arti_ct;
    let sortedLines = [];
    for (const oclass of classes) {
        let prev_class = oclass + 1; /* forced different from oclass */
        for (let i = state.svb.bases[oclass];
             i < NUM_OBJECTS && state.objects[i].oc_class === oclass; i++) {
            dis = state.svd.disco[i];
            if (dis !== 0 && interesting_to_discover(dis, state)) {
                ct++;
                if (oclass !== prev_class) {
                    if ((alphabyclass || lootsort) && sortedLines.length) {
                        for (const line of disco_output_sorted(
                            sortedLines, lootsort,
                        ))
                            putstr(false, line);
                        sortedLines = [];
                    }
                    if (!alphabetized || alphabyclass) {
                        putstr(true, let_to_name(oclass, false, false));
                        prev_class = oclass;
                    }
                }
                const buf = state.objects[dis].oc_encountered ? '  ' : '* ';
                const prefix = buf + (lootsort
                    ? sortloot_descr(dis, state) : '');
                const line = disco_append_typename(prefix, dis, state);
                if (!alphabetized && !lootsort) putstr(false, line);
                else sortedLines.push(line);
            }
        }
    }

    if (ct === 0) {
        // C created the text window before this test and destroys it after,
        // which draws nothing when nothing was put in it.
        await message("You haven't discovered anything yet...", state);
    } else {
        if (sortedLines.length) {
            // Global alphabetical mode has no class headings, except when
            // the pseudo-class rows above need a heading of their own.
            if ((uniq_ct || arti_ct) && alphabetized && !alphabyclass)
                putstr(true, 'Discovered items');
            for (const line of disco_output_sorted(sortedLines, lootsort))
                putstr(false, line);
        }
        await textWindow(lines, state);
    }
    return false;
}

// C ref: o_init.c rename_disco() (1131-1206). C builds a temporary menu
// window; the JavaScript window owner receives the same class-grouped rows
// directly through select_menu().
export async function rename_disco(state = game) {
    const { objtyp_is_callable, docall } = await import('./do_name.js');
    let ct = 0;
    let mn = 0;
    const items = [];

    for (const oclass of state.flags.inv_order) {
        let prevClass = oclass + 1; /* force a heading before the first row */
        for (let i = state.svb.bases[oclass];
            i < NUM_OBJECTS && state.objects[i].oc_class === oclass; ++i) {
            const dis = state.svd.disco[i];
            if (!dis || !interesting_to_discover(dis, state)) continue;
            ++ct;
            if (!objtyp_is_callable(dis, state)) continue;
            ++mn;

            if (oclass !== prevClass) {
                items.push(add_menu_heading(
                    let_to_name(oclass, false, false), state,
                ));
                prevClass = oclass;
            }
            items.push({
                label: disco_append_typename('', dis, state),
                value: dis,
            });
        }
    }

    if (ct === 0) {
        await ttyPline("You haven't discovered anything yet...", state);
    } else if (mn === 0) {
        await ttyPline('None of your discoveries can be assigned names...', state);
    } else {
        const selected = await select_menu(state, {
            title: 'Pick an object type to name',
            ...menuTitleStyle(state),
            items,
            how: PICK_ONE,
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        });
        const dis = selected ?? STRANGE_OBJECT;
        if (dis !== STRANGE_OBJECT) {
            const { newObject } = await import('./obj.js');
            const odummy = newObject({
                otyp: dis,
                oclass: state.objects[dis].oc_class,
                quan: 1,
                known: !state.objects[dis].oc_uses_known,
                dknown: true,
            });
            await docall(odummy, state);
        }
    }
    return undefined;
}
