import assert from 'node:assert/strict';
import test from 'node:test';

import {
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_DELETED,
    OBJ_FLOOR,
    REVIVE_MON,
    ROT_CORPSE,
    ROOM,
    ROOMOFFSET,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { add_to_container } from '../js/invent.js';
import { init_objects } from '../js/o_init.js';
import { mksobj, weight } from '../js/obj.js';
import {
    CHEST,
    CORPSE,
    GOLD_PIECE,
    ROCK,
    SPBOOK_CLASS,
    SPE_NOVEL,
    STATUE,
    objects_globals_init,
} from '../js/objects.js';
import {
    PM_TROLL,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
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
        context: { ident: 2 },
        in_mklev: true,
        level,
        moves: 7,
    };
    objects_globals_init(state);
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
    const context = new_sp_lev_object_context();
    let buriedRock = null;
    let callbackObject = 'not called';
    let nestedObject = 'not called';

    const result = lspo_object({
        id: ROCK,
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
            recordAchievementObject(obj) {
                buriedRock = obj;
            },
        },
    });

    assert.equal(result, null);
    assert.equal(callbackObject, null);
    assert.equal(buriedRock.where, OBJ_DELETED);
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
        }, room, { state, random, spObjectContext: context }),
        /achievement-object creation/,
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
            recordAchievementObject() {
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
