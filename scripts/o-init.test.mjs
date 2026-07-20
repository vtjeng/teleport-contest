import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import * as objectExports from '../js/objects.js';

import {
    init_objects,
    obj_shuffle_range,
    oinit,
    randomize_gem_colors,
    setgemprobs,
} from '../js/o_init.js';
import {
    ACID_VENOM,
    AMULET_CLASS,
    AQUAMARINE,
    CLOAK_OF_DISPLACEMENT,
    CLOAK_OF_PROTECTION,
    EMERALD,
    FIRST_REAL_GEM,
    FLUORITE,
    GAUNTLETS_OF_DEXTERITY,
    GEM_CLASS,
    HELMET,
    HELM_OF_TELEPATHY,
    LAST_REAL_GEM,
    LEATHER_GLOVES,
    LEVITATION_BOOTS,
    MAXOCLASSES,
    NUM_OBJECTS,
    OBJECT_DESCRIPTIONS,
    OBJECT_TEMPLATES,
    POTION_CLASS,
    POT_WATER,
    RING_CLASS,
    SAPPHIRE,
    SCROLL_CLASS,
    SLIME_MOLD,
    SPBOOK_CLASS,
    SPEED_BOOTS,
    STRANGE_OBJECT,
    TURQUOISE,
    VENOM_CLASS,
    WAND_CLASS,
    objects_globals_init,
} from '../js/objects.js';

function makeDeterministicRandom(seed) {
    let value = seed >>> 0;
    return (bound) => {
        // These are the Numerical Recipes linear-congruential constants. The
        // test uses them only to exercise varied valid shuffle positions.
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value % bound;
    };
}

function mutableCatalog(state) {
    return state.objects.slice(0, NUM_OBJECTS);
}

function catalogRange(objectClass) {
    const low = OBJECT_TEMPLATES.findIndex((object, index) => (
        index >= MAXOCLASSES && object.oc_class === objectClass
    ));
    let high = low;
    while (high + 1 < NUM_OBJECTS
           && OBJECT_TEMPLATES[high + 1].oc_class === objectClass) {
        ++high;
    }
    return [low, high];
}

function sourceMagicRange(objectClass) {
    const [low, classHigh] = catalogRange(objectClass);
    let high = classHigh;
    for (let index = low; index <= classHigh; ++index) {
        const object = OBJECT_TEMPLATES[index];
        if (object.oc_unique || !object.oc_magic) {
            high = index - 1;
            break;
        }
    }
    return [low, high];
}

function zeroChoiceShuffleBounds(low, high) {
    const unknownCount = OBJECT_TEMPLATES
        .slice(low, high + 1)
        .filter((object) => !object.oc_name_known)
        .length;
    if (unknownCount < 2) return [];

    const bounds = [];
    for (let index = low; index <= high; ++index) {
        if (!OBJECT_TEMPLATES[index].oc_name_known)
            bounds.push(high - index + 1);
    }
    return bounds;
}

function sourceInitBoundsForZeroChoices() {
    const [potionLow] = catalogRange(POTION_CLASS);
    const classRanges = [
        sourceMagicRange(AMULET_CLASS),
        [potionLow, POT_WATER - 1],
        catalogRange(RING_CLASS),
        sourceMagicRange(SCROLL_CLASS),
        sourceMagicRange(SPBOOK_CLASS),
        catalogRange(WAND_CLASS),
        catalogRange(VENOM_CLASS),
    ];
    const typeRanges = [
        [HELMET, HELM_OF_TELEPATHY],
        [LEATHER_GLOVES, GAUNTLETS_OF_DEXTERITY],
        [CLOAK_OF_PROTECTION, CLOAK_OF_DISPLACEMENT],
        [SPEED_BOOTS, LEVITATION_BOOTS],
    ];
    return [
        // Two binary gem-color choices and one four-way choice come first.
        2, 2, 4,
        ...[...classRanges, ...typeRanges]
            .flatMap(([low, high]) => zeroChoiceShuffleBounds(low, high)),
        // WAN_NOTHING's directional behavior is the final binary choice.
        2,
    ];
}

test('generated catalog matches the complete pinned C export', () => {
    // NetHack 5.0 has 481 enum-addressable entries plus its array terminator.
    assert.equal(NUM_OBJECTS, 481);
    assert.equal(OBJECT_TEMPLATES.length, NUM_OBJECTS + 1);
    assert.equal(OBJECT_DESCRIPTIONS.length, NUM_OBJECTS + 1);
    assert.equal(STRANGE_OBJECT, 0);
    assert.equal(ACID_VENOM, NUM_OBJECTS - 1);
    assert.equal(OBJECT_DESCRIPTIONS[NUM_OBJECTS].oc_name, null);
    assert.equal(OBJECT_DESCRIPTIONS[NUM_OBJECTS].oc_descr, null);

    const numericExports = Object.entries(objectExports)
        .filter(([name, value]) => /^[A-Z][A-Z0-9_]*$/u.test(name)
            && Number.isInteger(value))
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    const digest = createHash('sha256')
        .update(JSON.stringify([
            numericExports,
            OBJECT_DESCRIPTIONS,
            OBJECT_TEMPLATES,
        ]))
        .digest('hex');
    // This digest covers every exported enum, name, description, bitfield,
    // probability, weight, cost, damage value, material, and color.
    assert.equal(
        digest,
        '22e0b5603714d5da1a0231c92b1eb89ad4e31ec5accb48d7926fe9d70b357e57',
    );

    const initialized = {};
    objects_globals_init(initialized);
    assert.equal(Object.keys(initialized.objects[0]).length, 33);
    assert.equal(initialized.objects[0].oc_spare1, 0);
    assert.equal(initialized.objects[0].oc_sell_minseen, Number.MAX_SAFE_INTEGER);
    assert.equal(initialized.objects[0].oc_buy_minseen, Number.MAX_SAFE_INTEGER);
    assert.equal(initialized.objects[0].oc_sell_maxseen, 0);
    assert.equal(initialized.objects[0].oc_buy_maxseen, 0);

    // A small first quote models shk.c record_price_quote() and proves the
    // high-number sentinel participates in ordinary numeric comparisons.
    const firstQuote = 37;
    if (firstQuote < initialized.objects[0].oc_buy_minseen)
        initialized.objects[0].oc_buy_minseen = firstQuote;
    assert.equal(initialized.objects[0].oc_buy_minseen, firstQuote);
});

test('init_objects follows the source PRNG boundary and class layout', () => {
    const state = {};
    const randomBounds = [];
    init_objects(state, (bound) => {
        randomBounds.push(bound);
        return 0;
    });

    // The pinned C slice consumes 199 core-PRNG calls: three gem-color calls,
    // all description shuffles, and WAN_NOTHING's direction choice. Compare
    // every bound so a reordered or resized shuffle cannot preserve the count.
    assert.deepEqual(randomBounds, sourceInitBoundsForZeroChoices());
    assert.equal(randomBounds.length, 199);
    assert.ok(randomBounds.every((bound) => Number.isInteger(bound) && bound > 0));

    const bases = state.svb.bases;
    assert.equal(bases.length, MAXOCLASSES + 2);
    assert.equal(bases[MAXOCLASSES], NUM_OBJECTS);
    assert.equal(bases[MAXOCLASSES + 1], NUM_OBJECTS);
    for (let objectClass = 1; objectClass < MAXOCLASSES; ++objectClass) {
        const expectedBase = mutableCatalog(state)
            .findIndex((object, index) => index >= MAXOCLASSES
                && object.oc_class === objectClass);
        const nextNonemptyBase = expectedBase < 0
            ? bases[objectClass + 1]
            : expectedBase;
        assert.equal(bases[objectClass], nextNonemptyBase);
    }

    for (let objectClass = 0; objectClass < MAXOCLASSES; ++objectClass) {
        const sum = state.objects
            .slice(bases[objectClass], bases[objectClass + 1])
            .reduce((total, object) => total + object.oc_prob, 0);
        assert.equal(state.go.oclass_prob_totals[objectClass], sum);
    }
    assert.equal(state.go.oclass_prob_totals[GEM_CLASS], 1000);
});

test('obj_shuffle_range preserves each upstream exception', () => {
    const state = {};
    init_objects(state, () => 0);

    assert.deepEqual(
        obj_shuffle_range(HELMET, state),
        [HELMET, HELM_OF_TELEPATHY],
    );
    assert.deepEqual(
        obj_shuffle_range(LEATHER_GLOVES, state),
        [LEATHER_GLOVES, GAUNTLETS_OF_DEXTERITY],
    );
    assert.deepEqual(
        obj_shuffle_range(CLOAK_OF_PROTECTION, state),
        [CLOAK_OF_PROTECTION, CLOAK_OF_DISPLACEMENT],
    );
    assert.deepEqual(
        obj_shuffle_range(SPEED_BOOTS, state),
        [SPEED_BOOTS, LEVITATION_BOOTS],
    );
    assert.deepEqual(
        obj_shuffle_range(state.svb.bases[POTION_CLASS], state),
        [state.svb.bases[POTION_CLASS], POT_WATER - 1],
    );
    assert.deepEqual(obj_shuffle_range(POT_WATER, state), [POT_WATER, POT_WATER]);
    for (const objectClass of [AMULET_CLASS, SCROLL_CLASS, SPBOOK_CLASS]) {
        assert.deepEqual(
            obj_shuffle_range(state.svb.bases[objectClass], state),
            sourceMagicRange(objectClass),
        );
    }
    for (const objectClass of [RING_CLASS, WAND_CLASS, VENOM_CLASS]) {
        assert.deepEqual(
            obj_shuffle_range(state.svb.bases[objectClass], state),
            catalogRange(objectClass),
        );
    }
});

test('setgemprobs applies the level-dependent integer formula', () => {
    const state = {
        // Thirty levels exercise both the nine-gem shallow exclusion and the
        // deep-level case where every real gem is eligible.
        dungeons: [{ ledger_start: 0, num_dunlevs: 30 }],
    };
    init_objects(state, () => 0);

    setgemprobs({ dnum: 0, dlevel: 1 }, state);
    for (let index = FIRST_REAL_GEM; index < FIRST_REAL_GEM + 9; ++index)
        assert.equal(state.objects[index].oc_prob, 0);
    for (let index = FIRST_REAL_GEM + 9; index <= LAST_REAL_GEM; ++index) {
        // 171 and 9 are the numerator base and level-one exclusion count in
        // src/o_init.c setgemprobs; Math.trunc models C integer division.
        const expected = Math.trunc(
            (171 + index - (FIRST_REAL_GEM + 9))
            / (LAST_REAL_GEM + 1 - (FIRST_REAL_GEM + 9)),
        );
        assert.equal(state.objects[index].oc_prob, expected);
    }

    state.u = { uz: { dnum: 0, dlevel: 30 } };
    oinit(state);
    for (let index = FIRST_REAL_GEM; index <= LAST_REAL_GEM; ++index) {
        const expected = Math.trunc(
            (171 + index - FIRST_REAL_GEM)
            / (LAST_REAL_GEM + 1 - FIRST_REAL_GEM),
        );
        assert.equal(state.objects[index].oc_prob, expected);
    }
    assert.equal(state.go.oclass_prob_totals[GEM_CLASS], 1000);
});

test('randomize_gem_colors copies descriptions and colors together', () => {
    const state = {};
    init_objects(state, () => 0);
    const choices = [1, 1, 3];
    const bounds = [];

    // Select Sapphire for turquoise and aquamarine, then Emerald for
    // fluorite, covering every description-and-color copy destination.
    randomize_gem_colors(state, (bound) => {
        bounds.push(bound);
        return choices.shift();
    });

    assert.deepEqual(bounds, [2, 2, 4]);
    for (const gem of [TURQUOISE, AQUAMARINE]) {
        assert.equal(
            state.objects[gem].oc_descr_idx,
            state.objects[SAPPHIRE].oc_descr_idx,
        );
        assert.equal(state.objects[gem].oc_color, state.objects[SAPPHIRE].oc_color);
    }
    assert.equal(
        state.objects[FLUORITE].oc_descr_idx,
        state.objects[EMERALD].oc_descr_idx,
    );
    assert.equal(state.objects[FLUORITE].oc_color, state.objects[EMERALD].oc_color);
});

test('mutable shuffles are deterministic and isolated per game', () => {
    const first = {};
    const second = {};
    init_objects(first, makeDeterministicRandom(0x12345678));
    init_objects(second, makeDeterministicRandom(0x12345678));

    assert.deepEqual(first.objects, second.objects);
    assert.notStrictEqual(first.objects, second.objects);
    assert.notStrictEqual(first.objects[HELMET], second.objects[HELMET]);

    first.objects[HELMET].oc_color = -1;
    first.objects[HELMET].oc_prob = -1;
    assert.notEqual(first.objects[HELMET].oc_color, second.objects[HELMET].oc_color);
    assert.notEqual(first.objects[HELMET].oc_prob, second.objects[HELMET].oc_prob);

    objects_globals_init(first);
    init_objects(first, makeDeterministicRandom(0x12345678));
    assert.deepEqual(first.objects, second.objects);
    assert.equal(OBJECT_TEMPLATES[HELMET].oc_descr_idx, 0);
});

test('object descriptions are mutable and isolated per game', () => {
    const first = {};
    const second = {};
    objects_globals_init(first);
    objects_globals_init(second);

    assert.notStrictEqual(first.obj_descr, second.obj_descr);
    assert.notStrictEqual(first.obj_descr[SLIME_MOLD], second.obj_descr[SLIME_MOLD]);
    const originalName = second.obj_descr[SLIME_MOLD].oc_name;
    first.obj_descr[SLIME_MOLD].oc_name = 'fruit';
    init_objects(first, () => 0);

    assert.equal(first.obj_descr[SLIME_MOLD].oc_name, 'fruit');
    assert.equal(second.obj_descr[SLIME_MOLD].oc_name, originalName);
    assert.equal(OBJECT_DESCRIPTIONS[SLIME_MOLD].oc_name, originalName);
});
