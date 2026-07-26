import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACCFOOD,
    CADAVER,
    MANFOOD,
    MMOVE_DIED,
    MMOVE_MOVED,
    MMOVE_NOTHING,
} from '../js/const.js';
import { dog_invent } from '../js/dogmove.js';
import { GameMap } from '../js/game.js';
import {
    BALL_CLASS,
    CHAIN_CLASS,
    FOOD_CLASS,
    ROCK_CLASS,
    SCR_MAIL,
} from '../js/objects.js';

const HERO_DISTANCE = 4; // A nonzero distu() result for an ordinary pet.
const PET_APPORT = 5; // High enough to exercise both apport-based draws.
const PET_X = 5; // An ordinary room coordinate away from map edges.
const PET_Y = 5; // An ordinary room coordinate away from map edges.
const DUMMY_OBJECT_TYPE = 1; // A non-mail type for decision-only objects.

function inventoryState() {
    const level = new GameMap();
    const state = {
        context: {
            achieveo: {
                mines_prize_oid: 0,
                soko_prize_oid: 0,
            },
        },
        level,
        moves: 17, // Distinct from the initial turn for droptime checks.
    };
    const monster = {
        data: {},
        mcanmove: true,
        meating: 0,
        minvent: null,
        msleeping: false,
        mx: PET_X,
        my: PET_Y,
    };
    const edog = {
        apport: PET_APPORT,
        dropdist: 0,
        droptime: 0,
        mhpmax_penalty: 0,
    };
    return { state, monster, edog };
}

function floorObject(state, overrides = {}) {
    const obj = {
        cursed: false,
        nexthere: null,
        o_id: 101, // A live non-prize object id.
        oclass: FOOD_CLASS,
        ox: PET_X,
        oy: PET_Y,
        otyp: DUMMY_OBJECT_TYPE,
        quan: 1,
        ...overrides,
    };
    state.level.objects[PET_X][PET_Y] = obj;
    return obj;
}

function noFloorActionEnv(state, overrides = {}) {
    return {
        canCarry: () => 0,
        couldReachItem: () => true,
        dogfood: () => MANFOOD,
        droppables: () => null,
        random: {
            rn2: () => 1,
        },
        state,
        ...overrides,
    };
}

test('dog_invent stops before callbacks for helpless or eating pets', async () => {
    for (const field of ['msleeping', 'mcanmove', 'meating']) {
        const { state, monster, edog } = inventoryState();
        monster[field] = field === 'mcanmove'
            ? false
            : 1; // One is enough for either sleeping or eating.
        let inspected = false;
        const result = await dog_invent(
            monster,
            edog,
            HERO_DISTANCE,
            {
                droppables: () => {
                    inspected = true;
                    return null;
                },
                state,
            },
        );
        assert.equal(result, MMOVE_NOTHING);
        assert.equal(inspected, false);
    }
});

test('dog_invent preserves drop draw short-circuit order and state', async () => {
    const { state, monster, edog } = inventoryState();
    const bounds = [];
    const values = [
        0, // The first zero-test succeeds and skips rn2(apport).
        PET_APPORT - 1, // The final draw remains below apport and drops.
    ];
    let drops = 0;
    const result = await dog_invent(
        monster,
        edog,
        HERO_DISTANCE,
        {
            dropInventory: async () => {
                drops++;
            },
            droppables: () => ({ otyp: DUMMY_OBJECT_TYPE }),
            random: {
                rn2(bound) {
                    bounds.push(bound);
                    return values.shift();
                },
            },
            state,
        },
    );

    assert.equal(result, MMOVE_NOTHING);
    assert.deepEqual(bounds, [
        HERO_DISTANCE + 1,
        10, // The final drop-probability bound.
    ]);
    assert.equal(drops, 1);
    assert.equal(edog.apport, PET_APPORT - 1);
    assert.equal(edog.dropdist, HERO_DISTANCE);
    assert.equal(edog.droptime, state.moves);
});

test('dog_invent omits the final drop draw when both gates miss', async () => {
    const { state, monster, edog } = inventoryState();
    const bounds = [];
    const result = await dog_invent(
        monster,
        edog,
        HERO_DISTANCE,
        {
            droppables: () => ({ otyp: DUMMY_OBJECT_TYPE }),
            random: {
                rn2(bound) {
                    bounds.push(bound);
                    return 1; // Both zero-tests miss.
                },
            },
            state,
        },
    );

    assert.equal(result, MMOVE_NOTHING);
    assert.deepEqual(bounds, [HERO_DISTANCE + 1, PET_APPORT]);
});

test('dog_invent rejects nofetch classes, mail, and prize ids', async () => {
    const rejectedObjects = [
        { oclass: BALL_CLASS },
        { oclass: CHAIN_CLASS },
        { oclass: ROCK_CLASS },
        { otyp: SCR_MAIL },
        // Distinct live ids exercise each achievement-tracking field.
        { o_id: 201, prize: 'mines_prize_oid' },
        { o_id: 202, prize: 'soko_prize_oid' },
    ];
    for (const rejected of rejectedObjects) {
        const { state, monster, edog } = inventoryState();
        const obj = floorObject(state, rejected);
        if (rejected.prize)
            state.context.achieveo[rejected.prize] = rejected.o_id;
        let classified = false;
        const result = await dog_invent(
            monster,
            edog,
            HERO_DISTANCE,
            noFloorActionEnv(state, {
                dogfood: () => {
                    classified = true;
                    return CADAVER;
                },
            }),
        );
        assert.equal(result, MMOVE_NOTHING);
        assert.equal(classified, false);
        assert.equal(
            state.level.objects[PET_X][PET_Y],
            obj,
            'the first floor object remains untouched',
        );
    }
});

test('dog_invent eats eligible food and propagates death', async () => {
    for (const expected of [MMOVE_MOVED, MMOVE_DIED]) {
        const { state, monster, edog } = inventoryState();
        const obj = floorObject(state);
        let eatenArgs;
        const result = await dog_invent(
            monster,
            edog,
            HERO_DISTANCE,
            noFloorActionEnv(state, {
                dogfood: () => CADAVER,
                eatObject: async (...args) => {
                    eatenArgs = args;
                    return expected;
                },
            }),
        );
        assert.equal(result, expected);
        assert.deepEqual(eatenArgs.slice(0, 5), [
            monster,
            obj,
            PET_X,
            PET_Y,
            false,
        ]);
        assert.equal(eatenArgs[5].state, state);
    }
});

test('dog_invent admits acceptable food only for a starving pet', async () => {
    for (const starving of [false, true]) {
        const { state, monster, edog } = inventoryState();
        floorObject(state);
        edog.mhpmax_penalty = starving
            ? 2 // Any positive penalty marks the pet as starving.
            : 0;
        let ate = false;
        const result = await dog_invent(
            monster,
            edog,
            HERO_DISTANCE,
            noFloorActionEnv(state, {
                dogfood: () => ACCFOOD,
                eatObject: async () => {
                    ate = true;
                    return MMOVE_MOVED;
                },
            }),
        );
        assert.equal(result, starving ? MMOVE_MOVED : MMOVE_NOTHING);
        assert.equal(ate, starving);
    }
});

test('dog_invent preserves pickup draws and awaits the owner', async () => {
    const { state, monster, edog } = inventoryState();
    const obj = floorObject(state);
    const bounds = [];
    const values = [
        PET_APPORT + 2, // rn2(20) still passes the strict apport+3 test.
        0, // rn2(udist) fails, so the apport fallback is evaluated.
        0, // rn2(apport) succeeds.
    ];
    const events = [];
    const result = await dog_invent(
        monster,
        edog,
        HERO_DISTANCE,
        noFloorActionEnv(state, {
            canCarry: () => 3, // A partial-stack pickup amount.
            pickObject: async (_monster, picked, amount, env) => {
                events.push(['start', picked, amount, env.state]);
                await Promise.resolve();
                events.push(['finish']);
            },
            random: {
                rn2(bound) {
                    bounds.push(bound);
                    return values.shift();
                },
            },
        }),
    );
    events.push(['returned']);

    assert.equal(result, MMOVE_NOTHING);
    assert.deepEqual(bounds, [20, HERO_DISTANCE, PET_APPORT]);
    assert.deepEqual(events, [
        ['start', obj, 3, state],
        ['finish'],
        ['returned'],
    ]);
});

test('dog_invent short-circuits the apport pickup draw after movement wins',
    async () => {
        const { state, monster, edog } = inventoryState();
        floorObject(state);
        const bounds = [];
        const values = [
            0, // rn2(20) passes.
            1, // rn2(udist) succeeds and skips rn2(apport).
        ];
        let picked = false;
        await dog_invent(
            monster,
            edog,
            HERO_DISTANCE,
            noFloorActionEnv(state, {
                canCarry: () => 1,
                pickObject: async () => {
                    picked = true;
                },
                random: {
                    rn2(bound) {
                        bounds.push(bound);
                        return values.shift();
                    },
                },
            }),
        );

        assert.equal(picked, true);
        assert.deepEqual(bounds, [20, HERO_DISTANCE]);
    });

test('dog_invent checks curse and reachability before pickup randomness',
    async () => {
        for (const blockedBy of ['curse', 'reachability']) {
            const { state, monster, edog } = inventoryState();
            floorObject(state, { cursed: blockedBy === 'curse' });
            let draws = 0;
            const result = await dog_invent(
                monster,
                edog,
                HERO_DISTANCE,
                noFloorActionEnv(state, {
                    canCarry: () => 1,
                    couldReachItem: () => blockedBy !== 'reachability',
                    random: {
                        rn2() {
                            draws++;
                            return 0;
                        },
                    },
                }),
            );
            assert.equal(result, MMOVE_NOTHING);
            assert.equal(draws, 0);
        }
    });
