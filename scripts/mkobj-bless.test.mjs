// Pin mkobj.c:bless()'s BUC side effects and its synchronous startup contract.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BAG_OF_HOLDING,
    BOULDER,
    FIGURINE,
    GOLD_DRAGON_SCALE_MAIL,
    LUCKSTONE,
    POT_WATER,
    POTION_CLASS,
} from '../js/objects.js';
import {
    FIG_TRANSFORM,
    LUCKADD,
    OBJ_FREE,
    OBJ_INVENT,
    TIMER_OBJECT,
    W_ARM,
} from '../js/const.js';
import { init_objects } from '../js/o_init.js';
import { newObject, weight, bless } from '../js/obj.js';
import { timeout_globals_init, start_timer, peek_timer } from '../js/timeout.js';

function makeState() {
    const state = {
        invent: null,
        moves: 1,
        u: { ux: 2, uy: 2, moreluck: 0 },
    };
    init_objects(state, () => 0);
    timeout_globals_init(state);
    return state;
}

function object(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        where: OBJ_FREE,
        ...overrides,
    });
}

test('bless keeps free startup object calls synchronous', () => {
    // end.c startup potions are free, unlit objects and reach no side branch.
    const potion = newObject({
        otyp: POT_WATER,
        oclass: POTION_CLASS,
        quan: 1,
        where: OBJ_FREE,
        cursed: true,
    });
    assert.equal(bless(potion), potion);
    assert.equal(potion.cursed, false);
    assert.equal(potion.blessed, true);
});

test('bless recalculates luck when a carried luckstone changes BUC', () => {
    // attrib.c set_moreluck() counts cursed stones negatively and blessed
    // stones positively, then applies +/- LUCKADD.
    const state = makeState();
    const stone = object(state, LUCKSTONE, {
        where: OBJ_INVENT,
        cursed: true,
    });
    state.invent = stone;
    state.u.moreluck = -LUCKADD;

    assert.equal(bless(stone, { state }), stone);
    assert.equal(state.u.moreluck, LUCKADD);
});

test('bless recomputes a carried bag-of-holding weight after changing BUC', () => {
    // mkobj.c weight() doubles cursed contents and rounds blessed contents
    // upward to one quarter before adding the bag's own fixed weight.
    const state = makeState();
    const contents = object(state, BOULDER, { where: OBJ_INVENT, quan: 3 });
    const bag = object(state, BAG_OF_HOLDING, {
        where: OBJ_INVENT,
        cursed: true,
        cobj: contents,
    });
    state.invent = bag;
    const cursedWeight = weight(bag, { state });
    bag.owt = cursedWeight;

    assert.equal(bless(bag, { state }), bag);
    assert.equal(bag.owt, weight(bag, { state }));
    assert.ok(bag.owt < cursedWeight);
});

test('bless stops the transformation timer on a carried timed figurine', () => {
    // mkobj.c discards stop_timer(FIG_TRANSFORM, ...), which decrements the
    // object's timed count only when that timer is actually present.
    const state = makeState();
    const figurine = object(state, FIGURINE, {
        where: OBJ_INVENT,
        timed: 0,
    });
    state.invent = figurine;
    assert.equal(start_timer(25, TIMER_OBJECT, FIG_TRANSFORM, figurine, state), true);
    assert.equal(figurine.timed, 1);

    assert.equal(bless(figurine, { state }), figurine);
    assert.equal(figurine.timed, 0);
    assert.equal(peek_timer(FIG_TRANSFORM, figurine, state), 0);
});

test('bless adjusts carried artifact light after the BUC mutation', async () => {
    // mkobj.c saves arti_light_radius() before changing BUC, then emits the
    // brightness message only after the new radius has been calculated.
    const state = makeState();
    const armor = object(state, GOLD_DRAGON_SCALE_MAIL, {
        where: OBJ_INVENT,
        owornmask: W_ARM,
        lamplit: true,
        cursed: true,
        dknown: true,
    });
    state.invent = armor;
    const messages = [];
    const pending = bless(armor, {
        state,
        message: async (text) => {
            assert.equal(armor.blessed, true);
            messages.push(text);
        },
    });

    assert.equal(typeof pending?.then, 'function');
    await pending;
    assert.equal(armor.cursed, false);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /shines much brighter\.$/);
});
