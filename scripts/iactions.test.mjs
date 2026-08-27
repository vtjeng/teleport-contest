// Tests for iactions.js (item_naming_classification, item_reading_classification,
// itemactions_pushkeys via itemactions) and supporting pure functions ported
// alongside it: name_ok, call_ok, objtyp_is_callable (do_name.js),
// armcat_to_wornmask, wearmask_to_obj (worn.js), is_blade (obj.js),
// boots_simple_name, shield_simple_name, shirt_simple_name,
// armor_simple_name (objnam.js), check_invent_gold (invent.js),
// cmdq_add_key (cmd.js).

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CQ_CANNED,
    CMDQ_KEY,
    ECMD_OK,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    GOLD_SYM,
    W_ARM,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_ARMS,
    W_ARMU,
} from '../js/const.js';
import {
    cmdq_add_key,
    cmdq_pop,
    extcmdRow,
} from '../js/cmd.js';
import {
    name_ok,
    call_ok,
    objtyp_is_callable,
} from '../js/do_name.js';
import { check_invent_gold } from '../js/invent.js';
import {
    is_blade,
    objectType,
} from '../js/obj.js';
import { init_objects } from '../js/o_init.js';
import {
    AMULET_OF_YENDOR,
    ARM_BOOTS,
    ARM_CLOAK,
    ARM_GLOVES,
    ARM_HELM,
    ARM_SHIELD,
    ARM_SHIRT,
    ARM_SUIT,
    ARMOR_CLASS,
    COIN_CLASS,
    DAGGER,
    DART,
    FAKE_AMULET_OF_YENDOR,
    FOOD_CLASS,
    GOLD_DRAGON_SCALE_MAIL,
    KATANA,
    LEATHER_GLOVES,
    LOW_BOOTS,
    ORCISH_HELM,
    PICK_AXE,
    POTION_CLASS,
    POT_HEALING,
    RING_CLASS,
    RIN_ADORNMENT,
    SCROLL_CLASS,
    SCR_IDENTIFY,
    SHIELD_OF_REFLECTION,
    SMALL_SHIELD,
    SPBOOK_CLASS,
    SPE_DETECT_MONSTERS,
    SPE_NOVEL,
    T_SHIRT,
    TOOL_CLASS,
    WAND_CLASS,
    WAN_STRIKING,
    WEAPON_CLASS,
    objects_globals_init,
} from '../js/objects.js';
import {
    armor_simple_name,
    boots_simple_name,
    shield_simple_name,
    shirt_simple_name,
} from '../js/objnam.js';
import {
    armcat_to_wornmask,
    wearmask_to_obj,
} from '../js/worn.js';

// Minimal state with objects[] initialized and descriptions shuffled.
// The constant rn2 keeps the description shuffle in source order.
function catalogState() {
    const state = {};
    objects_globals_init(state);
    init_objects(state, () => 0);
    state.u = { uprops: [], ux: 1, uy: 1, uswallow: false, twoweap: false };
    state.flags = { sortpack: true, invlet_constant: true, inv_order: '' };
    state.iflags = {};
    state.invent = null;
    state.level = { at(x, y) { return { typ: 0 }; } };
    return state;
}

function fakeObj(otyp, overrides = {}) {
    return {
        otyp,
        oclass: overrides.oclass ?? WEAPON_CLASS,
        invlet: overrides.invlet ?? 'a',
        quan: overrides.quan ?? 1,
        dknown: overrides.dknown ?? true,
        known: overrides.known ?? false,
        cknown: overrides.cknown ?? false,
        bknown: overrides.bknown ?? false,
        rknown: overrides.rknown ?? false,
        oartifact: overrides.oartifact ?? 0,
        owornmask: overrides.owornmask ?? 0,
        lamplit: overrides.lamplit ?? false,
        unpaid: overrides.unpaid ?? false,
        spe: overrides.spe ?? 0,
        nobj: overrides.nobj ?? null,
        ...overrides,
    };
}

// ── cmdq_add_key ──

test('cmdq_add_key pushes a CMDQ_KEY node that cmdq_pop retrieves', () => {
    // Exercises the new one-line queue primitive that iactions.c uses for
    // every inventory-letter argument it queues.
    const state = { command_queue: [[], []] };
    cmdq_add_key(CQ_CANNED, 'b', state);
    const node = cmdq_pop(state);
    assert.equal(node.typ, CMDQ_KEY);
    assert.equal(node.key, 'b');
});

// ── name_ok / call_ok / objtyp_is_callable ──

test('name_ok excludes gold and downplays artifacts', () => {
    // C: do_name.c:469 (COIN_CLASS -> GETOBJ_EXCLUDE) and :472 (oartifact ->
    // GETOBJ_DOWNPLAY). Every other item suggests.
    const state = catalogState();
    const gold = fakeObj(0, { oclass: COIN_CLASS });
    assert.equal(name_ok(gold, state), GETOBJ_EXCLUDE);
    const artifact = fakeObj(KATANA, { oartifact: 1 });
    assert.equal(name_ok(artifact, state), GETOBJ_DOWNPLAY);
    const novel = fakeObj(SPE_NOVEL, { oclass: SPBOOK_CLASS });
    assert.equal(name_ok(novel, state), GETOBJ_DOWNPLAY);
    const normal = fakeObj(DAGGER);
    assert.equal(name_ok(normal, state), GETOBJ_SUGGEST);
});

test('objtyp_is_callable returns true for types with descriptions', () => {
    // C: do_name.c:431-462. Scrolls, potions, wands, rings, gems, spellbooks,
    // armor and tools with a description are callable; amulets of Yendor
    // (real and fake) are explicitly excluded.
    const state = catalogState();
    // A potion with a description is callable.
    assert.equal(objtyp_is_callable(POT_HEALING, state), true);
    // An amulet of Yendor is excluded despite having a description.
    assert.equal(objtyp_is_callable(AMULET_OF_YENDOR, state), false);
    assert.equal(objtyp_is_callable(FAKE_AMULET_OF_YENDOR, state), false);
});

test('call_ok suggests callable items whose type is not yet discovered', () => {
    // C: do_name.c:482-494. An undiscovered potion suggests; a discovered
    // potion without a user-assigned type name is downplayed.
    const state = catalogState();
    const potion = fakeObj(POT_HEALING, { oclass: POTION_CLASS });
    assert.equal(call_ok(potion, state), GETOBJ_SUGGEST);
    // Discover the type -- now it should downplay.
    state.objects[POT_HEALING].oc_name_known = true;
    assert.equal(call_ok(potion, state), GETOBJ_DOWNPLAY);
});

// ── armcat_to_wornmask / wearmask_to_obj ──

test('armcat_to_wornmask returns the correct mask for each category', () => {
    // C: worn.c:254-277. Each ARM_* constant maps to exactly one W_ARM* mask.
    assert.equal(armcat_to_wornmask(ARM_SUIT), W_ARM);
    assert.equal(armcat_to_wornmask(ARM_CLOAK), W_ARMC);
    assert.equal(armcat_to_wornmask(ARM_HELM), W_ARMH);
    assert.equal(armcat_to_wornmask(ARM_SHIELD), W_ARMS);
    assert.equal(armcat_to_wornmask(ARM_GLOVES), W_ARMG);
    assert.equal(armcat_to_wornmask(ARM_BOOTS), W_ARMF);
    assert.equal(armcat_to_wornmask(ARM_SHIRT), W_ARMU);
    // Unknown category returns 0.
    assert.equal(armcat_to_wornmask(99), 0);
});

test('wearmask_to_obj returns the object in the matching slot', () => {
    // C: worn.c:210-213. The worn[] table iterates slots; the first whose
    // mask overlaps the query answers.
    const state = catalogState();
    const helmet = fakeObj(ORCISH_HELM, { oclass: ARMOR_CLASS });
    state.uarmh = helmet;
    assert.equal(wearmask_to_obj(W_ARMH, state), helmet);
    // An empty slot returns null.
    assert.equal(wearmask_to_obj(W_ARMG, state), null);
});

// ── is_blade ──

test('is_blade returns true for daggers and false for picks', () => {
    // C: obj.h:213-216. P_DAGGER through P_SABER is the blade range; a
    // pick-axe lies outside it.
    const state = catalogState();
    const dagger = fakeObj(DAGGER);
    assert.equal(is_blade(dagger, state), true);
    const pickaxe = fakeObj(PICK_AXE, { oclass: TOOL_CLASS });
    assert.equal(is_blade(pickaxe, state), false);
});

// ── boots_simple_name / shield_simple_name / shirt_simple_name ──
// ── armor_simple_name ──

test('boots_simple_name returns "boots" for generic boots', () => {
    // C: objnam.c:5553-5566. LOW_BOOTS has description "walking shoes",
    // which contains "shoes", so the function returns "shoes". A boot
    // without "shoes" in either name returns "boots".
    const state = catalogState();
    const boots = fakeObj(LOW_BOOTS, { oclass: ARMOR_CLASS });
    // LOW_BOOTS has description "walking shoes" in objects.h.
    assert.equal(boots_simple_name(boots, state), 'shoes');
});

test('shield_simple_name returns "silver shield" for a known reflection shield', () => {
    // C: objnam.c:5574-5575. SHIELD_OF_REFLECTION with dknown answers
    // "silver shield"; without dknown, "smooth shield".
    const state = catalogState();
    const known = fakeObj(SHIELD_OF_REFLECTION, {
        oclass: ARMOR_CLASS, dknown: true,
    });
    assert.equal(shield_simple_name(known, state), 'silver shield');
    const unknown = fakeObj(SHIELD_OF_REFLECTION, {
        oclass: ARMOR_CLASS, dknown: false,
    });
    assert.equal(shield_simple_name(unknown, state), 'smooth shield');
});

test('shirt_simple_name always returns "shirt"', () => {
    // C: objnam.c:5600-5603.
    const state = catalogState();
    const shirt = fakeObj(T_SHIRT, { oclass: ARMOR_CLASS });
    assert.equal(shirt_simple_name(shirt, state), 'shirt');
});

test('armor_simple_name dispatches to the correct category function', () => {
    // C: objnam.c:5435-5468. A suit of dragon scale mail maps to
    // suit_simple_name, which returns "dragon mail".
    const state = catalogState();
    const mail = fakeObj(GOLD_DRAGON_SCALE_MAIL, { oclass: ARMOR_CLASS });
    assert.equal(armor_simple_name(mail, state), 'dragon mail');
    const gloves = fakeObj(LEATHER_GLOVES, { oclass: ARMOR_CLASS });
    assert.equal(armor_simple_name(gloves, state), 'gloves');
});

// ── check_invent_gold ──

test('check_invent_gold returns false when gold is in the $ slot', () => {
    // C: invent.c:4895-4912. A single gold stack in the '$' slot is normal.
    const state = catalogState();
    const gold = fakeObj(0, {
        oclass: COIN_CLASS, invlet: GOLD_SYM, nobj: null,
    });
    state.invent = gold;
    assert.equal(check_invent_gold('test', state), false);
});

test('check_invent_gold returns true when gold is in a wrong slot', () => {
    // C: invent.c:4898-4909. Gold in any slot other than '$' triggers the
    // sanity warning and returns true.
    const state = catalogState();
    const gold = fakeObj(0, {
        oclass: COIN_CLASS, invlet: 'a', nobj: null,
    });
    state.invent = gold;
    assert.equal(check_invent_gold('test', state), true);
});
