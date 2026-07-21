import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FROMOUTSIDE,
    INTRINSIC,
    JUMPING,
    OBJ_INVENT,
    PROTECTION,
} from '../js/const.js';
import { init_dungeons } from '../js/dungeon.js';
import { game, resetGame } from '../js/gstate.js';
import { initoptions_finish } from '../js/fruit.js';
import { init_objects } from '../js/o_init.js';
import { initRng } from '../js/rng.js';
import { monst_globals_init, reset_mvitals } from '../js/monsters.js';
import * as O from '../js/objects.js';
import { role_init } from '../js/role_init.js';
import {
    aligns,
    genders,
    roles,
    races,
    str2race,
    str2role,
    validalign,
    validgend,
    validrace,
} from '../js/roles.js';
import { u_init_misc } from '../js/u_init.js';
import {
    ELF_STARTING_INSTRUMENTS,
    STARTING_INVENTORY_TABLES,
} from '../js/u_init_inventory_data.js';
import {
    _uInitInventoryAttrInternals,
    find_ac,
    hidden_gold,
    initial_inv_weight,
    initial_weight_cap,
    knows_class,
    knows_object,
    u_init_carry_attr_boost,
    u_init_inventory_attrs,
    u_init_race,
    u_init_role,
} from '../js/u_init_inventory_attrs.js';

const TABLE_NAMES = new Map(Object.entries(STARTING_INVENTORY_TABLES)
    .map(([name, table]) => [table, name]));

function initialState(role, race, { pauper = false } = {}) {
    const state = {
        moves: 0,
        urole: roles[str2role(role)],
        urace: races[str2race(race)],
        u: {
            umoney0: 0,
            uroleplay: { pauper },
            uprops: Array.from({ length: 69 }, () => ({
                intrinsic: 0,
                extrinsic: 0,
                blocked: 0,
            })),
        },
    };
    // Choosing zero keeps each source shuffle at its current entry. Object
    // identity is irrelevant here; the test needs initialized class bounds.
    init_objects(state, () => 0);
    return state;
}

function scriptedRandom(expected) {
    const queue = [...expected];
    const calls = [];
    function take(kind, bound) {
        calls.push(`${kind}(${bound})`);
        assert.ok(queue.length, `unexpected ${kind}(${bound})`);
        const next = queue.shift();
        assert.deepEqual({ kind, bound }, { kind: next.kind, bound: next.bound });
        return next.result;
    }
    return {
        calls,
        rn2: (bound) => take('rn2', bound),
        rnd: (bound) => take('rnd', bound),
        done: () => assert.deepEqual(queue, []),
    };
}

function inventoryTracer(calls) {
    return (table) => {
        calls.push(TABLE_NAMES.get(table) ?? `instrument:${table[0].trotyp}`);
        return null;
    };
}

test('u_init_role preserves conditional inventory and random-call order', () => {
    {
        const state = initialState('Archeologist', 'human');
        const given = [];
        const random = scriptedRandom([
            // Miss tin opener and lamp, then take the magic-marker branch.
            { kind: 'rn2', bound: 10, result: 1 },
            { kind: 'rn2', bound: 4, result: 1 },
            { kind: 'rn2', bound: 5, result: 0 },
        ]);
        u_init_role(state, random, { iniInv: inventoryTracer(given) });
        assert.deepEqual(given, ['Archeologist', 'Magicmarker']);
        assert.equal(state.moves, 1);
        assert.deepEqual(
            [state.gn.nocreate, state.gn.nocreate2,
                state.gn.nocreate3, state.gn.nocreate4],
            [0, 0, 0, 0],
        );
        random.done();
    }

    {
        const state = initialState('Monk', 'human');
        const given = [];
        const random = scriptedRandom([
            // 89 / 30 selects the third book; miss marker, then take lamp.
            { kind: 'rn2', bound: 90, result: 89 },
            { kind: 'rn2', bound: 4, result: 1 },
            { kind: 'rn2', bound: 10, result: 0 },
        ]);
        u_init_role(state, random, { iniInv: inventoryTracer(given) });
        assert.deepEqual(given,
            ['Monk', 'Confuse_monster_book', 'Lamp']);
        random.done();
    }

    {
        const state = initialState('Tourist', 'human');
        const given = [];
        const random = scriptedRandom([
            // 777 is retained as starting money. Miss three 1-in-25 extras,
            // then take the final 1-in-20 magic-marker branch.
            { kind: 'rnd', bound: 1000, result: 777 },
            { kind: 'rn2', bound: 25, result: 1 },
            { kind: 'rn2', bound: 25, result: 1 },
            { kind: 'rn2', bound: 25, result: 1 },
            { kind: 'rn2', bound: 20, result: 0 },
        ]);
        u_init_role(state, random, { iniInv: inventoryTracer(given) });
        assert.deepEqual(given, ['Tourist', 'Magicmarker']);
        assert.equal(state.u.umoney0, 777);
        random.done();
    }
});

test('role knowledge honors class filters, pauper, and Samurai aliases', () => {
    const barbarian = initialState('Barbarian', 'human');
    for (const type of [O.LONG_SWORD, O.GLAIVE, O.RING_MAIL, O.SMALL_SHIELD])
        barbarian.objects[type].oc_name_known = 0;
    knows_class(O.WEAPON_CLASS, barbarian);
    knows_class(O.ARMOR_CLASS, barbarian);
    assert.equal(barbarian.objects[O.LONG_SWORD].oc_name_known, 1);
    assert.equal(barbarian.objects[O.GLAIVE].oc_name_known, 0);
    assert.equal(barbarian.objects[O.RING_MAIL].oc_name_known, 1);
    assert.equal(barbarian.objects[O.SMALL_SHIELD].oc_name_known, 0);

    const ranger = initialState('Ranger', 'human');
    for (const type of [O.BOW, O.ARROW, O.SPEAR, O.DAGGER])
        ranger.objects[type].oc_name_known = 0;
    knows_class(O.WEAPON_CLASS, ranger);
    assert.deepEqual(
        [O.BOW, O.ARROW, O.SPEAR, O.DAGGER]
            .map((type) => ranger.objects[type].oc_name_known),
        [1, 1, 1, 0],
    );

    const rogue = initialState('Rogue', 'human');
    for (const type of [O.DAGGER, O.ELVEN_DAGGER, O.ARROW])
        rogue.objects[type].oc_name_known = 0;
    knows_class(O.WEAPON_CLASS, rogue);
    assert.deepEqual(
        [O.DAGGER, O.ELVEN_DAGGER, O.ARROW]
            .map((type) => rogue.objects[type].oc_name_known),
        [1, 1, 0],
    );

    const pauper = initialState('Priest', 'human', { pauper: true });
    pauper.objects[O.SACK].oc_name_known = 0;
    pauper.objects[O.POT_WATER].oc_name_known = 0;
    assert.equal(knows_object(O.SACK, false, pauper), false);
    assert.equal(knows_object(O.POT_WATER, true, pauper), true);

    const samurai = initialState('Samurai', 'human');
    const random = scriptedRandom([
        // Nonzero misses the optional blindfold.
        { kind: 'rn2', bound: 5, result: 1 },
    ]);
    u_init_role(samurai, random, { iniInv: () => null });
    const discovered = new Set(samurai.svd.disco.filter(Boolean));
    assert.ok(discovered.has(O.POT_BOOZE));
    assert.ok(discovered.has(O.FOOD_RATION));
    assert.equal(discovered.has(O.MAGIC_HARP), false);
    random.done();
});

test('u_init_race preserves elf instrument and orc food boundaries', () => {
    {
        const elf = initialState('Priest', 'elf', { pauper: true });
        const given = [];
        const random = scriptedRandom([
            // Index four selects the bugle; pauper suppresses object creation
            // inside ini_inv, after this ROLL_FROM draw has happened.
            { kind: 'rn2', bound: 6, result: 4 },
        ]);
        u_init_race(elf, random, { iniInv: inventoryTracer(given) });
        assert.deepEqual(given, [`instrument:${ELF_STARTING_INSTRUMENTS[4]}`]);
        assert.equal(elf.objects[O.ELVEN_BOW].oc_name_known, 0);
        random.done();
    }

    {
        const wizard = initialState('Wizard', 'orc');
        const given = [];
        u_init_race(wizard, scriptedRandom([]), {
            iniInv: inventoryTracer(given),
        });
        assert.deepEqual(given, []);

        const ranger = initialState('Ranger', 'orc');
        u_init_race(ranger, scriptedRandom([]), {
            iniInv: inventoryTracer(given),
        });
        assert.deepEqual(given, ['Xtra_food']);
    }
});

test('carry boost raises Strength first, then Constitution at its cap', () => {
    const state = initialState('Caveman', 'human');
    state.u.acurr = { a: [3, 3, 3, 3, 3, 3] };
    state.u.amax = { a: [3, 3, 3, 3, 3, 3] };
    state.u.abon = [0, 0, 0, 0, 0, 0];
    state.u.atemp = [0, 0, 0, 0, 0, 0];
    state.u.aexe = [9, 9, 9, 9, 9, 9];
    // Weight 250 is 50 over the (3 Str + 3 Con) capacity. Two Strength
    // increases add 25 capacity apiece, ending at exactly zero excess.
    state.invent = { oclass: O.TOOL_CLASS, otyp: O.SACK, owt: 250, nobj: null };
    assert.equal(initial_weight_cap(state), 200);
    assert.equal(initial_inv_weight(state), 50);
    u_init_carry_attr_boost(state);
    assert.deepEqual(state.u.acurr.a, [5, 3, 3, 3, 3, 3]);
    assert.equal(state.u.aexe[0], 0);

    // Pin Strength at its racial cap, then require one Constitution point to
    // raise capacity from 200 to 225.
    state.urace = { ...state.urace, attrmax: [3, 18, 18, 18, 18, 18] };
    state.u.acurr.a = [3, 3, 3, 3, 3, 3];
    state.u.amax.a = [3, 3, 3, 3, 3, 3];
    state.invent.owt = 225;
    u_init_carry_attr_boost(state);
    assert.deepEqual(state.u.acurr.a, [3, 3, 3, 3, 4, 3]);
});

test('hidden_gold follows known-container recursion', () => {
    // Seventeen coins sit in an unknown sack nested in a known outer sack.
    const coins = { oclass: O.COIN_CLASS, quan: 17, nobj: null };
    const inner = { oclass: O.TOOL_CLASS, cknown: false, cobj: coins, nobj: null };
    const outer = { oclass: O.TOOL_CLASS, cknown: true, cobj: inner, nobj: null };
    const state = { invent: outer };
    assert.equal(hidden_gold(false, state), 0);
    assert.equal(hidden_gold(true, state), 17);
    inner.cknown = true;
    assert.equal(hidden_gold(false, state), 17);
});

test('u_init_inventory_attrs owns reset, role/race, and attribute order', () => {
    const state = initialState('Caveman', 'human');
    state.invent = { stale: true };
    state.u.acurr = { a: [0, 0, 0, 0, 0, 0] };
    state.u.amax = { a: [0, 0, 0, 0, 0, 0] };
    state.u.atemp = [0, 0, 0, 0, 0, 0];
    state.u.atime = [0, 0, 0, 0, 0, 0];
    state.u.aexe = [0, 0, 0, 0, 0, 0];
    const calls = [];
    // Caveman's bases total 45. Returning one sends all 30 remaining points
    // to Strength, then makes all six rn2(20) variation checks miss.
    const random = {
        rn2: (bound) => bound === 20 ? 1 : 1,
        rnd: (bound) => {
            assert.fail(`unexpected rnd(${bound})`);
        },
    };
    u_init_inventory_attrs(state, random, {
        iniInv: (table) => {
            calls.push(TABLE_NAMES.get(table));
            return null;
        },
        resetInventory: (resetState) => {
            assert.equal(resetState.invent.stale, true);
            resetState.invent = null;
            resetState.lastinvnr = 51;
        },
    });
    assert.deepEqual(calls, ['Cave_man']);
    assert.equal(state.moves, 1);
    assert.equal(state.lastinvnr, 51);
    assert.equal(state.u.acurr.a.reduce((sum, value) => sum + value, 0), 75);
    assert.deepEqual(state.u.acurr.a, state.u.amax.a);
});

test('find_ac combines worn armor, protection, and source cap', () => {
    const state = initialState('Knight', 'human');
    state.mons = [{ ac: 10 }];
    state.u.umonnum = 0;
    state.u.uac = 10;
    state.u.ublessed = 3;
    state.u.uspellprot = 1;
    state.u.uprops[PROTECTION].intrinsic = INTRINSIC;
    state.objects[O.RING_MAIL].a_ac = 3;
    // +1 ring mail eroded once retains a three-point armor bonus.
    state.uarm = {
        otyp: O.RING_MAIL,
        spe: 1,
        oeroded: 1,
        oeroded2: 0,
    };
    // A +2 protection ring, guarding amulet, three divine points, and one
    // spell point reduce 10 - 3 armor to -1.
    state.uleft = { otyp: O.RIN_PROTECTION, spe: 2 };
    state.uamul = { otyp: O.AMULET_OF_GUARDING };
    assert.equal(find_ac(state), -1);
    assert.equal(state.u.uac, -1);
    assert.equal(state.disp.botl, true);

    state.mons[0].ac = 150;
    state.uarm = state.uleft = state.uamul = null;
    state.u.uprops[PROTECTION].intrinsic = 0;
    state.u.uspellprot = 0;
    assert.equal(find_ac(state), 99);
});

test('Knight role grants source outside jumping intrinsic', () => {
    const state = initialState('Knight', 'human');
    u_init_role(state, scriptedRandom([]), { iniInv: () => null });
    assert.equal(state.u.uprops[JUMPING].intrinsic, FROMOUTSIDE);
});

test('knowledge catalogs retain every upstream race entry', () => {
    assert.deepEqual(
        [..._uInitInventoryAttrInternals.ELVEN_OBJECTS],
        [
            O.ELVEN_SHORT_SWORD, O.ELVEN_ARROW, O.ELVEN_BOW,
            O.ELVEN_SPEAR, O.ELVEN_DAGGER, O.ELVEN_BROADSWORD,
            O.ELVEN_MITHRIL_COAT, O.ELVEN_LEATHER_HELM,
            O.ELVEN_SHIELD, O.ELVEN_BOOTS, O.ELVEN_CLOAK,
        ],
    );
    assert.equal(_uInitInventoryAttrInternals.DWARVISH_OBJECTS.length, 7);
    assert.equal(_uInitInventoryAttrInternals.ORCISH_OBJECTS.length, 11);
});

test('the real object pipeline initializes every valid role/race pairing', () => {
    let caseNumber = 0;
    for (let roleIndex = 0; roleIndex < roles.length; ++roleIndex) {
        for (let raceIndex = 0; raceIndex < races.length; ++raceIndex) {
            if (!validrace(roleIndex, raceIndex)) continue;
            const genderIndex = genders.findIndex((_, index) =>
                validgend(roleIndex, raceIndex, index));
            const alignmentIndex = aligns.findIndex((_, index) =>
                validalign(roleIndex, raceIndex, index));
            assert.notEqual(genderIndex, -1);
            assert.notEqual(alignmentIndex, -1);

            resetGame();
            // Separate fixed seeds cover different object choices without
            // deriving any behavior from recordings or expected screens.
            initRng(810_000 + caseNumber++);
            game.context = { ident: 2 };
            game.moves = 0;
            game.flags = {
                initrole: roleIndex,
                initrace: raceIndex,
                initgend: genderIndex,
                initalign: alignmentIndex,
                pantheon: -1,
            };
            game.plname = 'InventoryTest';
            game.u = { uroleplay: {} };
            O.objects_globals_init(game);
            monst_globals_init(game);
            initoptions_finish({}, game);
            reset_mvitals(game);
            init_objects(game);
            role_init(game);
            init_dungeons(game);
            u_init_misc(game, undefined, { now: new Date(2_000_000_000_000) });
            u_init_inventory_attrs(game);

            const label = `${roles[roleIndex].filecode}/${races[raceIndex].filecode}`;
            assert.equal(game.moves, 1, label);
            for (let index = 0; index < game.u.acurr.a.length; ++index) {
                assert.ok(game.u.acurr.a[index] >= game.urace.attrmin[index], label);
                assert.ok(game.u.acurr.a[index] <= game.urace.attrmax[index], label);
            }
            assert.deepEqual(game.u.acurr.a, game.u.amax.a, label);
            for (let object = game.invent; object; object = object.nobj)
                assert.equal(object.where, OBJ_INVENT, label);
        }
    }
    assert.ok(caseNumber > roles.length);
});
