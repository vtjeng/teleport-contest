import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_NONE,
    COST_DEGRD,
    MAX_OIL_IN_FLASK,
    NON_PM,
    OBJ_CONTAINED,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    OBJ_LUAFREE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import {
    UnsupportedObjectOperationError,
    ammo_and_launcher,
    blessorcurse,
    copy_oextra,
    dealloc_obj,
    is_flammable,
    init_dummyobj,
    is_launcher,
    is_missile,
    is_pick,
    is_shield,
    is_wet_towel,
    matching_launcher,
    mksobj,
    mkobj,
    newObject,
    next_ident,
    place_object,
    rnd_class,
    splitobj,
    weight,
} from '../js/obj.js';
import { init_objects } from '../js/o_init.js';
import {
    APPLE,
    ACID_VENOM,
    AMULET_OF_REFLECTION,
    AMULET_OF_STRANGULATION,
    ARROW,
    AXE,
    BAG_OF_HOLDING,
    BLINDFOLD,
    BLINDING_VENOM,
    BOOMERANG,
    BOULDER,
    BOW,
    CANDY_BAR,
    CHEST,
    COIN_CLASS,
    CROSSBOW,
    CROSSBOW_BOLT,
    CRYSKNIFE,
    DAGGER,
    DART,
    DWARVISH_MATTOCK,
    EGG,
    EUCALYPTUS_LEAF,
    FIGURINE,
    FLINT,
    FOOD_RATION,
    GEM_CLASS,
    GLOB_OF_BLACK_PUDDING,
    GLOB_OF_GRAY_OOZE,
    GOLD_PIECE,
    LANCE,
    LONG_SWORD,
    OIL_LAMP,
    ORCISH_HELM,
    PICK_AXE,
    POT_HEALING,
    POT_OIL,
    POT_WATER,
    RIN_ADORNMENT,
    RIN_SLOW_DIGESTION,
    RIN_TELEPORTATION,
    SACK,
    SCR_MAGIC_MAPPING,
    LEASH,
    LEATHER_GLOVES,
    SLIME_MOLD,
    TOOL_CLASS,
    SHURIKEN,
    SLING,
    SMALL_SHIELD,
    SPE_HEALING,
    SPE_NOVEL,
    SPEAR,
    SPLINT_MAIL,
    TALLOW_CANDLE,
    TINNING_KIT,
    TOUCHSTONE,
    TOWEL,
    WAN_FIRE,
    WAN_SLEEP,
    WORM_TOOTH,
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

function initializedFloorState() {
    const state = initializedState();
    state.level = new GameMap();
    state.program_state = { gameover: false };
    state.context.mon_moving = false;
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

test('place_object degrades an ordinary crysknife without an RNG draw', () => {
    const state = initializedFloorState();
    const knife = plainObject(CRYSKNIFE, state);
    const random = scriptedRandom([]);
    // An arbitrary empty interior square makes both floor indexes observable.
    const x = 11;
    const y = 7;

    place_object(knife, x, y, {
        state,
        ...random,
        hooks: {
            costlyAlteration() {
                assert.fail('an unbilled free object takes the source fast path');
            },
        },
    });

    assert.equal(knife.otyp, WORM_TOOTH);
    assert.equal(knife.oerodeproof, false);
    assert.equal(knife.where, OBJ_FLOOR);
    assert.equal(knife.ox, x);
    assert.equal(knife.oy, y);
    assert.equal(state.level.objects[x][y], knife);
    assert.equal(state.level.objlist, knife);
    random.done();
});

test('place_object preserves or degrades a fixed crysknife from rn2(10)', () => {
    const retainedState = initializedFloorState();
    const retained = plainObject(CRYSKNIFE, retainedState, {
        oerodeproof: true,
        unpaid: true,
    });
    const retainedRandom = scriptedRandom([
        // Any nonzero result preserves a fixed crysknife; 9 checks the bound.
        { name: 'rn2', args: [10], result: 9 },
    ]);
    // Separate empty squares keep the two placement outcomes independent.
    const retainedX = 12;
    const retainedY = 7;
    place_object(retained, retainedX, retainedY, {
        state: retainedState,
        ...retainedRandom,
        hooks: {
            costlyAlteration() {
                assert.fail('billing occurs only when degradation occurs');
            },
        },
    });
    assert.equal(retained.otyp, CRYSKNIFE);
    assert.equal(retained.oerodeproof, true);
    assert.equal(retained.where, OBJ_FLOOR);
    retainedRandom.done();

    const degradedState = initializedFloorState();
    const degraded = plainObject(CRYSKNIFE, degradedState, {
        oerodeproof: true,
        unpaid: true,
    });
    const degradedRandom = scriptedRandom([
        // Zero is the source's one-in-ten degradation outcome.
        { name: 'rn2', args: [10], result: 0 },
    ]);
    const degradedX = 13;
    const degradedY = 7;
    let alterationCount = 0;
    place_object(degraded, degradedX, degradedY, {
        state: degradedState,
        ...degradedRandom,
        hooks: {
            costlyAlteration(obj, alterType) {
                ++alterationCount;
                assert.equal(obj, degraded);
                assert.equal(alterType, COST_DEGRD);
                assert.equal(obj.otyp, CRYSKNIFE);
                assert.equal(obj.oerodeproof, true);
                assert.equal(obj.where, OBJ_FREE);
            },
        },
    });
    assert.equal(alterationCount, 1);
    assert.equal(degraded.otyp, WORM_TOOTH);
    assert.equal(degraded.oerodeproof, false);
    assert.equal(degraded.where, OBJ_FLOOR);
    degradedRandom.done();
});

test('place_object releases contained crysknives in chain order', () => {
    const state = initializedFloorState();
    const container = plainObject(SACK, state);
    const ordinary = plainObject(CRYSKNIFE, state, {
        where: OBJ_CONTAINED,
    });
    const fixed = plainObject(CRYSKNIFE, state, {
        where: OBJ_CONTAINED,
        oerodeproof: true,
    });
    container.cobj = ordinary;
    ordinary.ocontainer = container;
    ordinary.nobj = fixed;
    fixed.ocontainer = container;
    const random = scriptedRandom([
        // The ordinary child consumes no draw; zero degrades the fixed child.
        { name: 'rn2', args: [10], result: 0 },
    ]);
    const alterations = [];
    // This third empty square isolates recursive release from pile traversal.
    const x = 14;
    const y = 7;

    place_object(container, x, y, {
        state,
        ...random,
        hooks: {
            costlyAlteration(obj, alterType) {
                assert.equal(alterType, COST_DEGRD);
                assert.equal(obj.otyp, CRYSKNIFE);
                assert.equal(obj.where, OBJ_CONTAINED);
                alterations.push(obj);
            },
        },
    });

    assert.deepEqual(alterations, [ordinary, fixed]);
    assert.equal(ordinary.otyp, WORM_TOOTH);
    assert.equal(fixed.otyp, WORM_TOOTH);
    assert.equal(ordinary.ocontainer, container);
    assert.equal(fixed.ocontainer, container);
    assert.equal(container.where, OBJ_FLOOR);
    assert.equal(state.level.objects[x][y], container);
    random.done();
});

test('place_object stops before linking when crysknife billing is unavailable', () => {
    const state = initializedFloorState();
    const knife = plainObject(CRYSKNIFE, state, { unpaid: true });
    // This empty square exposes the exact pre-link costly_alteration boundary.
    const x = 15;
    const y = 7;

    assert.throws(
        () => place_object(knife, x, y, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'costlyAlteration',
    );
    assert.equal(knife.otyp, CRYSKNIFE);
    assert.equal(knife.where, OBJ_FREE);
    assert.equal(state.level.objects[x][y], null);
    assert.equal(state.level.objlist, null);
});

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

test('init_dummyobj fills in only the fields the obj.h tests read', () => {
    const state = initializedState();
    state.context.current_fruit = 7; // a fruit id svc.context could hold

    // mkobj.c init_dummyobj(). apply.c:410 is the one ported caller, and it
    // asks for a quantity of one.
    const chest = init_dummyobj(newObject(), CHEST, 1, state);
    assert.equal(chest.otyp, CHEST);
    assert.equal(chest.oclass, TOOL_CLASS);
    assert.equal(chest.quan, 1);
    assert.equal(chest.corpsenm, NON_PM);
    // objects.h gives a chest oc_uses_known 0, so `known` is set: the default
    // is "on" for types which do not use the flag.
    assert.equal(chest.known, true);
    assert.equal(chest.dknown, false);

    // A type that does use oc_uses_known keeps `known` clear. Leather gloves
    // are one, and are also one of the three kinds apply.c:422 gives a plural
    // verb.
    assert.equal(state.objects[LEATHER_GLOVES].oc_uses_known, 1);
    assert.equal(
        init_dummyobj(newObject(), LEATHER_GLOVES, 1, state).known, false,
    );

    // An amulet keeps whatever the zeroed struct had, which is false. Its
    // oc_uses_known is 0, so without C's AMULET_CLASS arm this one would come
    // back identified, which is what the arm exists to prevent for fakes and
    // for the real Amulet of Yendor.
    assert.equal(state.objects[AMULET_OF_REFLECTION].oc_uses_known, 0);
    assert.equal(
        init_dummyobj(newObject(), AMULET_OF_REFLECTION, 1, state).known,
        false,
    );

    // A zero quantity becomes one; any other value is kept.
    assert.equal(init_dummyobj(newObject(), CHEST, 0, state).quan, 1);
    assert.equal(init_dummyobj(newObject(), CHEST, 4, state).quan, 4);

    // corpsenm is a union in C, so the two types that overload it get their
    // own zero instead of NON_PM.
    assert.equal(init_dummyobj(newObject(), LEASH, 1, state).leashmon, 0);
    assert.equal(init_dummyobj(newObject(), LEASH, 1, state).corpsenm, 0);
    assert.equal(init_dummyobj(newObject(), BOULDER, 1, state).next_boulder, 0);
    // "suppressing fruit details leads to bad fruit #0", so a slime mold gets
    // the current fruit rather than the zeroed spe.
    assert.equal(init_dummyobj(newObject(), SLIME_MOLD, 1, state).spe, 7);

    // The struct is zeroed from cg.zeroobj first, so a caller's leftovers do
    // not survive into the answer.
    const reused = newObject({ blessed: true, quan: 12, spe: 5, owt: 99 });
    init_dummyobj(reused, CHEST, 1, state);
    assert.equal(reused.blessed, false);
    assert.equal(reused.spe, 0);
    assert.equal(reused.owt, 0);

    // C guards the whole body on a non-null pointer and returns what it was
    // given either way.
    assert.equal(init_dummyobj(null, CHEST, 1, state), null);
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

test('copy_oextra copies C-owned data while retaining monster pointers', () => {
    const target = newObject();
    const species = { name: 'little dog' };
    const inventory = newObject();
    // A nonzero monster association proves that copy_oextra() copies OMID.
    const associatedMonsterId = 77;
    const source = newObject({
        oextra: {
            omailcmd: 'reply',
            omid: associatedMonsterId,
            oname: 'practice darts',
            omonst: {
                data: species,
                // mcorpsenm sits beside edog so that the copy reports which
                // of the two mextra routes ran: mon.c copy_mextra():2643-2644
                // drops a NON_PM overlay, where a verbatim clone keeps it.
                mextra: { edog: { marker: 'deep copy' }, mcorpsenm: NON_PM },
                // Distinct coordinates prove that the strategy target is
                // copied by value, as monst.h:189 declares it.
                mgoal: { x: 11, y: 3 },
                minvent: inventory,
                // Distinct coordinates prove that the inline track is copied.
                mtrack: [{ x: 4, y: 5 }],
                nmon: {},
            },
        },
    });

    copy_oextra(target, source);

    assert.equal(target.oextra.oname, 'practice darts');
    assert.equal(target.oextra.omailcmd, 'reply');
    assert.equal(target.oextra.omid, associatedMonsterId);
    assert.notEqual(target.oextra.omonst, source.oextra.omonst);
    assert.equal(target.oextra.omonst.data, species);
    assert.equal(target.oextra.omonst.minvent, inventory);
    assert.equal(target.oextra.omonst.nmon, null);
    assert.deepEqual(target.oextra.omonst.mtrack, [{ x: 4, y: 5 }]);
    assert.notEqual(
        target.oextra.omonst.mtrack,
        source.oextra.omonst.mtrack,
    );
    assert.deepEqual(target.oextra.omonst.mgoal, { x: 11, y: 3 });
    // Writing through the source proves the copy holds its own coord rather
    // than the one the spread would have aliased.
    source.oextra.omonst.mgoal.x = 9;
    assert.equal(target.oextra.omonst.mgoal.x, 11);
    // mkobj.c:437-438 routes the extension records through copy_mextra(), so
    // the NON_PM overlay is absent on the copy and the edog is its own object.
    assert.deepEqual(
        target.oextra.omonst.mextra,
        { edog: { marker: 'deep copy' } },
    );
    assert.notEqual(
        target.oextra.omonst.mextra,
        source.oextra.omonst.mextra,
    );
    assert.notEqual(
        target.oextra.omonst.mextra.edog,
        source.oextra.omonst.mextra.edog,
    );
});

test('splitobj preserves source list placement, ids, and independent extras', () => {
    const state = initializedFloorState();
    // Both ids are divisible by four, so the first child candidate preserves
    // the unidentified-object shop-price class without a retry.
    const parentId = 8;
    const childId = 12;
    const originalQuantity = 5;
    const splitQuantity = 2;
    state.context.ident = childId;
    const successor = plainObject(APPLE, state, {
        // This distinct id only identifies the original list successor.
        o_id: 9,
        where: OBJ_FLOOR,
    });
    const stack = plainObject(DART, state, {
        dknown: false,
        nobj: successor,
        o_id: parentId,
        oextra: {
            // Object-monster ids stay with the original half of a split.
            omid: 77,
            oname: 'practice darts',
        },
        // Splitting two from five exercises weight recalculation on both
        // resulting quantities.
        quan: originalQuantity,
        where: OBJ_FLOOR,
    });
    stack.nexthere = successor;
    stack.owt = weight(stack, { state });
    const random = scriptedRandom([
        // next_ident() advances the shared id from 12 to 14.
        { name: 'rnd', args: [2], result: 2 },
    ]);

    const child = splitobj(stack, splitQuantity, { state, ...random });

    assert.equal(child.o_id, childId);
    assert.equal(state.context.ident, childId + 2);
    assert.equal(stack.quan, originalQuantity - splitQuantity);
    assert.equal(child.quan, splitQuantity);
    assert.equal(stack.nobj, child);
    assert.equal(child.nobj, successor);
    assert.equal(stack.nexthere, child);
    assert.equal(child.nexthere, successor);
    assert.equal(child.where, OBJ_FLOOR);
    assert.equal(child.owornmask, 0);
    assert.equal(child.oextra.oname, 'practice darts');
    // C: free_omid() sets OMID to 0; has_omid() checks nonzero.
    assert.equal(child.oextra.omid, 0);
    child.oextra.oname = 'split darts';
    assert.equal(stack.oextra.oname, 'practice darts');
    assert.deepEqual(state.context.objsplit, {
        parent_oid: parentId,
        child_oid: childId,
    });
    random.done();
});

test('splitobj retries ids until the shop-price class matches', () => {
    const state = initializedState();
    // Parent id 9 has the normal price class. Candidate 12 has a surcharge,
    // so nextoid() must select 13 before advancing the shared id.
    const firstCandidateId = 12;
    const matchingChildId = 13;
    const parentId = 9;
    state.context.ident = firstCandidateId;
    const stack = plainObject(DART, state, {
        dknown: false,
        o_id: parentId,
        quan: 2,
    });
    const random = scriptedRandom([
        // Advance from the selected id 13 to the next shared id 15.
        { name: 'rnd', args: [2], result: 2 },
    ]);

    const child = splitobj(stack, 1, { state, ...random });

    assert.equal(child.o_id, matchingChildId);
    assert.equal(state.context.ident, matchingChildId + 2);
    random.done();
});

test('splitobj runs bill, extra, timer, and light work in source order', () => {
    const state = initializedState();
    // Parent and candidate ids both use the normal shop-price class.
    const parentId = 9;
    const childId = 10;
    const originalQuantity = 3;
    const splitQuantity = 1;
    state.context.ident = childId;
    const species = { name: 'little dog' };
    const inventory = newObject();
    const stack = plainObject(TALLOW_CANDLE, state, {
        lamplit: true,
        o_id: parentId,
        oextra: {
            omailcmd: 'reply',
            // This association must remain only on the original stack.
            omid: 77,
            oname: 'practice candles',
            omonst: {
                data: species,
                mextra: { edog: { marker: 'deep copy' } },
                minvent: inventory,
                // Distinct coordinates prove the split copied the track.
                mtrack: [{ x: 4, y: 5 }],
                nmon: {},
            },
        },
        // Three candles leave two on the parent after a one-candle split.
        quan: originalQuantity,
        timed: 1,
        unpaid: true,
    });
    const events = [];
    const random = scriptedRandom([
        // next_ident() advances the shared id from 10 to 11.
        { name: 'rnd', args: [2], result: 1 },
    ]);

    const child = splitobj(stack, splitQuantity, {
        state,
        ...random,
        hooks: {
            splitBill(parent, split) {
                events.push('bill');
                assert.equal(
                    parent.quan,
                    originalQuantity - splitQuantity,
                );
                assert.equal(split.quan, splitQuantity);
                assert.equal(split.oextra, null);
            },
            splitObjectTimers(parent, split) {
                events.push('timers');
                assert.equal(parent, stack);
                assert.equal(split.oextra.oname, 'practice candles');
                // C: free_omid() sets OMID to 0; has_omid() checks nonzero.
                assert.equal(split.oextra.omid, 0);
                split.timed = 1;
            },
            splitObjectLight(parent, split) {
                events.push('light');
                assert.equal(parent, stack);
                split.lamplit = true;
            },
        },
    });

    assert.deepEqual(events, ['bill', 'timers', 'light']);
    assert.equal(child.timed, 1);
    assert.equal(child.lamplit, true);
    assert.equal(child.oextra.omonst.data, species);
    assert.equal(child.oextra.omonst.minvent, inventory);
    assert.equal(child.oextra.omonst.nmon, null);
    random.done();
});

test('splitobj tests light ownership with obj_sheds_light()', () => {
    const state = initializedState();
    const parentId = 9;
    const childId = 10;
    state.context.ident = childId;
    const stack = plainObject(DART, state, {
        // This deliberately inconsistent bit isolates obj_sheds_light():
        // a lit non-light object does not own a light source to split.
        lamplit: true,
        o_id: parentId,
        quan: 2,
    });
    const random = scriptedRandom([
        // next_ident() advances the shared id from 10 to 11.
        { name: 'rnd', args: [2], result: 1 },
    ]);

    const child = splitobj(stack, 1, { state, ...random });

    assert.equal(child.lamplit, false);
    random.done();
});

test('splitobj rejects missing owners and ids before mutating the stack', () => {
    const state = initializedState();
    // A two-object stack split by one is the smallest valid split request.
    const originalQuantity = 2;
    const splitQuantity = 1;
    // Id 9 uses the normal unidentified-object shop-price class.
    const parentId = 9;
    const timedStack = plainObject(DART, state, {
        o_id: parentId,
        quan: originalQuantity,
        timed: 1,
    });
    const noDraws = scriptedRandom([]);

    assert.throws(
        () => splitobj(timedStack, splitQuantity, { state, ...noDraws }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'splitObjectTimers',
    );
    assert.equal(timedStack.quan, originalQuantity);
    assert.equal(timedStack.nobj, null);
    noDraws.done();

    const missingIdState = initializedState();
    delete missingIdState.context.ident;
    const unidentifiedStack = plainObject(DART, missingIdState, {
        o_id: parentId,
        quan: originalQuantity,
    });
    const stillNoDraws = scriptedRandom([]);

    assert.throws(
        () => splitobj(unidentifiedStack, splitQuantity, {
            state: missingIdState,
            ...stillNoDraws,
        }),
        /next_ident requires initialized nonzero context\.ident/,
    );
    assert.equal(unidentifiedStack.quan, originalQuantity);
    assert.equal(unidentifiedStack.nobj, null);
    assert.equal(missingIdState.context.ident, undefined);
    stillNoDraws.done();
});

test('is_flammable follows material and source exceptions', () => {
    const state = initializedState();
    assert.equal(is_flammable(plainObject(APPLE, state), state), true);
    assert.equal(is_flammable(plainObject(TALLOW_CANDLE, state), state), false);
    assert.equal(is_flammable(plainObject(POT_OIL, state), state), false);
    assert.equal(is_flammable(plainObject(WAN_FIRE, state), state), false);
});

// C ref: obj.h is_pick(). Both halves of the macro are pinned to entries read
// out of include/objects.h: the class test and the oc_skill test.
test('is_pick accepts the two P_PICK_AXE entries and nothing else', () => {
    const state = initializedState();
    // objects.h:1007 WEPTOOL("pick-axe", ... P_PICK_AXE ...) -- TOOL_CLASS.
    assert.equal(is_pick(plainObject(PICK_AXE, state), state), true);
    // objects.h:345 WEAPON("dwarvish mattock", ... P_PICK_AXE ...), the other
    // arm of the class test.
    assert.equal(is_pick(plainObject(DWARVISH_MATTOCK, state), state), true);
    // objects.h:236 WEAPON("axe", ... P_AXE ...): right class, wrong skill.
    assert.equal(is_pick(plainObject(AXE, state), state), false);
    // A tinning kit is TOOL_CLASS with no weapon skill, so a tool alone is not
    // enough either.
    assert.equal(is_pick(plainObject(TINNING_KIT, state), state), false);
    // The skill alone is not enough: a pick-axe reclassed out of WEAPON_CLASS
    // and TOOL_CLASS fails the first half of the macro.
    assert.equal(
        is_pick(plainObject(PICK_AXE, state, { oclass: GEM_CLASS }), state),
        false,
    );
});

// C ref: obj.h matching_launcher() (242-243). oc_skill is positive on a
// launcher and the negation of that value on the ammunition it fires, so the
// macro is one comparison plus a guard against a missing launcher.
test('matching_launcher accepts only the launcher that negates the skill',
    () => {
        const state = initializedState();
        const arrow = plainObject(ARROW, state);
        // objects.h:141-143 PROJECTILE("arrow", ... -P_BOW ...) against
        // objects.h:395 BOW("bow", ... P_BOW ...): -20 negates 20.
        assert.equal(matching_launcher(arrow, plainObject(BOW, state), state),
            true);
        // objects.h:405 BOW("crossbow", ... P_CROSSBOW ...) is 22, which an
        // arrow's -20 does not negate. Comparing only the signs, or comparing
        // absolute values, would accept this pair.
        assert.equal(
            matching_launcher(arrow, plainObject(CROSSBOW, state), state),
            false,
        );
        // objects.h:155-157 PROJECTILE("crossbow bolt", ... -P_CROSSBOW ...)
        // is the ammunition a crossbow does fire, so the same launcher that
        // just failed succeeds here.
        assert.equal(
            matching_launcher(plainObject(CROSSBOW_BOLT, state),
                plainObject(CROSSBOW, state), state),
            true,
        );
        // C's leading `(l) &&`: an empty launcher slot answers false rather
        // than reading oc_skill off nothing.
        assert.equal(matching_launcher(arrow, null, state), false);
    });

// C ref: obj.h ammo_and_launcher() (244). is_ammo() is what the added test
// contributes; matching_launcher() alone holds in both directions.
test('ammo_and_launcher also requires the first object to be ammunition',
    () => {
        const state = initializedState();
        const arrow = plainObject(ARROW, state);
        const bow = plainObject(BOW, state);
        assert.equal(ammo_and_launcher(arrow, bow, state), true);
        // The GEM_CLASS arm of is_ammo(): objects.h:1521-1525 gives every ROCK
        // entry -P_SLING, so flint (objects.h:1604) is sling ammunition even
        // though it is not WEAPON_CLASS. objects.h:403 BOW("sling", ...
        // P_SLING ...) is the launcher.
        assert.equal(
            ammo_and_launcher(plainObject(FLINT, state),
                plainObject(SLING, state), state),
            true,
        );
        // Reversed, the comparison still holds -- a bow's 20 equals -(-20) --
        // so this pair distinguishes the two macros. is_ammo(bow) is false
        // because 20 is outside [-P_CROSSBOW, -P_BOW].
        assert.equal(matching_launcher(bow, arrow, state), true);
        assert.equal(ammo_and_launcher(bow, arrow, state), false);
        // Ammunition, but not for this launcher.
        assert.equal(
            ammo_and_launcher(arrow, plainObject(CROSSBOW, state), state),
            false,
        );
    });

// C ref: obj.h is_launcher() (235-237). skills.h:43-45 numbers the launcher
// skills P_BOW 20, P_SLING 21 and P_CROSSBOW 22, and both window bounds are
// closed, so each end has an object sitting on it here.
test('is_launcher accepts the closed P_BOW through P_CROSSBOW window', () => {
    const state = initializedState();
    // objects.h BOW("bow", ... P_BOW ...): the lower bound itself, which
    // `> P_BOW` would drop.
    assert.equal(is_launcher(plainObject(BOW, state), state), true);
    // P_SLING 21, inside the window.
    assert.equal(is_launcher(plainObject(SLING, state), state), true);
    // P_CROSSBOW 22: the upper bound, which `< P_CROSSBOW` would drop.
    assert.equal(is_launcher(plainObject(CROSSBOW, state), state), true);
    // skills.h:42 P_LANCE 19 is the skill immediately below the window, and a
    // lance is WEAPON_CLASS, so only the bound rejects it. This is also the
    // pair that separates C's `&&` from `||`: the class test alone holds.
    assert.equal(is_launcher(plainObject(LANCE, state), state), false);
    // Ammunition carries the launcher skill negated, so -P_BOW is outside the
    // window on the far side.
    assert.equal(is_launcher(plainObject(ARROW, state), state), false);
    // The class term: flint is sling ammunition but GEM_CLASS, and its
    // -P_SLING is outside the window besides.
    assert.equal(is_launcher(plainObject(FLINT, state), state), false);
});

// C ref: obj.h is_missile() (245-248). skills.h:46-48 numbers the thrown
// skills P_DART 23, P_SHURIKEN 24 and P_BOOMERANG 25, and the macro reads them
// negated, so -P_BOOMERANG is the low bound and -P_DART the high one.
test('is_missile accepts the closed -P_BOOMERANG through -P_DART window',
    () => {
        const state = initializedState();
        // -P_BOOMERANG, the low bound, which `> -P_BOOMERANG` would drop.
        assert.equal(is_missile(plainObject(BOOMERANG, state), state), true);
        assert.equal(is_missile(plainObject(SHURIKEN, state), state), true);
        // -P_DART, the high bound, which `< -P_DART` would drop. A dart is
        // WEAPON_CLASS and not TOOL_CLASS, so this case also separates C's
        // `||` between the two classes from `&&`.
        assert.equal(is_missile(plainObject(DART, state), state), true);
        // -P_CROSSBOW is -22, one step above the high bound: the nearest
        // ammunition the window excludes.
        assert.equal(
            is_missile(plainObject(CROSSBOW_BOLT, state), state), false,
        );
        assert.equal(is_missile(plainObject(ARROW, state), state), false);
        // A positive skill on a weapon: the class test holds and the window
        // does not, which is what C's outer `&&` decides.
        assert.equal(is_missile(plainObject(SPEAR, state), state), false);
    });

// C ref: obj.h is_wet_towel() (256). A towel's spe counts the water left in
// it rather than an enchantment, which is why obj.h:250-252 excludes towels
// from is_weptool().
test('is_wet_towel accepts a towel only while its spe is above zero', () => {
    const state = initializedState();
    // objects.h:948 EYEWEAR("towel", ...), holding one turn of water.
    assert.equal(is_wet_towel(plainObject(TOWEL, state, { spe: 1 })), true);
    // A dry towel. `spe > 0` rejects 0 where `spe >= 0` would accept it.
    assert.equal(is_wet_towel(plainObject(TOWEL, state, { spe: 0 })), false);
    // objects.h:946 EYEWEAR("blindfold", ...), the neighbouring tool: a
    // positive spe on anything else is an enchantment, not wetness.
    assert.equal(
        is_wet_towel(plainObject(BLINDFOLD, state, { spe: 3 })),
        false,
    );
});

// C ref: obj.h is_shield() (280-282). oc_armcat and oc_skill share one union
// field, so the class test is the only thing keeping a weapon out.
test('is_shield accepts armor in the shield category only', () => {
    const state = initializedState();
    // objects.h:653-655 SHIELD("small shield", ...); the SHIELD macro at
    // objects.h:434-436 passes ARM_SHIELD.
    assert.equal(is_shield(plainObject(SMALL_SHIELD, state), state), true);
    // objects.h:448 HELM("orcish helm", ...) reaches the same ARMOR() macro
    // with ARM_HELM, objclass.h:40: right class, wrong category.
    assert.equal(is_shield(plainObject(ORCISH_HELM, state), state), false);
    // objects.h:200-202 WEAPON("dagger", ... P_DAGGER ...). P_DAGGER is 1
    // (skills.h:24) and so is ARM_SHIELD (objclass.h:39), so the shared union
    // field already matches and only `oclass == ARMOR_CLASS` rejects this.
    assert.equal(is_shield(plainObject(DAGGER, state), state), false);
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

test('generic egg startup is source-owned and remains untimed', () => {
    const { obj: egg } = generateWithScript(EGG, [
        { name: 'rn2', args: [3], result: 2 }, // generic egg
        { name: 'rn2', args: [6], result: 1 }, // no quantity boost
    ]);
    assert.equal(egg.corpsenm, NON_PM);
    assert.equal(egg.quan, 1);
    assert.equal(egg.timed, 0);
});

test('residual figurine hooks retain source initialization order', () => {
    const state = initializedState();
    const phases = [];
    const chosenSpecies = 17; // arbitrary non-sentinel species identity
    const random = scriptedRandom([
        { name: 'rnd', args: [2], result: 1 }, // next_ident increment
        // Marker draws bracket the residual figurine subsystem; generic BUC
        // initialization stays between its two source phases.
        { name: 'rn2', args: [3], result: 2 },
        { name: 'rn2', args: [4], result: 1 }, // neutral BUC
        { name: 'rn2', args: [5], result: 4 },
    ]);
    const figurine = mksobj(FIGURINE, true, false, {
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
    assert.equal(figurine.corpsenm, chosenSpecies);
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

test('mkobj steps over the globs objects.h gives no probability', () => {
    // objnam.c readobjnam() omits the whole `if (d.otmp->globby)` block at
    // 5042-5070, and on the mkobj() arm of 5037 nothing refuses a glob first.
    // The omission is safe because objects.h:1066-1074 gives all four
    // GLOB_OF_* rows oc_prob 0, and mkobj()'s cumulative walk subtracts each
    // row's oc_prob and advances while the remainder stays positive, so a row
    // worth 0 can never be the one it stops on.
    const state = initializedState();
    const foodClass = state.objects[GLOB_OF_GRAY_OOZE].oc_class;
    const firstFood = state.svb.bases[foodClass];
    // The four globs are contiguous, so all four share one cumulative
    // position: the first probability unit no earlier row has claimed.
    let globBoundary = 1;
    for (let otyp = firstFood; otyp < GLOB_OF_GRAY_OOZE; ++otyp)
        globBoundary += state.objects[otyp].oc_prob;
    for (let otyp = GLOB_OF_GRAY_OOZE; otyp <= GLOB_OF_BLACK_PUDDING; ++otyp)
        assert.equal(state.objects[otyp].oc_prob, 0, `otyp ${otyp}`);

    const total = state.go.oclass_prob_totals[foodClass];
    const random = scriptedRandom([
        // Aim the walk straight at the first glob's position.
        { name: 'rnd', args: [total], result: globBoundary },
        { name: 'rnd', args: [2], result: 1 }, // next_ident increment
        // mksobj()'s FOOD_CLASS quantity roll; 0 is the arm that gives 2.
        { name: 'rn2', args: [6], result: 0 },
    ]);
    const drawn = mkobj(foodClass, false, { state, ...random });
    // EUCALYPTUS_LEAF is the next row carrying any probability: the walk
    // passes the four globs and the equally improbable kelp frond.
    assert.equal(drawn.otyp, EUCALYPTUS_LEAF);
    assert.equal(drawn.globby, false);
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
