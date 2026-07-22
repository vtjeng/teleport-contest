import assert from 'node:assert/strict';
import test from 'node:test';

import {
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_MINVENT,
    ONAME_LEVEL_DEF,
    REVIVE_MON,
    ROT_CORPSE,
    ROOM,
    ROOMOFFSET,
    W_SADDLE,
} from '../js/const.js';
import {
    ART_ORCRIST,
    artifact_exists,
    exist_artifact,
    init_artifacts,
    nartifact_exist,
} from '../js/artifacts.js';
import { GameMap } from '../js/game.js';
import { add_to_container } from '../js/invent.js';
import { init_objects } from '../js/o_init.js';
import { mksobj, weight } from '../js/obj.js';
import { newMonster } from '../js/monst.js';
import {
    APPLE,
    BAG_OF_HOLDING,
    CHEST,
    CORPSE,
    ELVEN_BROADSWORD,
    FIGURINE,
    GOLD_PIECE,
    LUCKSTONE,
    ROCK,
    SADDLE,
    SPBOOK_CLASS,
    SPE_NOVEL,
    STATUE,
    objects_globals_init,
} from '../js/objects.js';
import {
    PM_ARCHEOLOGIST,
    PM_OGRE,
    PM_TROLL,
    PM_WARHORSE,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    UnsupportedSpecialObjectError,
    create_object,
    lspo_object,
    new_sp_lev_object_context,
} from '../js/sp_lev_object.js';
import { peek_timer, timeout_globals_init } from '../js/timeout.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';

function roomState() {
    const level = new GameMap();
    const room = {
        lx: 2,
        ly: 3,
        hx: 4,
        hy: 4,
        roomnoidx: 0,
        rlit: 0,
    };
    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y) {
            const location = level.at(x, y);
            location.typ = ROOM;
            location.roomno = ROOMOFFSET;
            location.edge = false;
        }
    }
    const state = {
        ...rawMonsterGenerationState(),
        context: {
            ident: 2,
            achieveo: {
                mines_prize_oid: 0,
                soko_prize_oid: 0,
                castle_prize_old: 0,
                mines_prize_otyp: 0,
                soko_prize_otyp: 0,
                castle_prize_otyp: 0,
                minetn_reached: false,
            },
        },
        flags: { initalign: 0 },
        in_mklev: true,
        level,
        moves: 7,
        urole: { mnum: PM_ARCHEOLOGIST, questarti: 0 },
    };
    objects_globals_init(state);
    init_artifacts(state);
    monst_globals_init(state);
    reset_mvitals(state);
    timeout_globals_init(state);
    return { level, room, state };
}

function quietGenerationRandom() {
    return {
        d(number, sides) {
            return number * sides;
        },
        rn1(_bound, base) {
            return base;
        },
        rn2(bound) {
            if (bound === 10) return 9;
            if (bound === 80) return 79;
            if (bound === 100) return 99;
            if (bound === 1000) return 999;
            return 0;
        },
        rnd() {
            return 1;
        },
        rne() {
            return 1;
        },
        rnz(value) {
            return value;
        },
    };
}

function loggingGenerationRandom(overrides = {}) {
    const base = quietGenerationRandom();
    const calls = [];
    const random = {};
    for (const name of ['d', 'rn1', 'rn2', 'rnd', 'rne', 'rnz']) {
        random[name] = (...args) => {
            calls.push([name, ...args]);
            return typeof overrides[name] === 'function'
                ? overrides[name](...args)
                : base[name](...args);
        };
    }
    return { calls, random };
}

function carrier(state, species, id = 40) {
    return newMonster({
        data: state.mons[species],
        mnum: species,
        m_id: id,
        mcanmove: true,
        minvent: null,
    });
}

test('explicit double-negative coordinates use the random-coordinate sentinel', () => {
    function generate(coordinate) {
        const { room, state } = roomState();
        const logged = loggingGenerationRandom();
        const specification = { id: GOLD_PIECE };
        if (coordinate !== undefined)
            specification.coordinate = coordinate;
        const obj = lspo_object(specification, room, {
            state,
            random: logged.random,
        });
        return {
            calls: logged.calls,
            coordinate: [obj.ox, obj.oy],
            quantity: obj.quan,
        };
    }

    const omitted = generate(undefined);
    const explicit = generate({ x: -1, y: -1 });
    assert.deepEqual(explicit, omitted);
    // This room is width 3 from x=2 and height 2 from y=3.
    assert.deepEqual(explicit.calls.slice(0, 2), [
        ['rn1', 3, 2],
        ['rn1', 2, 3],
    ]);
});

test('named exact and class-generated novels resolve their canonical index', () => {
    function nameObject(obj, name) {
        obj.oextra ??= {};
        obj.oextra.oname = name;
        return obj;
    }

    const exactSetup = roomState();
    const exact = lspo_object({
        id: SPE_NOVEL,
        name: 'Thud',
        coordinate: { x: 0, y: 0 },
    }, exactSetup.room, {
        state: exactSetup.state,
        random: quietGenerationRandom(),
        hooks: { nameObject },
    });
    assert.equal(exact.otyp, SPE_NOVEL);
    assert.equal(exact.novelidx, 33);
    assert.equal(exact.oextra.oname, 'Thud');

    const classSetup = roomState();
    init_objects(classSetup.state, () => 0);
    const classRandom = quietGenerationRandom();
    // The novel is the final positive-probability spellbook entry, so the
    // inclusive rnd(1000) upper endpoint selects it directly.
    classRandom.rnd = (bound) => bound === 1000 ? 1000 : 1;
    const generated = lspo_object({
        class: SPBOOK_CLASS,
        name: 'Sorcery',
        coordinate: { x: 0, y: 0 },
    }, classSetup.room, {
        state: classSetup.state,
        random: classRandom,
        hooks: { nameObject },
    });
    assert.equal(generated.otyp, SPE_NOVEL);
    assert.equal(generated.novelidx, 4);
    assert.equal(generated.oextra.oname, 'Sorcery');
});

test('special-object numeric fields use their source C storage widths', () => {
    const speCases = [
        {
            name: 'one below signed-byte minimum wraps to maximum',
            input: -129,
            expected: 127,
        },
        { name: 'signed-byte minimum is stable', input: -128, expected: -128 },
        { name: 'signed-byte maximum is stable', input: 127, expected: 127 },
        {
            name: 'one above signed-byte maximum wraps to minimum',
            input: 128,
            expected: -128,
        },
        { name: 'all byte bits set becomes minus one', input: 255, expected: -1 },
        { name: 'one full byte wraps to zero', input: 256, expected: 0 },
        {
            name: 'value below positive short-sentinel alias assigns minus 128',
            input: 65408,
            expected: -128,
        },
        {
            name: 'positive short alias of minus 127 preserves generated zero',
            input: 65409,
            expected: 0,
        },
        {
            name: 'value above positive short-sentinel alias assigns minus 126',
            input: 65410,
            expected: -126,
        },
        {
            name: 'negative short alias of minus 127 preserves generated zero',
            input: -65663,
            expected: 0,
        },
    ];
    for (const { name, input, expected } of speCases) {
        const { room, state } = roomState();
        const obj = lspo_object({
            id: CHEST,
            spe: input,
            coordinate: { x: 0, y: 0 },
        }, room, { state, random: quietGenerationRandom() });
        assert.equal(obj.spe, expected, name);
    }

    const rechargeCases = [
        { name: 'one below negative field width wraps to seven', input: -9, expected: 7 },
        { name: 'negative field width wraps to zero', input: -8, expected: 0 },
        { name: 'minus one sets all three bits', input: -1, expected: 7 },
        { name: 'lowest positive field value is stable', input: 1, expected: 1 },
        { name: 'highest field value is stable', input: 7, expected: 7 },
        { name: 'one full field width wraps to zero', input: 8, expected: 0 },
        { name: 'one above field width wraps to one', input: 9, expected: 1 },
    ];
    for (const { name, input, expected } of rechargeCases) {
        const { room, state } = roomState();
        const obj = lspo_object({
            id: CHEST,
            recharged: input,
            coordinate: { x: 0, y: 0 },
        }, room, { state, random: quietGenerationRandom() });
        assert.equal(obj.recharged, expected, name);
        if (expected === 0) {
            assert.ok(
                !Object.is(obj.recharged, -0),
                `${name}: zero must not retain a negative sign`,
            );
        }
    }
});

test('named objects must preserve their linked object identity', () => {
    const { level, room, state } = roomState();
    let original = null;
    assert.throws(
        () => lspo_object({
            id: CHEST,
            name: 'detached',
            coordinate: { x: 0, y: 0 },
        }, room, {
            state,
            random: quietGenerationRandom(),
            hooks: {
                nameObject(obj) {
                    original = obj;
                    assert.equal(obj.where, OBJ_FLOOR);
                    assert.equal(level.objects[2][3], obj);
                    assert.equal(level.objlist, obj);
                    return { ...obj };
                },
            },
        }),
        /named-object identity preservation/,
    );
    assert.equal(original.where, OBJ_FLOOR);
    assert.equal(original.o_id, 2);
    assert.equal(level.objects[2][3], original);
    assert.equal(level.objlist, original);
    assert.equal(state.context.ident, 3);
});

test('trapKnown follows the source truthy trapped gate', () => {
    const cases = [
        [{ trapped: true }, [true, false], [true, false]],
        [
            { trapped: true, trapKnown: false },
            [true, true],
            [true, false],
        ],
        [
            { trapped: true, trapKnown: true },
            [true, false],
            [true, true],
        ],
        [
            { trapped: false, trapKnown: true },
            [false, false],
            [false, false],
        ],
        [
            { trapKnown: true },
            [false, false],
            [false, true],
        ],
    ];
    for (const [descriptor, generated, expected] of cases) {
        const { room, state } = roomState();
        const obj = lspo_object({
            id: CHEST,
            ...descriptor,
            name: 'trap-state seed',
            coordinate: { x: 0, y: 0 },
        }, room, {
            state,
            random: quietGenerationRandom(),
            hooks: {
                nameObject(candidate) {
                    [candidate.otrapped, candidate.tknown] = generated;
                    return candidate;
                },
            },
        });
        assert.deepEqual(
            [obj.otrapped, obj.tknown],
            expected,
            JSON.stringify(descriptor),
        );
    }
});

test('generic Medusa statues fail before coordinate draws or object mutation', () => {
    const { level, room, state } = roomState();
    state.medusa_level = { ...state.u.uz };
    const logged = loggingGenerationRandom();
    const context = new_sp_lev_object_context();

    assert.throws(
        () => lspo_object({
            id: STATUE,
            coordinate: { x: -1, y: -1 },
        }, room, {
            state,
            random: logged.random,
            spObjectContext: context,
        }),
        /Medusa-level generic-statue population/,
    );
    assert.deepEqual(logged.calls, []);
    assert.equal(state.context.ident, 2);
    assert.deepEqual(context.containers, []);
    assert.equal(state.gt.timer_base, null);
    assert.equal(state.svt.timer_id, 1);
    assert.equal(level.objlist, null);
    assert.equal(level.objects[2][3], null);
});

test('a Medusa statue under a dead parent is uncreated before special handling', () => {
    const { level, room, state } = roomState();
    state.medusa_level = { ...state.u.uz };
    const context = new_sp_lev_object_context();
    context.containers.push(null);

    const result = lspo_object({
        id: STATUE,
        coordinate: { x: 0, y: 0 },
    }, room, {
        state,
        random: quietGenerationRandom(),
        spObjectContext: context,
    });

    assert.equal(result, null);
    assert.deepEqual(context.containers, [null]);
    assert.equal(level.objlist, null);
    assert.equal(level.objects[2][3], null);
});

test('an artifact under a dead parent is uncreated before deallocation', () => {
    const { level, room, state } = roomState();
    const context = new_sp_lev_object_context();
    context.containers.push(null);
    let artifact = null;

    const result = lspo_object({
        id: ELVEN_BROADSWORD,
        name: 'Orcrist',
        coordinate: { x: 0, y: 0 },
    }, room, {
        state,
        random: quietGenerationRandom(),
        spObjectContext: context,
        hooks: {
            nameObject(obj, name) {
                obj.oextra ??= {};
                obj.oextra.oname = name;
                artifact_exists(
                    obj,
                    name,
                    true,
                    ONAME_LEVEL_DEF,
                    state,
                );
                artifact = obj;
                return obj;
            },
        },
    });

    assert.equal(result, null);
    assert.equal(artifact.where, OBJ_DELETED);
    assert.equal(artifact.oartifact, 0);
    assert.equal(state.artiexist[ART_ORCRIST].exists, 0);
    assert.equal(exist_artifact(ELVEN_BROADSWORD, 'Orcrist', state), false);
    assert.equal(nartifact_exist(state), 0);
    assert.equal(level.objlist, null);
    assert.equal(level.objects[2][3], null);
    assert.deepEqual(context.containers, [null]);
});

test('not-uncursed BUC keeps the source rn2(1), rn2(2) draw pair', () => {
    const { room, state } = roomState();
    const logged = loggingGenerationRandom();

    lspo_object({
        id: GOLD_PIECE,
        buc: 'not-uncursed',
        coordinate: { x: 0, y: 0 },
    }, room, { state, random: logged.random });

    assert.deepEqual(
        logged.calls.filter(([name]) => name === 'rn2'),
        [['rn2', 1], ['rn2', 2]],
    );
});

test('exact quantities create one mergeable stack or repeated objects', () => {
    const mergeableSetup = roomState();
    const mergeableRandom = loggingGenerationRandom({
        rn2(bound) {
            if (bound === 6) return 1;
            return quietGenerationRandom().rn2(bound);
        },
    });
    const apples = lspo_object({
        id: APPLE,
        quantity: 3,
        coordinate: { x: 0, y: 0 },
    }, mergeableSetup.room, {
        state: mergeableSetup.state,
        random: mergeableRandom.random,
    });
    assert.equal(apples.o_id, 2);
    assert.equal(apples.quan, 3);
    assert.equal(apples.owt, 6);
    assert.equal(mergeableSetup.level.objlist, apples);
    assert.equal(mergeableSetup.level.objects[2][3], apples);
    assert.equal(mergeableSetup.state.context.ident, 3);
    assert.deepEqual(mergeableRandom.calls, [
        ['rnd', 2],
        ['rn2', 6],
    ]);

    const repeatedSetup = roomState();
    const repeatedRandom = loggingGenerationRandom({
        rn2(bound) {
            if (bound === 5) return 0;
            if (bound === 6) return 0;
            return quietGenerationRandom().rn2(bound);
        },
    });
    const lastChest = lspo_object({
        id: CHEST,
        quantity: 3,
        coordinate: { x: 0, y: 0 },
    }, repeatedSetup.room, {
        state: repeatedSetup.state,
        random: repeatedRandom.random,
    });
    assert.equal(lastChest.o_id, 4);
    assert.equal(repeatedSetup.state.context.ident, 5);
    const floorIds = [];
    for (let obj = repeatedSetup.level.objects[2][3];
        obj;
        obj = obj.nexthere) {
        floorIds.push(obj.o_id);
        assert.equal(obj.quan, 1);
        assert.equal(obj.where, OBJ_FLOOR);
    }
    const listIds = [];
    for (let obj = repeatedSetup.level.objlist; obj; obj = obj.nobj)
        listIds.push(obj.o_id);
    assert.deepEqual(floorIds, [4, 3, 2]);
    assert.deepEqual(listIds, [4, 3, 2]);
    assert.deepEqual(repeatedRandom.calls, [
        ['rnd', 2], ['rn2', 5], ['rn2', 10], ['rn2', 6],
        ['rnd', 2], ['rn2', 5], ['rn2', 10], ['rn2', 6],
        ['rnd', 2], ['rn2', 5], ['rn2', 10], ['rn2', 6],
    ]);
});

test('special-object stacking uses the default floor extraction integration', () => {
    const { level, room, state } = roomState();
    const logged = loggingGenerationRandom({
        rn2(bound) {
            if (bound === 6) return 1;
            return quietGenerationRandom().rn2(bound);
        },
    });
    const first = lspo_object({
        id: APPLE,
        quantity: 1,
        coordinate: { x: 0, y: 0 },
    }, room, { state, random: logged.random });
    const second = lspo_object({
        id: APPLE,
        quantity: 1,
        coordinate: { x: 0, y: 0 },
    }, room, { state, random: logged.random });

    assert.equal(second.o_id, 3);
    assert.equal(second.quan, 2);
    assert.equal(second.owt, 4);
    assert.equal(first.where, OBJ_DELETED);
    assert.equal(first.nobj, null);
    assert.equal(first.nexthere, null);
    assert.equal(level.objlist, second);
    assert.equal(level.objects[2][3], second);
    assert.equal(second.nobj, null);
    assert.equal(second.nexthere, null);
    assert.deepEqual(logged.calls, [
        ['rnd', 2], ['rn2', 6],
        ['rnd', 2], ['rn2', 6],
    ]);
});

test('achievement prizes register identity and resist pre-pickup stacking', () => {
    const mines = roomState();
    mines.state.mineend_level = { ...mines.state.u.uz };
    const ordinary = lspo_object({
        id: LUCKSTONE,
        quantity: 1,
        buc: 'uncursed',
        coordinate: { x: 0, y: 0 },
    }, mines.room, {
        state: mines.state,
        random: quietGenerationRandom(),
    });
    const prize = lspo_object({
        id: LUCKSTONE,
        quantity: 1,
        buc: 'uncursed',
        achievement: true,
        coordinate: { x: 0, y: 0 },
    }, mines.room, {
        state: mines.state,
        random: quietGenerationRandom(),
    });
    assert.equal(mines.state.context.achieveo.mines_prize_oid, prize.o_id);
    assert.equal(mines.state.context.achieveo.mines_prize_otyp, LUCKSTONE);
    assert.equal(prize.nomerge, true);
    assert.equal(prize.quan, 1);
    assert.equal(ordinary.quan, 1);
    assert.equal(mines.level.objects[2][3], prize);
    assert.equal(prize.nexthere, ordinary);

    const sokoban = roomState();
    sokoban.state.sokoend_level = { ...sokoban.state.u.uz };
    const sokoPrize = lspo_object({
        id: BAG_OF_HOLDING,
        achievement: true,
        coordinate: { x: 0, y: 0 },
    }, sokoban.room, {
        state: sokoban.state,
        random: quietGenerationRandom(),
    });
    assert.equal(
        sokoban.state.context.achieveo.soko_prize_oid,
        sokoPrize.o_id,
    );
    assert.equal(
        sokoban.state.context.achieveo.soko_prize_otyp,
        BAG_OF_HOLDING,
    );
    assert.equal(sokoPrize.nomerge, true);
});

test('achievement duplicates preserve source warning and unknowns stay typed', () => {
    const duplicate = roomState();
    duplicate.state.mineend_level = { ...duplicate.state.u.uz };
    const messages = [];
    const first = lspo_object({
        id: LUCKSTONE,
        achievement: true,
        coordinate: { x: 0, y: 0 },
    }, duplicate.room, {
        state: duplicate.state,
        random: quietGenerationRandom(),
        hooks: { impossible: (message) => messages.push(message) },
    });
    const second = lspo_object({
        id: LUCKSTONE,
        achievement: true,
        coordinate: { x: 1, y: 0 },
    }, duplicate.room, {
        state: duplicate.state,
        random: quietGenerationRandom(),
        hooks: { impossible: (message) => messages.push(message) },
    });
    assert.equal(duplicate.state.context.achieveo.mines_prize_oid, first.o_id);
    assert.equal(second.nomerge, false);
    assert.deepEqual(messages, ['multiple prizes on mines end level']);

    const unknown = roomState();
    const unknownMessages = [];
    lspo_object({
        id: CHEST,
        achievement: true,
        coordinate: { x: 0, y: 0 },
    }, unknown.room, {
        state: unknown.state,
        random: quietGenerationRandom(),
        hooks: {
            impossible: (message) => unknownMessages.push(message),
        },
    });
    assert.deepEqual(unknownMessages, [
        `create_object: unknown achievement object ${CHEST}`,
    ]);

    const testing = roomState();
    testing.state.iflags = { lua_testing: true };
    lspo_object({
        id: CHEST,
        achievement: true,
        coordinate: { x: 0, y: 0 },
    }, testing.room, {
        state: testing.state,
        random: quietGenerationRandom(),
        hooks: {
            impossible() {
                throw new Error('lua testing should suppress this warning');
            },
        },
    });
});

test('direct monster inventory preserves pickup and stacking source order', () => {
    const floorMerge = roomState();
    const monster = carrier(floorMerge.state, PM_OGRE);
    const floorApple = lspo_object({
        id: APPLE,
        quantity: 1,
        coordinate: { x: 0, y: 0 },
    }, floorMerge.room, {
        state: floorMerge.state,
        random: quietGenerationRandom(),
    });
    const context = new_sp_lev_object_context();
    context.inventCarryingMonster = monster;
    const carriedApple = lspo_object({
        id: APPLE,
        quantity: 1,
        coordinate: { x: 0, y: 0 },
    }, floorMerge.room, {
        state: floorMerge.state,
        random: quietGenerationRandom(),
        spObjectContext: context,
    });
    assert.equal(carriedApple.where, OBJ_MINVENT);
    assert.equal(carriedApple.ocarry, monster);
    assert.equal(carriedApple.quan, 2);
    assert.equal(monster.minvent, carriedApple);
    assert.equal(floorApple.where, OBJ_DELETED);
    assert.equal(floorMerge.level.objlist, null);
    assert.equal(floorMerge.level.objects[2][3], null);

    const inventoryMerge = roomState();
    const secondMonster = carrier(inventoryMerge.state, PM_OGRE);
    const secondContext = new_sp_lev_object_context();
    secondContext.inventCarryingMonster = secondMonster;
    const existing = lspo_object({
        id: APPLE,
        quantity: 1,
        coordinate: { x: 0, y: 0 },
    }, inventoryMerge.room, {
        state: inventoryMerge.state,
        random: quietGenerationRandom(),
        spObjectContext: secondContext,
    });
    const mergedIncoming = lspo_object({
        id: APPLE,
        quantity: 1,
        coordinate: { x: 1, y: 0 },
    }, inventoryMerge.room, {
        state: inventoryMerge.state,
        random: quietGenerationRandom(),
        spObjectContext: secondContext,
    });
    assert.equal(existing.quan, 2);
    assert.equal(secondMonster.minvent, existing);
    assert.equal(mergedIncoming.where, OBJ_DELETED);
    assert.notEqual(mergedIncoming, existing);
    assert.equal(inventoryMerge.level.objlist, null);
});

test('direct monster pickup clears ownership and unseen object knowledge', () => {
    const cases = [
        { name: 'unseen during mklev', forgotten: true },
        {
            name: 'visible carrier',
            canSeeMonster: () => true,
            visibilityCalls: 1,
            forgotten: false,
        },
        { name: 'tame carrier', tame: true, shortCircuits: true, forgotten: false },
        {
            name: 'held carrier',
            stuck: true,
            canSeeMonster: () => false,
            visibilityCalls: 1,
            forgotten: false,
        },
    ];
    for (const scenario of cases) {
        const setup = roomState();
        const monster = carrier(setup.state, PM_OGRE);
        monster.mtame = Boolean(scenario.tame);
        if (scenario.stuck) setup.state.u.ustuck = monster;
        const context = new_sp_lev_object_context();
        context.inventCarryingMonster = monster;
        let visibilityCalls = 0;
        const hooks = {
            nameObject(obj) {
                Object.assign(obj, {
                    no_charge: true,
                    known: true,
                    dknown: true,
                    bknown: true,
                    rknown: true,
                    cknown: true,
                    lknown: true,
                    tknown: true,
                });
                return obj;
            },
        };
        if (scenario.shortCircuits) {
            hooks.canSeeMonster = () => {
                throw new Error(`${scenario.name} should bypass visibility`);
            };
        } else if (scenario.canSeeMonster) {
            hooks.canSeeMonster = (...args) => {
                ++visibilityCalls;
                return scenario.canSeeMonster(...args);
            };
        }

        const obj = lspo_object({
            id: ELVEN_BROADSWORD,
            name: scenario.name,
            coordinate: { x: 0, y: 0 },
        }, setup.room, {
            state: setup.state,
            random: quietGenerationRandom(),
            hooks,
            spObjectContext: context,
        });

        assert.equal(obj.no_charge, false, scenario.name);
        assert.equal(
            visibilityCalls,
            scenario.visibilityCalls ?? 0,
            scenario.name,
        );
        const knowledge = [
            obj.known,
            obj.dknown,
            obj.bknown,
            obj.rknown,
            obj.cknown,
            obj.lknown,
            obj.tknown,
        ];
        assert.deepEqual(
            knowledge,
            Array(knowledge.length).fill(!scenario.forgotten),
            scenario.name,
        );
    }
});

test('containers and tombstones take precedence over an active carrier', () => {
    const live = roomState();
    const monster = carrier(live.state, PM_OGRE);
    const context = new_sp_lev_object_context();
    context.inventCarryingMonster = monster;
    const chest = create_object({
        id: CHEST,
        coordinate: { x: 0, y: 0 },
        contents() {},
    }, live.room, {
        state: live.state,
        random: quietGenerationRandom(),
        spObjectContext: context,
    });
    const saddle = lspo_object({
        id: SADDLE,
        coordinate: { x: 1, y: 0 },
    }, live.room, {
        state: live.state,
        random: quietGenerationRandom(),
        spObjectContext: context,
    });
    assert.equal(chest.where, OBJ_MINVENT);
    assert.equal(monster.minvent, chest);
    assert.equal(saddle.where, OBJ_CONTAINED);
    assert.equal(saddle.ocontainer, chest);
    assert.equal(saddle.owornmask & W_SADDLE, 0);
    assert.equal(context.containers.at(-1), chest);

    const dead = roomState();
    const deadMonster = carrier(dead.state, PM_OGRE);
    const deadContext = new_sp_lev_object_context();
    deadContext.inventCarryingMonster = deadMonster;
    deadContext.containers.push(null);
    const result = lspo_object({
        id: APPLE,
        coordinate: { x: 0, y: 0 },
    }, dead.room, {
        state: dead.state,
        random: quietGenerationRandom(),
        spObjectContext: deadContext,
    });
    assert.equal(result, null);
    assert.equal(deadMonster.minvent, null);
    assert.deepEqual(deadContext.containers, [null]);
    assert.equal(dead.level.objlist, null);
});

test('direct saddles use can_saddle while other monsters carry them normally', () => {
    const horseSetup = roomState();
    horseSetup.state.in_mklev = false;
    const warhorse = carrier(horseSetup.state, PM_WARHORSE, 77);
    horseSetup.state.u.ustuck = warhorse;
    const horseContext = new_sp_lev_object_context();
    horseContext.inventCarryingMonster = warhorse;
    let visibilityCalls = 0;
    const wornSaddle = lspo_object({
        id: SADDLE,
        name: 'held saddle',
        coordinate: { x: 0, y: 0 },
    }, horseSetup.room, {
        state: horseSetup.state,
        random: quietGenerationRandom(),
        hooks: {
            canSeeMonster() {
                ++visibilityCalls;
                return false;
            },
            nameObject(obj) {
                Object.assign(obj, {
                    known: true,
                    dknown: true,
                    bknown: true,
                    rknown: true,
                    cknown: true,
                    lknown: true,
                    tknown: true,
                });
                return obj;
            },
        },
        spObjectContext: horseContext,
    });
    assert.equal(visibilityCalls, 1);
    assert.equal(wornSaddle.where, OBJ_MINVENT);
    assert.equal(warhorse.minvent, wornSaddle);
    assert.equal(wornSaddle.owornmask, W_SADDLE);
    assert.equal(wornSaddle.leashmon, warhorse.m_id);
    assert.equal(warhorse.misc_worn_check & W_SADDLE, W_SADDLE);
    assert.deepEqual([
        wornSaddle.known,
        wornSaddle.dknown,
        wornSaddle.bknown,
        wornSaddle.rknown,
        wornSaddle.cknown,
        wornSaddle.lknown,
        wornSaddle.tknown,
    ], Array(7).fill(true));

    const unseenSetup = roomState();
    unseenSetup.state.in_mklev = false;
    const unseenHorse = carrier(unseenSetup.state, PM_WARHORSE, 78);
    const unseenContext = new_sp_lev_object_context();
    unseenContext.inventCarryingMonster = unseenHorse;
    const unseenSaddle = lspo_object({
        id: SADDLE,
        name: 'unseen saddle',
        coordinate: { x: 0, y: 0 },
    }, unseenSetup.room, {
        state: unseenSetup.state,
        random: quietGenerationRandom(),
        hooks: {
            canSeeMonster: () => false,
            nameObject(obj) {
                Object.assign(obj, {
                    known: true,
                    dknown: true,
                    bknown: true,
                    rknown: true,
                    cknown: true,
                    lknown: true,
                    tknown: true,
                });
                return obj;
            },
        },
        spObjectContext: unseenContext,
    });
    assert.deepEqual([
        unseenSaddle.known,
        unseenSaddle.dknown,
        unseenSaddle.bknown,
        unseenSaddle.rknown,
        unseenSaddle.cknown,
        unseenSaddle.lknown,
        unseenSaddle.tknown,
    ], [true, false, false, false, false, false, false]);

    const tameSetup = roomState();
    tameSetup.state.in_mklev = false;
    const tameHorse = carrier(tameSetup.state, PM_WARHORSE, 79);
    tameHorse.mtame = true;
    const tameContext = new_sp_lev_object_context();
    tameContext.inventCarryingMonster = tameHorse;
    const tameSaddle = lspo_object({
        id: SADDLE,
        coordinate: { x: 0, y: 0 },
    }, tameSetup.room, {
        state: tameSetup.state,
        random: quietGenerationRandom(),
        spObjectContext: tameContext,
    });
    assert.equal(tameSaddle.where, OBJ_MINVENT);

    const saddledSetup = roomState();
    const saddledHorse = carrier(saddledSetup.state, PM_WARHORSE, 80);
    const saddledContext = new_sp_lev_object_context();
    saddledContext.inventCarryingMonster = saddledHorse;
    const existingSaddle = lspo_object({
        id: SADDLE,
        coordinate: { x: 0, y: 0 },
    }, saddledSetup.room, {
        state: saddledSetup.state,
        random: quietGenerationRandom(),
        spObjectContext: saddledContext,
    });
    saddledSetup.state.in_mklev = false;
    let impossibleCalls = 0;
    const rejectedSaddle = lspo_object({
        id: SADDLE,
        coordinate: { x: 1, y: 0 },
    }, saddledSetup.room, {
        state: saddledSetup.state,
        random: quietGenerationRandom(),
        hooks: {
            impossible(message) {
                ++impossibleCalls;
                assert.equal(
                    message,
                    'put_saddle_on_mon: saddle obj could get orphaned',
                );
            },
        },
        spObjectContext: saddledContext,
    });
    assert.equal(impossibleCalls, 1);
    assert.equal(saddledHorse.minvent, existingSaddle);
    assert.equal(existingSaddle.owornmask, W_SADDLE);
    assert.equal(rejectedSaddle.where, OBJ_FREE);

    const unsupportedSetup = roomState();
    unsupportedSetup.state.in_mklev = false;
    const unsupportedHorse = carrier(
        unsupportedSetup.state,
        PM_WARHORSE,
        81,
    );
    const unsupportedContext = new_sp_lev_object_context();
    unsupportedContext.inventCarryingMonster = unsupportedHorse;
    assert.throws(
        () => lspo_object({
            id: SADDLE,
            coordinate: { x: 0, y: 0 },
        }, unsupportedSetup.room, {
            state: unsupportedSetup.state,
            random: quietGenerationRandom(),
            spObjectContext: unsupportedContext,
        }),
        (error) => error instanceof UnsupportedSpecialObjectError
            && error.operation === 'monster visibility for custom inventory',
    );
    const unsupportedSaddle = unsupportedSetup.level.objects[2][3];
    assert.equal(unsupportedSaddle.where, OBJ_FLOOR);
    assert.equal(unsupportedSetup.level.objlist, unsupportedSaddle);
    assert.equal(unsupportedHorse.minvent, null);

    const ogreSetup = roomState();
    const ogre = carrier(ogreSetup.state, PM_OGRE);
    const ogreContext = new_sp_lev_object_context();
    ogreContext.inventCarryingMonster = ogre;
    const carriedSaddle = lspo_object({
        id: SADDLE,
        coordinate: { x: 0, y: 0 },
    }, ogreSetup.room, {
        state: ogreSetup.state,
        random: quietGenerationRandom(),
        spObjectContext: ogreContext,
    });
    assert.equal(carriedSaddle.where, OBJ_MINVENT);
    assert.equal(ogre.minvent, carriedSaddle);
    assert.equal(carriedSaddle.owornmask, 0);
    assert.equal(ogre.misc_worn_check & W_SADDLE, 0);
});

test('direct carried burial and figurine timers retain their source boundaries', () => {
    const buriedSetup = roomState();
    const monster = carrier(buriedSetup.state, PM_OGRE);
    const context = new_sp_lev_object_context();
    context.inventCarryingMonster = monster;
    const buried = lspo_object({
        id: CHEST,
        buried: true,
        coordinate: { x: 0, y: 0 },
    }, buriedSetup.room, {
        state: buriedSetup.state,
        random: quietGenerationRandom(),
        spObjectContext: context,
    });
    assert.equal(monster.minvent, null);
    assert.equal(buried.where, OBJ_BURIED);
    assert.equal(buriedSetup.level.buriedobjlist, buried);

    const figurineSetup = roomState();
    const figurineMonster = carrier(figurineSetup.state, PM_OGRE);
    const figurineContext = new_sp_lev_object_context();
    figurineContext.inventCarryingMonster = figurineMonster;
    const logged = loggingGenerationRandom();
    const figurine = lspo_object({
        id: FIGURINE,
        corpsenm: PM_OGRE,
        buc: 'cursed',
        coordinate: { x: 0, y: 0 },
    }, figurineSetup.room, {
        state: figurineSetup.state,
        random: logged.random,
        spObjectContext: figurineContext,
    });
    assert.equal(figurine.where, OBJ_MINVENT);
    assert.equal(figurine.timed, 1);
    assert.equal(
        logged.calls.filter(([name, bound]) => name === 'rnd' && bound === 9000)
            .length,
        1,
    );
});

test('buried container is finalized before its contents callback', () => {
    const { level, room, state } = roomState();
    const context = new_sp_lev_object_context();
    const random = quietGenerationRandom();
    let callbackChest = null;
    let child = null;

    const chest = lspo_object({
        id: CHEST,
        coordinate: { x: 0, y: 0 },
        buried: true,
        contents(current, env) {
            callbackChest = current;
            assert.equal(current.where, OBJ_BURIED);
            assert.equal(current.cobj, null);
            assert.equal(context.containers.at(-1), current);
            child = lspo_object({
                id: GOLD_PIECE,
                coordinate: { x: 1, y: 0 },
            }, room, env);
            assert.equal(level.objects[3][3], null);
            assert.equal(child.where, OBJ_CONTAINED);
            assert.equal(child.ocontainer, current);
        },
    }, room, { state, random, spObjectContext: context });

    assert.equal(callbackChest, chest);
    assert.equal(chest.where, OBJ_BURIED);
    assert.equal(level.buriedobjlist, chest);
    assert.equal(level.objects[2][3], null);
    assert.equal(level.objlist, null);
    assert.equal(chest.cobj, child);
    assert.ok(chest.owt > state.objects[CHEST].oc_weight);
    assert.deepEqual(context.containers, []);
});

test('generated chest contents are destroyed before the descriptor callback', () => {
    const { room, state } = roomState();
    const random = quietGenerationRandom();
    random.rn2 = (bound) => {
        // Keep the chest unlocked/untrapped, request one of its possible six
        // contents, and suppress unrelated rare erosion/grease branches.
        if (bound === 5) return 0;
        if (bound === 10) return 9;
        if (bound === 6) return 1;
        if (bound === 100) return 99;
        if (bound === 1000) return 999;
        return 0;
    };
    let generatedChild = null;
    let callbackChest = null;

    const chest = lspo_object({
        id: CHEST,
        coordinate: { x: 0, y: 0 },
        contents(current) {
            callbackChest = current;
            assert.equal(current.cobj, null);
            assert.equal(generatedChild.where, OBJ_DELETED);
        },
    }, room, {
        state,
        random,
        hooks: {
            populateContainer(box, count, env) {
                assert.equal(count, 1);
                generatedChild = mksobj(GOLD_PIECE, true, false, env);
                add_to_container(box, generatedChild, env);
            },
        },
    });

    assert.equal(callbackChest, chest);
    assert.equal(chest.cobj, null);
    assert.equal(generatedChild.where, OBJ_DELETED);
});

test('burial deallocation leaves a live tombstone for nested contents', () => {
    const { level, room, state } = roomState();
    state.mineend_level = { ...state.u.uz };
    const context = new_sp_lev_object_context();
    let buriedRock = null;
    let callbackObject = 'not called';
    let nestedObject = 'not called';

    const result = lspo_object({
        id: ROCK,
        name: 'marker',
        coordinate: { x: 0, y: 0 },
        buried: true,
        achievement: true,
        contents(current, env) {
            callbackObject = current;
            assert.equal(current, null);
            assert.equal(buriedRock.where, OBJ_DELETED);
            assert.deepEqual(context.containers, [null]);
            nestedObject = lspo_object({
                id: GOLD_PIECE,
                coordinate: { x: 1, y: 0 },
            }, room, env);
            assert.equal(nestedObject, null);
            assert.deepEqual(context.containers, [null]);
        },
    }, room, {
        state,
        random: quietGenerationRandom(),
        spObjectContext: context,
        hooks: {
            nameObject(obj) {
                buriedRock = obj;
                return obj;
            },
        },
    });

    assert.equal(result, null);
    assert.equal(callbackObject, null);
    assert.equal(buriedRock.where, OBJ_DELETED);
    assert.equal(
        state.context.achieveo.mines_prize_oid,
        buriedRock.o_id,
    );
    assert.equal(state.context.achieveo.mines_prize_otyp, ROCK);
    assert.equal(nestedObject, null);
    assert.deepEqual(context.containers, []);
    assert.equal(level.objlist, null);
    assert.equal(level.buriedobjlist, null);
    assert.equal(level.objects[2][3], null);
    assert.equal(level.objects[3][3], null);
});

test('maximum containment reports without pushing but still pops afterward', () => {
    const { room, state } = roomState();
    const context = new_sp_lev_object_context();
    const random = quietGenerationRandom();
    const chain = [];
    // sp_lev.c permits ten pushed containers; direct create_object() leaves
    // each descriptor's pop to this source-shaped caller.
    for (let depth = 0; depth < 10; ++depth) {
        chain.push(create_object({
            id: CHEST,
            coordinate: { x: 0, y: 0 },
            contents() {},
        }, room, { state, random, spObjectContext: context }));
    }
    assert.equal(context.containers.length, 10);
    assert.equal(context.containers.at(-1), chain[9]);
    const messages = [];
    let callbackDepth = 0;
    let callbackTop = null;

    const child = lspo_object({
        id: CHEST,
        coordinate: { x: 1, y: 0 },
        contents() {
            callbackDepth = context.containers.length;
            callbackTop = context.containers.at(-1);
        },
    }, room, {
        state,
        random,
        spObjectContext: context,
        hooks: {
            impossible(message) {
                messages.push(message);
            },
        },
    });

    assert.equal(callbackDepth, 10);
    assert.equal(callbackTop, chain[9]);
    assert.deepEqual(messages, [
        'create_object: too deeply nested containers.',
    ]);
    assert.equal(context.containers.length, 9);
    assert.equal(context.containers.at(-1), chain[8]);
    assert.equal(child.where, OBJ_CONTAINED);
    assert.equal(child.ocontainer, chain[9]);
    assert.equal(chain[9].cobj, child);
});

test('independent fills can interleave their container stacks', () => {
    const { room, state } = roomState();
    const random = quietGenerationRandom();
    const firstContext = new_sp_lev_object_context();
    const secondContext = new_sp_lev_object_context();
    const containerSpec = (x) => ({
        id: CHEST,
        coordinate: { x, y: 0 },
        contents() {},
    });

    const firstChest = create_object(containerSpec(0), room, {
        state,
        random,
        spObjectContext: firstContext,
    });
    const secondChest = create_object(containerSpec(1), room, {
        state,
        random,
        spObjectContext: secondContext,
    });
    assert.deepEqual(firstContext.containers, [firstChest]);
    assert.deepEqual(secondContext.containers, [secondChest]);

    const firstGold = lspo_object({
        id: GOLD_PIECE,
        coordinate: { x: 2, y: 0 },
    }, room, {
        state,
        random,
        spObjectContext: firstContext,
    });
    const secondGold = lspo_object({
        id: GOLD_PIECE,
        coordinate: { x: 2, y: 1 },
    }, room, {
        state,
        random,
        spObjectContext: secondContext,
    });

    assert.equal(firstGold.ocontainer, firstChest);
    assert.equal(secondGold.ocontainer, secondChest);
    assert.equal(firstChest.cobj, firstGold);
    assert.equal(secondChest.cobj, secondGold);
    assert.deepEqual(firstContext.containers, [firstChest]);
    assert.deepEqual(secondContext.containers, [secondChest]);
    firstContext.containers.pop();
    secondContext.containers.pop();
    assert.deepEqual(firstContext.containers, []);
    assert.deepEqual(secondContext.containers, []);
});

test('a throwing contents callback restores the scoped container stack', () => {
    const { level, room, state } = roomState();
    const context = new_sp_lev_object_context();
    const random = quietGenerationRandom();
    const marker = new Error('contents failed');

    assert.throws(
        () => lspo_object({
            id: CHEST,
            coordinate: { x: 0, y: 0 },
            contents() {
                throw marker;
            },
        }, room, { state, random, spObjectContext: context }),
        (error) => error === marker,
    );
    assert.deepEqual(context.containers, []);

    const gold = lspo_object({
        id: GOLD_PIECE,
        coordinate: { x: 1, y: 0 },
    }, room, { state, random, spObjectContext: context });
    assert.equal(gold.where, OBJ_FLOOR);
    assert.equal(level.objects[3][3], gold);
});

test('a post-push creation failure restores the scoped container stack', () => {
    const { level, room, state } = roomState();
    const context = new_sp_lev_object_context();
    const random = quietGenerationRandom();

    assert.throws(
        () => lspo_object({
            id: CHEST,
            coordinate: { x: 0, y: 0 },
            achievement: true,
            contents() {},
        }, room, {
            state,
            random,
            spObjectContext: context,
            hooks: {
                impossible() {
                    throw new Error('unknown achievement');
                },
            },
        }),
        /unknown achievement/,
    );
    assert.deepEqual(context.containers, []);

    const gold = lspo_object({
        id: GOLD_PIECE,
        coordinate: { x: 1, y: 0 },
    }, room, { state, random, spObjectContext: context });
    assert.equal(gold.where, OBJ_FLOOR);
    assert.equal(level.objects[3][3], gold);
});

test('a null parent skips later creation branches and pops on success', () => {
    const { level, room, state } = roomState();
    const context = new_sp_lev_object_context();
    context.containers.push(null);
    let callbackObject = 'not called';

    const result = lspo_object({
        id: CHEST,
        coordinate: { x: 0, y: 0 },
        achievement: true,
        contents(obj) {
            callbackObject = obj;
        },
    }, room, {
        state,
        random: quietGenerationRandom(),
        spObjectContext: context,
        hooks: {
            impossible() {
                throw new Error('achievement branch should be skipped');
            },
        },
    });

    assert.equal(result, null);
    assert.equal(callbackObject, null);
    assert.deepEqual(context.containers, []);
    assert.equal(level.objects[2][3], null);
    assert.equal(level.objlist, null);
});

test('exact troll corpses replace the generated timer, sex, and weight', () => {
    const { room, state } = roomState();
    const corpse = lspo_object({
        id: CORPSE,
        corpsenm: PM_TROLL,
        coordinate: { x: 0, y: 0 },
        buried: true,
    }, room, { state, random: quietGenerationRandom() });

    assert.equal(corpse.spe, 0);
    assert.equal(corpse.corpsenm, PM_TROLL);
    assert.equal(corpse.where, OBJ_BURIED);
    assert.equal(corpse.owt, weight(corpse, { state }));
    assert.equal(peek_timer(ROT_CORPSE, corpse, state), 0);
    // quietGenerationRandom accepts the first troll revival opportunity,
    // two turns after creation.  Timer 1 belonged to the generated species;
    // timer 2 survives, leaving 3 as the next timer id.
    assert.equal(peek_timer(REVIVE_MON, corpse, state), state.moves + 2);
    assert.equal(corpse.timed, 1);
    assert.equal(state.svt.timer_id, 3);
    assert.equal(state.gt.timer_base.tid, 2);
    assert.equal(state.gt.timer_base.func_index, REVIVE_MON);
    assert.equal(state.gt.timer_base.arg, corpse);
    assert.equal(state.gt.timer_base.next, null);
});
