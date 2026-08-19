import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COULD_SEE,
    DETECT_MONSTERS,
    IN_SIGHT,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_NOTHING,
    M_AP_OBJECT,
    MMOVE_MOVED,
    POOL,
    PROT_FROM_SHAPE_CHANGERS,
    ROOM,
} from '../js/const.js';
import {
    dog_eat,
    dog_nutrition,
    finish_meating,
    quickmimic,
} from '../js/dogmove.js';
import { GameMap } from '../js/game.js';
import { m_consume_obj } from '../js/mon.js';
import {
    MZ_GIGANTIC,
    MZ_HUGE,
    MZ_LARGE,
    MZ_MEDIUM,
    MZ_SMALL,
    MZ_TINY,
    PM_KITTEN,
    PM_GIANT_MIMIC,
    PM_LITTLE_DOG,
    PM_SMALL_MIMIC,
    monst_globals_init,
} from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { newObject, place_object } from '../js/obj.js';
import {
    CORPSE,
    FOOD_CLASS,
    objects_globals_init,
    TRIPE_RATION,
    WEAPON_CLASS,
} from '../js/objects.js';

function quickState(visible = true) {
    const level = new GameMap();
    level.at(5, 5).typ = ROOM;
    level.at(5, 5).remembered_glyph = { glyph: 101 };
    level.at(5, 5).disp_glyph = {
        attr: 0, ch: 'd', color: 7, dec: false,
        displayCh: null, displayColor: null,
    };
    const state = {
        context: { mon_moving: false },
        flags: {},
        invent: null,
        level,
        moves: 10,
        program_state: { gameover: false },
        u: {
            uprops: [],
            uroleplay: {},
            usteed: null,
            ux: 4,
            uy: 5,
        },
        viz_array: Array.from({ length: 21 }, () => Array(80).fill(0)),
    };
    if (visible) state.viz_array[5][5] = COULD_SEE | IN_SIGHT;
    monst_globals_init(state);
    objects_globals_init(state);
    init_objects(state, () => 0);
    const monster = {
        data: state.mons[PM_LITTLE_DOG],
        female: false,
        m_ap_type: M_AP_NOTHING,
        mappearance: 0,
        meating: 7,
        mextra: {
            edog: {
                apport: 5,
                dropdist: 1,
                droptime: 0,
                hungrytime: 0,
                mhpmax_penalty: 2,
            },
        },
        mconf: true,
        mflee: true,
        mfleetim: 4,
        mhp: 8,
        mhpmax: 8,
        minvis: false,
        mleashed: false,
        mtame: 10,
        mundetected: false,
        mx: 5,
        my: 5,
    };
    return { monster, state };
}

function floorMimicCorpse(state, corpsenm = PM_SMALL_MIMIC, overrides = {}) {
    const corpse = newObject({
        age: state.moves,
        corpsenm,
        o_id: 7001,
        oclass: FOOD_CLASS,
        oeaten: 0,
        otyp: CORPSE,
        owt: state.objects[CORPSE].oc_weight,
        quan: 1,
        ...overrides,
    });
    place_object(corpse, 5, 5, { state });
    return corpse;
}

function eatingEnv(state, messages = [], redraws = []) {
    return {
        state,
        random: { rn2: () => 0 },
        redraw(x, y) {
            redraws.push([x, y]);
            if (x === 5 && y === 5) {
                state.level.at(x, y).disp_glyph = {
                    attr: 0, ch: 'f', color: 7, dec: false,
                    displayCh: null, displayColor: null,
                };
            }
        },
        message: async (message) => messages.push(message),
        waitMap: async () => {},
    };
}

test('dog_nutrition scales a whole mimic corpse for every pet size', () => {
    const { monster, state } = quickState(false);
    const corpse = {
        corpsenm: PM_SMALL_MIMIC,
        oclass: FOOD_CLASS,
        oeaten: 0,
        otyp: CORPSE,
    };
    const cases = [
        [MZ_TINY, 1600],
        [MZ_SMALL, 1200],
        [MZ_MEDIUM, 1000],
        [MZ_LARGE, 800],
        [MZ_HUGE, 600],
        [MZ_GIGANTIC, 400],
    ];
    for (const [size, nutrition] of cases) {
        monster.data = { ...monster.data, msize: size };
        assert.equal(dog_nutrition(monster, corpse, state), nutrition);
        // dogmove.c:167: 3 + (300 >> 6).
        assert.equal(monster.meating, 7);
    }
});

test('dog_nutrition requires both the food class and corpse type', () => {
    const { monster, state } = quickState(false);
    const corpse = {
        corpsenm: PM_SMALL_MIMIC,
        oclass: FOOD_CLASS,
        oeaten: 0,
        otyp: CORPSE,
    };
    assert.throws(
        () => dog_nutrition(monster, { ...corpse, oclass: WEAPON_CLASS }, state),
        /requires a corpse/u,
    );
    assert.throws(
        () => dog_nutrition(monster, { ...corpse, otyp: TRIPE_RATION }, state),
        /requires a corpse/u,
    );
});

test('dog_eat consumes each admitted mimic corpse and updates its little dog',
    async () => {
        for (const corpsenm of [PM_SMALL_MIMIC, PM_GIANT_MIMIC]) {
            const { monster, state } = quickState(true);
            const corpse = floorMimicCorpse(state, corpsenm);
            const messages = [];
            const redraws = [];
            assert.equal(
                await dog_eat(
                    monster,
                    corpse,
                    4,
                    5,
                    false,
                    eatingEnv(state, messages, redraws),
                ),
                MMOVE_MOVED,
            );
            assert.equal(state.level.objects[5][5], null);
            assert.equal(monster.mconf, 0);
            assert.equal(monster.mhpmax, 10);
            assert.equal(monster.mextra.edog.mhpmax_penalty, 0);
            assert.equal(monster.mfleetim, 2);
            assert.equal(monster.mtame, 11);
            assert.equal(monster.m_ap_type, M_AP_MONSTER);
            assert.equal(monster.mappearance, PM_KITTEN);
            assert.deepEqual(redraws.slice(0, 2), [[4, 5], [5, 5]]);
            assert.equal(messages.length, 2);
            assert.match(messages[0], /^Your little dog eats /u);
        }
    });

test('dog_eat validates every excluded mimic-meal state before mutation',
    async () => {
        const cases = [
            ['missing pet state', ({ monster }) => {
                delete monster.mextra.edog;
            }, /starting little dog/u],
            ['wrong pet species', ({ monster, state }) => {
                monster.data = state.mons[PM_KITTEN];
            }, /starting little dog/u],
            ['wrong object type', ({ corpse }) => {
                corpse.otyp = TRIPE_RATION;
            }, /whole mimic corpse/u],
            ['wrong corpse species', ({ corpse }) => {
                corpse.corpsenm = PM_KITTEN;
            }, /whole mimic corpse/u],
            ['wrong object class', ({ corpse }) => {
                corpse.oclass = WEAPON_CLASS;
            }, /whole mimic corpse/u],
            ['partly eaten corpse', ({ corpse }) => {
                corpse.oeaten = 1;
            }, /whole mimic corpse/u],
            ['stacked corpse', ({ corpse }) => {
                corpse.quan = 2;
            }, /ordinary floor corpse/u],
            ['unpaid corpse', ({ corpse }) => {
                corpse.unpaid = true;
            }, /ordinary floor corpse/u],
            ['artifact corpse', ({ corpse }) => {
                corpse.oartifact = 1;
            }, /ordinary floor corpse/u],
            ['corpse with contents', ({ corpse }) => {
                corpse.cobj = {};
            }, /ordinary floor corpse/u],
            ['devoured meal', ({ call }) => {
                call.devour = true;
            }, /ordinary eat path/u],
            ['pet over a pool', ({ state }) => {
                state.level.at(5, 5).typ = POOL;
            }, /dry eating square/u],
        ];
        for (const [name, mutate, reason] of cases) {
            const { monster, state } = quickState(false);
            const corpse = floorMimicCorpse(state);
            const call = { devour: false };
            mutate({ call, corpse, monster, state });
            const before = {
                hungrytime: monster.mextra?.edog?.hungrytime,
                meating: monster.meating,
                mtame: monster.mtame,
                where: corpse.where,
            };
            await assert.rejects(
                dog_eat(monster, corpse, 5, 5, call.devour,
                    eatingEnv(state)),
                reason,
                name,
            );
            assert.deepEqual({
                hungrytime: monster.mextra?.edog?.hungrytime,
                meating: monster.meating,
                mtame: monster.mtame,
                where: corpse.where,
            }, before, name);
        }
    });

test('dog_eat preserves source boundary values for fleeing and tameness',
    async () => {
        const cases = [
            ['not fleeing', false, 2, 2, 10, 11],
            ['one flee turn', true, 1, 1, 10, 11],
            ['maximum tameness', true, 4, 2, 20, 20],
        ];
        for (const [name, fleeing, timer, expectedTimer, tame, expectedTame]
            of cases) {
            const { monster, state } = quickState(false);
            monster.mflee = fleeing;
            monster.mfleetim = timer;
            monster.mtame = tame;
            const corpse = floorMimicCorpse(state);
            await dog_eat(monster, corpse, 5, 5, false, eatingEnv(state));
            assert.equal(monster.mfleetim, expectedTimer, `${name}: flee`);
            assert.equal(monster.mtame, expectedTame, `${name}: tame`);
        }
    });

test('dog_eat prints no meal line for a pet sensed outside line of sight',
    async () => {
        const { monster, state } = quickState(false);
        state.u.uprops[DETECT_MONSTERS] = { intrinsic: 1 };
        const corpse = floorMimicCorpse(state);
        const messages = [];
        await dog_eat(
            monster,
            corpse,
            4,
            5,
            false,
            eatingEnv(state, messages),
        );
        assert.equal(messages.length, 1);
        assert.match(messages[0], /feels rather kitten-ish/u);
    });

test('m_consume_obj rejects non-corpses and both punishment objects',
    async () => {
        const cases = [
            ['wrong object type', ({ corpse }) => {
                corpse.otyp = TRIPE_RATION;
            }, /mimic corpse/u],
            ['punishment ball', ({ corpse, state }) => {
                state.uball = corpse;
            }, /unpunished corpse/u],
            ['punishment chain', ({ corpse, state }) => {
                state.uchain = corpse;
            }, /unpunished corpse/u],
        ];
        for (const [name, mutate, reason] of cases) {
            const { monster, state } = quickState(false);
            const corpse = floorMimicCorpse(state);
            mutate({ corpse, state });
            await assert.rejects(
                m_consume_obj(monster, corpse, {
                    ...eatingEnv(state),
                    quickMimic: async () => assert.fail(name),
                }),
                reason,
                name,
            );
            assert.equal(state.level.objects[5][5], corpse, name);
        }
    });

test('quickmimic turns a visible little dog into a kitten appearance',
    async () => {
        const { monster, state } = quickState(true);
        const draws = [];
        const messages = [];
        let waits = 0;
        await quickmimic(monster, {
            state,
            random: {
                rn2(bound) {
                    draws.push(bound);
                    return 0; // qm[0], little dog -> kitten
                },
            },
            redraw(x, y) {
                assert.deepEqual([x, y], [5, 5]);
                state.level.at(x, y).disp_glyph = {
                    attr: 0, ch: 'f', color: 7, dec: false,
                    displayCh: null, displayColor: null,
                };
            },
            message: async (message) => messages.push(message),
            waitMap: async () => { ++waits; },
        });

        assert.deepEqual(draws, [9]);
        assert.equal(monster.m_ap_type, M_AP_MONSTER);
        assert.equal(monster.mappearance, PM_KITTEN);
        assert.deepEqual(messages, [
            'You see a kitten appear where your little dog was!',
        ]);
        assert.equal(waits, 1);
    });

test('quickmimic retries five misses and falls back to tripe', async () => {
    const { monster, state } = quickState(false);
    const draws = [1, 2, 3, 4, 5];
    await quickmimic(monster, {
        state,
        random: { rn2: () => draws.shift() },
    });
    assert.deepEqual(draws, []);
    assert.equal(monster.m_ap_type, M_AP_OBJECT);
    assert.equal(monster.mappearance, TRIPE_RATION);
});

test('quickmimic rejects a dog-only furniture choice for a kitten',
    async () => {
        const { monster, state } = quickState(false);
        monster.data = state.mons[PM_KITTEN];
        const draws = [7, 3];
        await quickmimic(monster, {
            state,
            random: { rn2: () => draws.shift() },
        });
        assert.deepEqual(draws, []);
        assert.equal(monster.m_ap_type, M_AP_MONSTER);
        assert.equal(monster.mappearance, PM_LITTLE_DOG);
    });

test('quickmimic accepts its dog-only furniture choice for a little dog',
    async () => {
        const { monster, state } = quickState(false);
        const draws = [7, 8];
        await quickmimic(monster, {
            state,
            random: { rn2: () => draws.shift() },
        });
        assert.deepEqual(draws, [8]);
        assert.equal(monster.m_ap_type, M_AP_FURNITURE);
    });

test('quickmimic announces a visible square even when the pet is invisible',
    async () => {
        const { monster, state } = quickState(true);
        monster.minvis = true;
        const messages = [];
        await quickmimic(monster, {
            state,
            random: { rn2: () => 0 },
            redraw(x, y) {
                state.level.at(x, y).disp_glyph = {
                    attr: 0, ch: 'f', color: 7, dec: false,
                    displayCh: null, displayColor: null,
                };
            },
            message: async (message) => messages.push(message),
            waitMap: async () => {},
        });
        assert.equal(messages.length, 1);
    });

test('quickmimic compares a newly drawn glyph with an empty prior buffer',
    async () => {
        const { monster, state } = quickState(true);
        state.level.at(5, 5).disp_glyph = null;
        const messages = [];
        await quickmimic(monster, {
            state,
            random: { rn2: () => 0 },
            redraw(x, y) {
                state.level.at(x, y).disp_glyph = {
                    attr: 0, ch: 'f', color: 7, dec: false,
                    displayCh: null, displayColor: null,
                };
            },
            message: async (message) => messages.push(message),
            waitMap: async () => {},
        });
        assert.equal(messages.length, 1);
    });

test('shape-change protection suppresses quickmimic before its draw',
    async () => {
        const { monster, state } = quickState(false);
        state.u.uprops[PROT_FROM_SHAPE_CHANGERS] = { intrinsic: 1 };
        await quickmimic(monster, {
            state,
            random: { rn2: () => assert.fail('protected pet drew') },
        });
        assert.equal(monster.m_ap_type, M_AP_NOTHING);
        assert.equal(monster.mappearance, 0);
    });

test('finish_meating clears a non-mimic pet disguise through its redraw seam',
    () => {
        const { monster, state } = quickState(false);
        monster.m_ap_type = M_AP_MONSTER;
        monster.mappearance = PM_KITTEN;
        const redraws = [];
        finish_meating(monster, {
            state,
            redraw: (x, y) => redraws.push([x, y]),
        });
        assert.equal(monster.meating, 0);
        assert.equal(monster.m_ap_type, M_AP_NOTHING);
        assert.equal(monster.mappearance, 0);
        assert.deepEqual(redraws, [[5, 5]]);
    });
