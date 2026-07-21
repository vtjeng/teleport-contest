import assert from 'node:assert/strict';
import test from 'node:test';

import {
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    ROT_CORPSE,
    ROOM,
    ROOMOFFSET,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import {
    CHEST,
    CORPSE,
    GOLD_PIECE,
    objects_globals_init,
} from '../js/objects.js';
import {
    PM_KOBOLD,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
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

test('exact corpses clear generated sex before replacing species and burial', () => {
    const { room, state } = roomState();
    const corpse = lspo_object({
        id: CORPSE,
        corpsenm: PM_KOBOLD,
        coordinate: { x: 0, y: 0 },
        buried: true,
    }, room, { state, random: quietGenerationRandom() });

    assert.equal(corpse.spe, 0);
    assert.equal(corpse.corpsenm, PM_KOBOLD);
    assert.equal(corpse.where, OBJ_BURIED);
    assert.ok(peek_timer(ROT_CORPSE, corpse, state) > 0);
});
