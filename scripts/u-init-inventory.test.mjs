import assert from 'node:assert/strict';
import test from 'node:test';

import { OBJ_DELETED, OBJ_FREE } from '../js/const.js';
import { initializeInventory, inventoryObjects } from '../js/invent.js';
import { PM_HUMAN, PM_ORC, PM_WIZARD } from '../js/monsters.js';
import { newObject } from '../js/obj.js';
import { init_objects } from '../js/o_init.js';
import {
    ARMOR_CLASS,
    ARROW,
    COIN_CLASS,
    DAGGER,
    GOLD_PIECE,
    LEATHER_ARMOR,
    MAGIC_MARKER,
    ORCISH_ARROW,
    PANCAKE,
    POT_POLYMORPH,
    RIN_LEVITATION,
    RIN_POLYMORPH,
    RIN_POLYMORPH_CONTROL,
    RIN_SLOW_DIGESTION,
    RING_CLASS,
    SPBOOK_CLASS,
    SPE_EXTRA_HEALING,
    SPE_HEALING,
    SPE_POLYMORPH,
    TOOL_CLASS,
    WAN_POLYMORPH,
    WAND_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import {
    _uInitInventoryInternals,
    ini_inv,
    ini_inv_adjust_obj,
    ini_inv_mkobj_filter,
    ini_inv_obj_substitution,
    reset_ini_inv_nocreate,
    trquan,
} from '../js/u_init_inventory.js';
import {
    UNDEF_BLESS,
    UNDEF_TYP,
} from '../js/u_init_inventory_data.js';

function descriptor(
    trotyp,
    trspe,
    trclass,
    trquanMin,
    trquanMax,
    trbless,
) {
    return {
        trotyp,
        trspe,
        trclass,
        trquan_min: trquanMin,
        trquan_max: trquanMax,
        trbless,
    };
}

function initializedState({ nudist = false, pauper = false } = {}) {
    const state = {
        context: { current_fruit: 1, ident: 2 },
        flags: { invlet_constant: true },
        moves: 1,
        program_state: {},
        u: {
            ualign: { type: 0 },
            ulevel: 1,
            umoney0: 0,
            uroleplay: { nudist, pauper },
        },
        urace: { filecode: 'Hum', mnum: PM_HUMAN },
        urole: { filecode: 'Wiz', mnum: PM_WIZARD },
    };
    // Zero choices initialize the catalog without consuming the scripted
    // behavior RNG used by each test.
    init_objects(state, () => 0);
    initializeInventory(state);
    reset_ini_inv_nocreate(state);
    return state;
}

function call(name, args, result) {
    return { name, args, result };
}

function scriptedRandom(script) {
    const pending = [...script];
    const draw = (name, args) => {
        const expected = pending.shift();
        assert.ok(expected, `unexpected ${name}(${args.join(',')})`);
        assert.equal(name, expected.name, 'random function order');
        assert.deepEqual(args, expected.args, `${name} arguments`);
        return expected.result;
    };
    return {
        random: {
            rn1: (...args) => draw('rn1', args),
            rn2: (...args) => draw('rn2', args),
            rnd: (...args) => draw('rnd', args),
            rne: (...args) => draw('rne', args),
        },
        done() {
            assert.deepEqual(pending, [], 'all scripted random calls consumed');
        },
    };
}

test('trquan preserves the sentinel and fixed-quantity draw boundaries', () => {
    const calls = [];
    const random = {
        rn2(bound) {
            calls.push(bound);
            // Select the fourth value from the 10..20 inclusive range.
            return bound === 11 ? 3 : 0;
        },
    };
    assert.equal(trquan({ trquan_min: 0, trquan_max: 0 }, random), 1);
    assert.equal(trquan({ trquan_min: 1, trquan_max: 1 }, random), 1);
    assert.equal(trquan({ trquan_min: 10, trquan_max: 20 }, random), 13);
    assert.deepEqual(calls, [1, 11]);
});

test('ini_inv_adjust_obj rolls stack quantity before marker charges', () => {
    const state = initializedState();
    const marker = newObject({
        oclass: TOOL_CLASS,
        otyp: MAGIC_MARKER,
        quan: 1,
        where: OBJ_FREE,
    });
    const trop = descriptor(MAGIC_MARKER, 19, TOOL_CLASS, 1, 1, 0);
    const random = scriptedRandom([
        call('rn2', [1], 0), // fixed tool-stack quantity still consumes rn2(1)
        call('rn2', [4], 3), // add the highest source marker-charge bonus
    ]);

    assert.equal(ini_inv_adjust_obj(trop, marker, { state, ...random }), true);
    assert.equal(marker.quan, 1);
    assert.equal(marker.spe, 22);
    assert.equal(marker.blessed, false);
    assert.equal(marker.cursed, false);
    random.done();
});

test('racial substitution changes only the initialized object type', () => {
    const state = initializedState();
    state.urace = { filecode: 'Orc', mnum: PM_ORC };
    const arrow = newObject({
        oclass: WEAPON_CLASS,
        otyp: ARROW,
        quan: 7,
        spe: 2,
        where: OBJ_FREE,
    });
    const trop = descriptor(ARROW, 2, WEAPON_CLASS, 7, 7, UNDEF_BLESS);

    assert.equal(ini_inv_obj_substitution(trop, arrow, state), ORCISH_ARROW);
    assert.equal(arrow.otyp, ORCISH_ARROW);
    assert.equal(arrow.quan, 7);
    assert.equal(arrow.spe, 2);
});

test('ini_inv uses the second weapon quantity roll for one stack', () => {
    const state = initializedState();
    const trop = descriptor(DAGGER, 0, WEAPON_CLASS, 6, 15, 0);
    const random = scriptedRandom([
        call('rn2', [10], 2), // outer ini_inv quantity; superseded for weapons
        call('rnd', [2], 1), // advance the shared object identifier
        call('rn2', [11], 1), // no positive weapon enchantment
        call('rn2', [10], 1), // no negative weapon enchantment
        call('rn2', [10], 1), // leave bless/curse state neutral
        call('rn2', [10], 3), // final stack quantity: 6 + 3
    ]);

    ini_inv([trop], { state, ...random });

    const inventory = inventoryObjects(state);
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].otyp, DAGGER);
    assert.equal(inventory[0].quan, 9);
    assert.equal(inventory[0].owt, 90);
    random.done();
});

test('nudist armor skip carries quantity into the next descriptor', () => {
    const state = initializedState({ nudist: true });
    state.u.umoney0 = 37; // positive source precondition for the Money table
    const table = [
        descriptor(LEATHER_ARMOR, 0, ARMOR_CLASS, 1, 1, UNDEF_BLESS),
        descriptor(GOLD_PIECE, 0, COIN_CLASS, 1, 1, 0),
    ];
    const random = scriptedRandom([
        call('rn2', [1], 0), // first descriptor quantity
        call('rnd', [2], 1), // skipped armor object identifier
        call('rn2', [10], 0), // bypass armor's special-curse condition
        call('rn2', [10], 1), // no positive armor enchantment
        call('rn2', [10], 1), // leave bless/curse state neutral
        // Source's nudist continue skips trquan() for the Money descriptor.
        call('rnd', [2], 1), // money object identifier
    ]);

    ini_inv(table, { state, ...random });

    const inventory = inventoryObjects(state);
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].otyp, GOLD_PIECE);
    assert.equal(inventory[0].quan, 37);
    random.done();
});

test('pauper inventory returns before any quantity or object draw', () => {
    const state = initializedState({ pauper: true });
    const random = scriptedRandom([]);
    ini_inv([
        descriptor(GOLD_PIECE, 0, COIN_CLASS, 1, 1, 0),
    ], { state, ...random });
    assert.deepEqual(inventoryObjects(state), []);
    random.done();
});

test('random filter deallocates a banned ring before accepting the next', () => {
    const state = initializedState();
    for (const object of state.objects) {
        if (object.oc_class === RING_CLASS) object.oc_prob = 0;
    }
    state.objects[RIN_LEVITATION].oc_prob = 1;
    state.objects[RIN_SLOW_DIGESTION].oc_prob = 1;
    state.go.oclass_prob_totals[RING_CLASS] = 2;
    const random = scriptedRandom([
        call('rnd', [2], 1), // select the banned levitation ring
        call('rnd', [2], 1), // first ring's object identifier
        call('rn2', [10], 0), // leave the uncharged ring uncursed
        call('rnd', [2], 2), // select the allowed slow-digestion ring
        call('rnd', [2], 1), // second ring's object identifier
        call('rn2', [10], 0), // leave the uncharged ring uncursed
    ]);

    const accepted = ini_inv_mkobj_filter(RING_CLASS, false, {
        state,
        ...random,
    });

    assert.equal(accepted.otyp, RIN_SLOW_DIGESTION);
    assert.equal(accepted.where, OBJ_FREE);
    assert.equal(state.context.ident, 4);
    random.done();
});

test('spellbook filtering relaxes its level cap after a level-one book', () => {
    const state = initializedState();
    const healing = newObject({
        oclass: SPBOOK_CLASS,
        otyp: SPE_HEALING,
        quan: 1,
        where: OBJ_FREE,
    });
    const extraHealing = newObject({
        oclass: SPBOOK_CLASS,
        otyp: SPE_EXTRA_HEALING,
        quan: 1,
        where: OBJ_FREE,
    });
    const env = { state };

    assert.equal(
        _uInitInventoryInternals.rejectedRandomObject(healing, false, env),
        false,
    );
    assert.equal(
        _uInitInventoryInternals.rejectedRandomObject(
            extraHealing,
            false,
            env,
        ),
        true,
    );
    assert.equal(
        _uInitInventoryInternals.rejectedRandomObject(
            extraHealing,
            true,
            env,
        ),
        false,
    );
});

test('random filter falls back after exactly 1001 rejected objects', () => {
    const state = initializedState();
    for (const object of state.objects) {
        if (object.oc_class === RING_CLASS) object.oc_prob = 0;
    }
    state.objects[RIN_LEVITATION].oc_prob = 1;
    state.go.oclass_prob_totals[RING_CLASS] = 1;
    let selections = 0;
    const random = {
        rn1(range, base) { return base; },
        rn2(bound) {
            // PANCAKE's rn2(6) must avoid the generic-food quantity boost.
            return bound === 6 ? 1 : 0;
        },
        rnd(bound) {
            if (bound === 1) ++selections;
            // One selects the only ring and advances each object id by one.
            return 1;
        },
        rne() { return 1; },
    };

    const fallback = ini_inv_mkobj_filter(RING_CLASS, false, {
        state,
        random,
    });

    assert.equal(fallback.otyp, PANCAKE);
    assert.equal(selections, 1001);
    // 1001 rejected rings plus the pancake each advance the id once.
    assert.equal(state.context.ident, 1004);
});

test('random polymorph and duplicate prohibitions mirror source slots', () => {
    const state = initializedState();
    const internals = _uInitInventoryInternals;
    internals.noteRandomObject(WAN_POLYMORPH, WAND_CLASS, state);
    assert.equal(state.gn.nocreate, RIN_POLYMORPH_CONTROL);

    internals.noteRandomObject(RIN_POLYMORPH_CONTROL, RING_CLASS, state);
    assert.deepEqual(
        [state.gn.nocreate, state.gn.nocreate2, state.gn.nocreate3],
        [RIN_POLYMORPH, SPE_POLYMORPH, POT_POLYMORPH],
    );
    assert.equal(state.gn.nocreate4, RIN_POLYMORPH_CONTROL);

    internals.noteRandomObject(RIN_LEVITATION, RING_CLASS, state);
    assert.equal(state.gn.nocreate4, RIN_LEVITATION);

    // UNDEF_TYP is the only descriptor type which updates nocreate slots.
    assert.equal(UNDEF_TYP, 0);
    reset_ini_inv_nocreate(state);
    assert.deepEqual(
        [
            state.gn.nocreate,
            state.gn.nocreate2,
            state.gn.nocreate3,
            state.gn.nocreate4,
        ],
        [0, 0, 0, 0],
    );
});

test('invalid tables and empty starting money fail at explicit seams', () => {
    const state = initializedState();
    const noCalls = scriptedRandom([]);
    assert.throws(
        () => ini_inv('not a table', { state, ...noCalls }),
        /requires a starting inventory table/,
    );

    const coin = newObject({
        oclass: COIN_CLASS,
        otyp: GOLD_PIECE,
        quan: 1,
        where: OBJ_FREE,
    });
    assert.throws(
        () => ini_inv_adjust_obj(
            descriptor(GOLD_PIECE, 0, COIN_CLASS, 1, 1, 0),
            coin,
            { state, ...noCalls },
        ),
        /positive u\.umoney0/,
    );
    assert.notEqual(coin.where, OBJ_DELETED);
    noCalls.done();
});
