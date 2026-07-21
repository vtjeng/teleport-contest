import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_NONE,
    MAX_OIL_IN_FLASK,
    NON_PM,
    OBJ_DELETED,
    OBJ_FREE,
    OBJ_INVENT,
    OBJ_LUAFREE,
} from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import {
    UnsupportedObjectOperationError,
    blessorcurse,
    dealloc_obj,
    mksobj,
    mkobj,
    newObject,
    next_ident,
    rnd_class,
    weight,
} from '../js/obj.js';
import { init_objects } from '../js/o_init.js';
import {
    APPLE,
    ACID_VENOM,
    AMULET_OF_REFLECTION,
    AMULET_OF_STRANGULATION,
    BAG_OF_HOLDING,
    BLINDING_VENOM,
    BOULDER,
    CANDY_BAR,
    COIN_CLASS,
    DART,
    EGG,
    FOOD_RATION,
    GOLD_PIECE,
    LONG_SWORD,
    OIL_LAMP,
    PICK_AXE,
    POT_HEALING,
    POT_OIL,
    POT_WATER,
    RIN_ADORNMENT,
    RIN_SLOW_DIGESTION,
    RIN_TELEPORTATION,
    SACK,
    SCR_MAGIC_MAPPING,
    SLIME_MOLD,
    SPE_HEALING,
    SPE_NOVEL,
    SPLINT_MAIL,
    TINNING_KIT,
    TOUCHSTONE,
    WAN_SLEEP,
    objects_globals_init,
} from '../js/objects.js';
import {
    enableRngLog,
    getRngLog,
    initRng,
} from '../js/rng.js';

function initializedState() {
    const state = {
        // Object/monster id 1 is reserved; startup begins from 2.
        context: { ident: 2 },
        flags: {},
        moves: 0,
        u: { ulevel: 1 },
    };
    objects_globals_init(state);
    // Zero choices exercise the complete catalog initialization without using
    // the global game RNG that these substrate tests are trying to isolate.
    init_objects(state, () => 0);
    return state;
}

function scriptedRandom(script) {
    const remaining = [...script];
    const draw = (name, args) => {
        const expected = remaining.shift();
        assert.ok(expected, `unexpected ${name}(${args.join(',')})`);
        assert.equal(expected.name, name);
        assert.deepEqual(expected.args, args);
        const [range, base] = args;
        if (name === 'rn2')
            assert.ok(expected.result >= 0 && expected.result < range);
        else if (name === 'rnd')
            assert.ok(expected.result >= 1 && expected.result <= range);
        else if (name === 'rn1') {
            assert.ok(
                expected.result >= base && expected.result < base + range,
            );
        } else if (name === 'rne') {
            assert.ok(expected.result >= 1);
        }
        return expected.result;
    };
    return {
        random: {
            rn2: (bound) => draw('rn2', [bound]),
            rnd: (bound) => draw('rnd', [bound]),
            rn1: (range, base) => draw('rn1', [range, base]),
            rne: (bound) => draw('rne', [bound]),
        },
        done() {
            assert.deepEqual(remaining, []);
        },
    };
}

function plainObject(otyp, state, overrides = {}) {
    const type = state.objects[otyp];
    const obj = newObject({
        otyp,
        oclass: type.oc_class,
        quan: 1,
        ...overrides,
    });
    obj.owt = weight(obj, { state });
    return obj;
}

function generateWithScript(otyp, draws, configure = () => {}) {
    const state = initializedState();
    configure(state);
    const random = scriptedRandom([
        // Every mksobj starts by advancing the shared object/monster id.
        { name: 'rnd', args: [2], result: 1 },
        ...draws,
    ]);
    const obj = mksobj(otyp, true, false, { state, ...random });
    random.done();
    return { obj, state };
}

test('newObject exposes obj.h aliases over shared backing fields', () => {
    // Distinct values make each write-through alias observable.
    const initialSpecies = 17;
    const replacementNovel = 9;
    const initialUseCount = 3;
    const studiedCount = 5;
    const obj = newObject({
        otrapped: true,
        corpsenm: initialSpecies,
        usecount: initialUseCount,
    });
    assert.equal(obj.opoisoned, true);
    obj.opoisoned = false;
    assert.equal(obj.otrapped, false);
    assert.equal(obj.leashmon, initialSpecies);
    obj.novelidx = replacementNovel;
    assert.equal(obj.corpsenm, replacementNovel);
    obj.spestudied = studiedCount;
    assert.equal(obj.usecount, studiedCount);
});

test('newObject starts from zeroobj before mksobj applies sentinels', () => {
    const obj = newObject();
    assert.equal(obj.corpsenm, 0);
    assert.equal(obj.leashmon, 0);
    assert.equal(obj.novelidx, 0);
});

test('object-class macro aliases write through to their shared fields', () => {
    const state = initializedState();
    const type = state.objects[SPE_HEALING];

    type.oc_skill = 41;
    assert.equal(type.oc_subtyp, 41);
    type.oc_armcat = 6;
    assert.equal(type.oc_skill, 6);

    type.oc_bimanual = true;
    assert.equal(type.oc_big, true);
    type.oc_bulky = false;
    assert.equal(type.oc_bimanual, false);

    type.a_ac = -7;
    assert.equal(type.oc_oc1, -7);
    type.oc_hitbon = 3;
    assert.equal(type.a_ac, 3);

    type.oc_level = 5;
    assert.equal(type.oc_oc2, 5);
    type.a_can = 2;
    assert.equal(type.oc_level, 2);
});

test('next_ident returns the old id and preserves uint32 wrap draws', () => {
    const maximumUint32 = 0xffff_ffff;
    const state = { context: { ident: maximumUint32 } };
    const random = scriptedRandom([
        { name: 'rnd', args: [2], result: 1 }, // wrap ident to zero
        { name: 'rnd', args: [2], result: 2 }, // recover to reserved-id + 2
    ]);
    assert.equal(next_ident({ state, ...random }), maximumUint32);
    assert.equal(state.context.ident, 3);
    random.done();
});

test('next_ident uses the recorder-visible rnd wrapper in production', () => {
    resetGame();
    game.context = { ident: 2 };
    game.u = { ulevel: 1 };
    // A fixed arbitrary seed makes the recorder-log assertion reproducible.
    initRng(0x5eed);
    enableRngLog();
    assert.equal(next_ident(), 2);
    assert.match(getRngLog()[0], /^rnd\(2\)=/);
    assert.equal(getRngLog().length, 1);
});

test('object APIs reject uninitialized catalogs, ids, and partial RNGs', () => {
    assert.throws(
        () => weight(newObject({ otyp: DART, quan: 1 }), { state: {} }),
        /object catalog requires objects_globals_init/,
    );
    assert.throws(
        () => next_ident({ state: { context: { ident: 0 } } }),
        /initialized nonzero context.ident/,
    );
    assert.throws(
        () => next_ident({
            state: { context: { ident: 2 } },
            random: { rn2: () => 0 },
        }),
        /requires rn2, rnd, rn1, and rne/,
    );
});

test('real rne uses the supplied hero level and keeps nested log order', () => {
    const state = initializedState();
    // Level 30 raises rne's cap; this seed reaches seven before stopping.
    state.u.ulevel = 30;
    initRng(311);
    enableRngLog();
    const ring = mksobj(RIN_ADORNMENT, true, false, { state });
    assert.equal(ring.spe, 7);
    const log = getRngLog();
    assert.equal(log.at(-1), 'rne(3)=7');
    // Seven inner rne draws plus blessorcurse's earlier rn2(3).
    assert.equal(log.filter((entry) => entry.startsWith('rn2(3)=')).length, 8);
});

test('blessorcurse short-circuits its second draw unless BUC changes', () => {
    const unchanged = newObject();
    const first = scriptedRandom([
        { name: 'rn2', args: [10], result: 4 }, // nonzero: retain neutral BUC
    ]);
    blessorcurse(unchanged, 10, first);
    assert.equal(unchanged.blessed, false);
    assert.equal(unchanged.cursed, false);
    first.done();

    const cursed = newObject();
    const second = scriptedRandom([
        { name: 'rn2', args: [10], result: 0 }, // enter BUC change branch
        { name: 'rn2', args: [2], result: 0 }, // choose cursed half
    ]);
    blessorcurse(cursed, 10, second);
    assert.equal(cursed.cursed, true);
    second.done();

    const carried = newObject({ where: OBJ_INVENT });
    const noDraws = scriptedRandom([]);
    assert.throws(
        () => blessorcurse(carried, 10, noDraws),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'blessorcurse outside object initialization',
    );
    noDraws.done();
});

test('mksobj follows startup weapon initialization and PRNG order', () => {
    const state = initializedState();
    const random = scriptedRandom([
        { name: 'rnd', args: [2], result: 1 }, // next_ident increment
        { name: 'rn1', args: [6, 6], result: 8 }, // multigen stack size
        { name: 'rn2', args: [11], result: 1 }, // no positive enchantment
        { name: 'rn2', args: [10], result: 1 }, // no negative enchantment
        { name: 'rn2', args: [10], result: 1 }, // remains uncursed
        { name: 'rn2', args: [100], result: 1 }, // not poisoned
    ]);
    const obj = mksobj(DART, true, false, { state, ...random });
    assert.equal(obj.o_id, 2);
    assert.equal(state.context.ident, 3);
    assert.equal(obj.quan, 8);
    assert.equal(obj.owt, 8 * state.objects[DART].oc_weight);
    assert.equal(obj.cursed, false);
    assert.equal(obj.opoisoned, false);
    random.done();
});

test('initial-inventory sack retains the source rn2(1) draw', () => {
    const state = initializedState();
    const random = scriptedRandom([
        { name: 'rnd', args: [2], result: 2 }, // next_ident increment
        { name: 'rn2', args: [1], result: 0 },
    ]);
    const sack = mksobj(SACK, true, false, { state, ...random });
    assert.equal(sack.cobj, null);
    assert.equal(sack.owt, state.objects[SACK].oc_weight);
    random.done();
});

test('ordinary startup weapons skip multigen and poison draws', () => {
    const sword = generateWithScript(LONG_SWORD, [
        { name: 'rn2', args: [11], result: 1 }, // no positive enchantment
        { name: 'rn2', args: [10], result: 1 }, // no negative enchantment
        { name: 'rn2', args: [10], result: 1 }, // neutral BUC
    ]).obj;
    assert.equal(sword.quan, 1);
    assert.equal(sword.blessed || sword.cursed, false);
});

test('ordinary startup food can double its quantity', () => {
    const apple = generateWithScript(APPLE, [
        { name: 'rn2', args: [6], result: 0 }, // one-in-six quantity boost
    ]).obj;
    assert.equal(apple.quan, 2);
});

test('startup gems reset their overloaded species field before quantity', () => {
    const touchstone = generateWithScript(TOUCHSTONE, [
        { name: 'rn2', args: [6], result: 0 }, // one-in-six quantity boost
    ]).obj;
    assert.equal(touchstone.corpsenm, 0);
    assert.equal(touchstone.quan, 2);
});

test('charged and ordinary startup tools keep distinct draw boundaries', () => {
    const kit = generateWithScript(TINNING_KIT, [
        { name: 'rn1', args: [70, 30], result: 55 }, // 55 starting charges
    ]).obj;
    assert.equal(kit.spe, 55);

    const pickAxe = generateWithScript(PICK_AXE, []).obj;
    assert.equal(pickAxe.quan, 1);
});

test('startup potions preserve BUC and fromsink union initialization', () => {
    const potion = generateWithScript(POT_HEALING, [
        { name: 'rn2', args: [4], result: 0 }, // BUC changes
        { name: 'rn2', args: [2], result: 1 }, // blessed rather than cursed
    ]).obj;
    assert.equal(potion.blessed, true);
    assert.equal(potion.fromsink, 0);

    const water = generateWithScript(POT_WATER, [
        { name: 'rn2', args: [4], result: 1 }, // neutral BUC
    ]).obj;
    assert.equal(water.fromsink, 0);
});

test('startup scrolls use the shared four-way BUC branch', () => {
    const scroll = generateWithScript(SCR_MAGIC_MAPPING, [
        { name: 'rn2', args: [4], result: 0 }, // BUC changes
        { name: 'rn2', args: [2], result: 0 }, // cursed rather than blessed
    ]).obj;
    assert.equal(scroll.cursed, true);
});

test('startup spellbooks clear study count before their BUC draw', () => {
    const spellbook = generateWithScript(SPE_HEALING, [
        { name: 'rn2', args: [17], result: 1 }, // neutral BUC
    ]).obj;
    assert.equal(spellbook.usecount, 0);
    assert.equal(spellbook.blessed || spellbook.cursed, false);
});

test('startup novels consume BUC then title draws and keep object identity', () => {
    const state = initializedState();
    const random = scriptedRandom([
        { name: 'rnd', args: [2], result: 1 },
        { name: 'rn2', args: [17], result: 1 },
        { name: 'rn2', args: [41], result: 33 },
    ]);
    const novel = mksobj(SPE_NOVEL, true, false, { state, ...random });

    assert.equal(novel.o_id, 2);
    assert.equal(novel.novelidx, 33);
    assert.equal(novel.corpsenm, 33);
    assert.equal(novel.oextra.oname, 'Thud!');
    random.done();
});

test('dealloc_obj clears global references and preserves Lua-held extras', () => {
    const objectId = 17;
    const ordinary = newObject({
        o_id: objectId,
        oextra: { oname: 'Thud!' },
        where: OBJ_FREE,
    });
    const state = {
        context: {
            objsplit: { parent_oid: objectId, child_oid: objectId + 1 },
            tin: { tin: ordinary, o_id: objectId },
        },
        gk: { kickedobj: ordinary },
        gt: { thrownobj: ordinary },
        kickedobj: ordinary,
        thrownobj: ordinary,
    };
    dealloc_obj(ordinary, { state });
    assert.equal(ordinary.where, OBJ_DELETED);
    assert.equal(ordinary.oextra, null);
    assert.equal(state.thrownobj, null);
    assert.equal(state.kickedobj, null);
    assert.equal(state.gt.thrownobj, null);
    assert.equal(state.gk.kickedobj, null);
    assert.deepEqual(state.context.tin, { tin: null, o_id: 0 });
    assert.deepEqual(state.context.objsplit, {
        parent_oid: 0,
        child_oid: 0,
    });

    const extras = { oname: 'Going Postal' };
    const held = newObject({
        lua_ref_cnt: 1,
        oextra: extras,
        where: OBJ_FREE,
    });
    dealloc_obj(held, { state: {} });
    assert.equal(held.where, OBJ_LUAFREE);
    assert.equal(held.oextra, extras);
});

test('dealloc_obj stops timers before deleting any surviving light source', () => {
    const clearedByTimer = newObject({
        lamplit: true,
        otyp: OIL_LAMP,
        timed: 1,
        where: OBJ_FREE,
    });
    const firstOrder = [];
    dealloc_obj(clearedByTimer, {
        state: {},
        hooks: {
            stopObjectTimers(obj) {
                firstOrder.push('timer');
                obj.timed = 0;
                obj.lamplit = false;
            },
        },
    });
    assert.deepEqual(firstOrder, ['timer']);

    const survivingLight = newObject({
        lamplit: true,
        otyp: OIL_LAMP,
        timed: 1,
        where: OBJ_FREE,
    });
    const secondOrder = [];
    dealloc_obj(survivingLight, {
        state: {},
        hooks: {
            deleteObjectLightSource() { secondOrder.push('light'); },
            stopObjectTimers(obj) {
                secondOrder.push('timer');
                obj.timed = 0;
            },
        },
    });
    assert.deepEqual(secondOrder, ['timer', 'light']);
    assert.equal(survivingLight.where, OBJ_DELETED);
});

test('dealloc_obj preflights the timer seam before mutation', () => {
    const obj = newObject({
        oextra: { oname: 'Mort' },
        timed: 1,
        where: OBJ_FREE,
    });
    assert.throws(
        () => dealloc_obj(obj, { state: {} }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'stopObjectTimers',
    );
    assert.equal(obj.timed, 1);
    assert.deepEqual(obj.oextra, { oname: 'Mort' });
    assert.equal(obj.where, OBJ_FREE);
});

test('dealloc_obj rechecks light ownership after timer cleanup', () => {
    const lamp = newObject({
        lamplit: true,
        oextra: { oname: 'Lit' },
        otyp: OIL_LAMP,
        timed: 1,
        where: OBJ_FREE,
    });
    let stopped = 0;
    assert.throws(
        () => dealloc_obj(lamp, {
            state: {},
            hooks: {
                stopObjectTimers(obj) {
                    ++stopped;
                    obj.timed = 0;
                },
            },
        }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'deleteObjectLightSource',
    );
    assert.equal(stopped, 1);
    assert.equal(lamp.timed, 0);
    assert.equal(lamp.lamplit, true);
    assert.equal(lamp.where, OBJ_FREE);
});

test('dealloc_obj clears the boulder chain union before deletion', () => {
    const boulder = newObject({
        otyp: BOULDER,
        where: OBJ_FREE,
    });
    boulder.next_boulder = 123;

    dealloc_obj(boulder, { state: {} });

    assert.equal(boulder.next_boulder, 0);
    assert.equal(boulder.where, OBJ_DELETED);
});

test('Samurai startup splint mail is lacquered after generic armor draws', () => {
    const armor = generateWithScript(SPLINT_MAIL, [
        { name: 'rn2', args: [10], result: 1 }, // enter ordinary armor path
        { name: 'rn2', args: [11], result: 1 }, // no forced curse
        { name: 'rn2', args: [10], result: 1 }, // no positive enchantment
        { name: 'rn2', args: [10], result: 1 }, // neutral BUC
    ], (state) => {
        state.urole = { filecode: 'Sam' };
    }).obj;
    assert.equal(armor.oerodeproof, true);
    assert.equal(armor.rknown, true);
});

test('directional startup wands use the lower charge base', () => {
    const wand = generateWithScript(WAN_SLEEP, [
        { name: 'rn1', args: [5, 4], result: 6 }, // directional charge range
        { name: 'rn2', args: [17], result: 1 }, // neutral BUC
    ]).obj;
    assert.equal(wand.spe, 6);
});

test('charged startup rings derive enchantment sign from BUC', () => {
    const ring = generateWithScript(RIN_ADORNMENT, [
        { name: 'rn2', args: [3], result: 0 }, // BUC changes
        { name: 'rn2', args: [2], result: 1 }, // blessed
        { name: 'rn2', args: [10], result: 1 }, // generate enchantment
        { name: 'rn2', args: [10], result: 1 }, // use BUC sign
        { name: 'rne', args: [3], result: 2 }, // +2 enchantment
    ]).obj;
    assert.equal(ring.blessed, true);
    assert.equal(ring.spe, 2);
});

test('uncharged rings preserve harmful and ordinary curse boundaries', () => {
    const harmful = generateWithScript(RIN_TELEPORTATION, [
        { name: 'rn2', args: [10], result: 1 }, // enter harmful curse branch
    ]).obj;
    assert.equal(harmful.cursed, true);

    const ordinary = generateWithScript(RIN_SLOW_DIGESTION, [
        { name: 'rn2', args: [10], result: 1 }, // consider random curse
        { name: 'rn2', args: [9], result: 1 }, // avoid random curse
    ]).obj;
    assert.equal(ordinary.cursed, false);
});

test('amulets preserve special-curse and ordinary BUC draw boundaries', () => {
    const strangulation = generateWithScript(AMULET_OF_STRANGULATION, [
        { name: 'rn2', args: [10], result: 1 }, // force special curse
    ]).obj;
    assert.equal(strangulation.cursed, true);

    const reflection = generateWithScript(AMULET_OF_REFLECTION, [
        { name: 'rn2', args: [10], result: 1 }, // special-type test
        { name: 'rn2', args: [10], result: 1 }, // neutral ordinary BUC
    ]).obj;
    assert.equal(reflection.blessed || reflection.cursed, false);
});

test('artifact generation delegates after base weapon initialization', () => {
    const state = initializedState();
    const events = [];
    const random = scriptedRandom([
        { name: 'rnd', args: [2], result: 1 }, // next_ident increment
        { name: 'rn2', args: [11], result: 1 }, // no positive enchantment
        { name: 'rn2', args: [10], result: 1 }, // no negative enchantment
        { name: 'rn2', args: [10], result: 1 }, // neutral BUC
        { name: 'rn2', args: [20], result: 0 }, // create first artifact
    ]);
    const sword = mksobj(LONG_SWORD, true, true, {
        state,
        ...random,
        hooks: {
            artifactCount() {
                events.push('count');
                return 0;
            },
            makeArtifact(obj, options) {
                events.push('make');
                assert.equal(options.alignment, A_NONE);
                assert.equal(options.maxGiftValue, 99);
                assert.equal(options.adjustSpe, true);
                obj.oartifact = 1;
                return obj;
            },
            isPermanentlyPoisoned() {
                events.push('poison');
                return false;
            },
        },
    });
    assert.equal(sword.oartifact, 1);
    assert.deepEqual(events, ['count', 'make', 'poison']);
    random.done();
});

test('startup coins consume only the shared object-id draw', () => {
    const coin = generateWithScript(GOLD_PIECE, []).obj;
    assert.equal(coin.quan, 1);
    assert.equal(coin.owt, 1);
});

test('slime mold startup uses the current fruit id', () => {
    const currentFruitId = 17; // arbitrary valid fruit-chain identifier
    const { obj: fruit, state } = generateWithScript(SLIME_MOLD, [
        { name: 'rn2', args: [6], result: 1 }, // no quantity boost
    ], (generatedState) => {
        generatedState.context.current_fruit = currentFruitId;
    });
    assert.equal(fruit.spe, currentFruitId);
    assert.equal(state.flags.made_fruit, true);
});

test('candy bar startup records its one-based wrapper index', () => {
    const zeroBasedWrapper = 4; // select the fifth of twelve wrappers
    const candy = generateWithScript(CANDY_BAR, [
        { name: 'rn2', args: [12], result: zeroBasedWrapper },
        { name: 'rn2', args: [6], result: 1 }, // no quantity boost
    ]).obj;
    assert.equal(candy.spe, zeroBasedWrapper + 1);
});

test('oil lamp startup initializes fuel before BUC', () => {
    const startingFuel = 1234; // representative value in the 1000..1499 range
    const lamp = generateWithScript(OIL_LAMP, [
        { name: 'rn1', args: [500, 1000], result: startingFuel },
        { name: 'rn2', args: [5], result: 1 }, // neutral BUC
    ]).obj;
    assert.equal(lamp.spe, 1);
    assert.equal(lamp.age, startingFuel);
});

test('oil potion finalization replaces age with the full flask capacity', () => {
    const oil = generateWithScript(POT_OIL, [
        { name: 'rn2', args: [4], result: 1 }, // neutral BUC
    ]).obj;
    assert.equal(oil.age, MAX_OIL_IN_FLASK);
    assert.equal(oil.fromsink, 0);
});

test('monster-dependent startup objects require their canonical seam', () => {
    const state = initializedState();
    const random = scriptedRandom([
        { name: 'rnd', args: [2], result: 1 }, // next_ident increment
    ]);
    assert.throws(
        () => mksobj(EGG, true, false, { state, ...random }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'monsterObject',
    );
    random.done();
});

test('monster hooks retain source initialization and finalization order', () => {
    const state = initializedState();
    const phases = [];
    const chosenSpecies = 17; // arbitrary non-sentinel species identity
    const random = scriptedRandom([
        { name: 'rnd', args: [2], result: 1 }, // next_ident increment
        // Marker draws stand in for the unported monster subsystem and prove
        // that ordinary food quantity generation remains between its phases.
        { name: 'rn2', args: [3], result: 2 },
        { name: 'rn2', args: [6], result: 1 }, // no quantity boost
        { name: 'rn2', args: [5], result: 4 },
    ]);
    const egg = mksobj(EGG, true, false, {
        state,
        ...random,
        hooks: {
            monsterObject(obj, phase, env) {
                phases.push(phase);
                if (phase === 'initialize') {
                    assert.equal(obj.corpsenm, NON_PM);
                    env.random.rn2(3);
                    obj.corpsenm = chosenSpecies;
                } else if (phase === 'finalize') {
                    assert.equal(obj.corpsenm, chosenSpecies);
                    env.random.rn2(5);
                }
            },
        },
    });
    assert.deepEqual(phases, ['initialize', 'finalize']);
    assert.equal(egg.corpsenm, chosenSpecies);
    random.done();
});

test('noninitial sacks delegate their source-selected content count', () => {
    const state = initializedState();
    state.moves = 2; // past the initial-inventory boundary
    const random = scriptedRandom([
        { name: 'rnd', args: [2], result: 1 }, // next_ident increment
        { name: 'rn2', args: [2], result: 1 }, // select one sack item
    ]);
    let selectedCount = 0;
    mksobj(SACK, true, false, {
        state,
        ...random,
        hooks: {
            populateContainer(_obj, count) {
                selectedCount = count;
            },
        },
    });
    assert.equal(selectedCount, 1);
    random.done();
});

test('noninitial weapons preserve erosion and grease draw order', () => {
    const state = initializedState();
    state.moves = 2; // enables mkobj_erosions outside level generation
    const random = scriptedRandom([
        { name: 'rnd', args: [2], result: 1 }, // next_ident increment
        { name: 'rn2', args: [11], result: 1 }, // no positive enchantment
        { name: 'rn2', args: [10], result: 1 }, // no negative enchantment
        { name: 'rn2', args: [10], result: 1 }, // neutral BUC
        { name: 'rn2', args: [100], result: 1 }, // not erodeproof
        { name: 'rn2', args: [80], result: 0 }, // primary erosion
        { name: 'rn2', args: [9], result: 1 }, // stop at one erosion level
        { name: 'rn2', args: [80], result: 1 }, // no secondary erosion
        { name: 'rn2', args: [1000], result: 0 }, // generated greased
    ]);
    const sword = mksobj(LONG_SWORD, true, false, { state, ...random });
    assert.equal(sword.oeroded, 1);
    assert.equal(sword.oeroded2, 0);
    assert.equal(sword.oerodeproof, false);
    assert.equal(sword.greased, true);
    random.done();
});

test('weight handles ordinary stacks, coins, and bag status exactly', () => {
    const state = initializedState();
    const ration = plainObject(FOOD_RATION, state, { quan: 2 });
    assert.equal(
        weight(ration, { state }),
        2 * state.objects[FOOD_RATION].oc_weight,
    );

    // 150 coins exercises the source's +50 rounding before division by 100.
    const gold = plainObject(GOLD_PIECE, state, { quan: 150 });
    assert.equal(weight(gold, { state }), 2);

    const bag = plainObject(BAG_OF_HOLDING, state);
    bag.cobj = ration;
    ration.nobj = gold;
    assert.equal(
        weight(bag, { state }),
        state.objects[BAG_OF_HOLDING].oc_weight
            + Math.trunc((ration.owt + gold.owt + 1) / 2),
    );
    bag.blessed = true;
    assert.equal(
        weight(bag, { state }),
        state.objects[BAG_OF_HOLDING].oc_weight
            + Math.trunc((ration.owt + gold.owt + 3) / 4),
    );
    bag.blessed = false;
    bag.cursed = true;
    assert.equal(
        weight(bag, { state }),
        state.objects[BAG_OF_HOLDING].oc_weight
            + 2 * (ration.owt + gold.owt),
    );
});

test('mkobj uses initialized class totals before mksobj creation', () => {
    const state = initializedState();
    const total = state.go.oclass_prob_totals[COIN_CLASS];
    const random = scriptedRandom([
        { name: 'rnd', args: [total], result: 1 }, // first coin entry
        { name: 'rnd', args: [2], result: 1 }, // next_ident increment
    ]);
    const coin = mkobj(COIN_CLASS, false, { state, ...random });
    assert.equal(coin.otyp, GOLD_PIECE);
    assert.equal(coin.owt, 1);
    random.done();
});

test('mkobj walks a nontrivial initialized class probability boundary', () => {
    const state = initializedState();
    const firstFood = state.svb.bases[state.objects[APPLE].oc_class];
    let appleBoundary = 1;
    for (let otyp = firstFood; otyp < APPLE; ++otyp)
        appleBoundary += state.objects[otyp].oc_prob;
    const total = state.go.oclass_prob_totals[state.objects[APPLE].oc_class];
    const random = scriptedRandom([
        // First probability unit assigned to APPLE.
        { name: 'rnd', args: [total], result: appleBoundary },
        { name: 'rnd', args: [2], result: 1 }, // next_ident increment
        { name: 'rn2', args: [6], result: 1 }, // no quantity boost
    ]);
    const apple = mkobj(state.objects[APPLE].oc_class, false, {
        state,
        ...random,
    });
    assert.equal(apple.otyp, APPLE);
    random.done();
});

test('rnd_class preserves the all-zero equal-probability branch', () => {
    const state = initializedState();
    const first = BLINDING_VENOM;
    const last = ACID_VENOM;
    state.objects[first].oc_prob = 0;
    state.objects[last].oc_prob = 0;
    const random = scriptedRandom([
        // Two entries exercise rn1(last - first + 1, first).
        { name: 'rn1', args: [2, first], result: last },
    ]);
    assert.equal(rnd_class(first, last, { state, ...random }), last);
    random.done();
});
