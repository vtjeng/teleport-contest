import assert from 'node:assert/strict';
import test from 'node:test';

import { dog_hunger } from '../js/dogmove.js';
import {
    M1_CARNIVORE,
} from '../js/monsters.js';

const HUNGRY_TIME = 100; // A simple base for both strict hunger thresholds.
const DOG_WEAK = 500; // Source delay before the maximum-HP penalty.
const DOG_STARVE = 750; // Source delay before a penalized pet dies.
const WEAK_LIMIT = HUNGRY_TIME + DOG_WEAK;
const STARVE_LIMIT = HUNGRY_TIME + DOG_STARVE;
const ALIVE_HIT_POINTS = 1; // Smallest value outside DEADMONSTER().
const DEAD_HIT_POINTS = 0; // DEADMONSTER() becomes true below one.
const WEAK_MAXIMUM = 3; // Integer division of the fixture maximum by three.
const WEAK_PENALTY = 7; // Difference between the old and weak maxima.

function hungryPet(overrides = {}) {
    const monster = {
        data: { mflags1: M1_CARNIVORE },
        mconf: false,
        mhp: 9, // Above the post-penalty maximum, exercising its clamp.
        mhpmax: 10, // Integer division by three yields a maximum of three.
        ...overrides.monster,
    };
    const edog = {
        hungrytime: HUNGRY_TIME,
        mhpmax_penalty: 0,
        ...overrides.edog,
    };
    return { monster, edog };
}

function hungerEnv(moves, events = []) {
    return {
        reportWeakPet: async (_monster, env) => {
            events.push(['weak', env.state.moves]);
        },
        starvePet: async (_monster, env) => {
            events.push(['starve', env.state.moves]);
        },
        state: { moves },
        stopOccupation: async (env) => {
            events.push(['stop', env.state.moves]);
        },
    };
}

test('dog_hunger is inert through the strict weak threshold', async () => {
    const { monster, edog } = hungryPet();
    const events = [];
    const result = await dog_hunger(
        monster,
        edog,
        hungerEnv(WEAK_LIMIT, events),
    );

    assert.equal(result, false);
    assert.deepEqual(events, []);
    assert.equal(edog.mhpmax_penalty, 0);
});

test('dog_hunger postpones starvation for dietless pets', async () => {
    const { monster, edog } = hungryPet({
        monster: { data: { mflags1: 0 } },
    });
    const moves = WEAK_LIMIT + 1; // First turn strictly past DOG_WEAK.
    const events = [];
    const result = await dog_hunger(
        monster,
        edog,
        hungerEnv(moves, events),
    );

    assert.equal(result, false);
    assert.equal(edog.hungrytime, moves + DOG_WEAK);
    assert.deepEqual(events, []);
});

test('dog_hunger applies the weak penalty before reporting it', async () => {
    const { monster, edog } = hungryPet();
    const events = [];
    const result = await dog_hunger(
        monster,
        edog,
        hungerEnv(WEAK_LIMIT + 1, events),
    );

    assert.equal(result, false);
    assert.equal(monster.mconf, true);
    assert.equal(monster.mhpmax, WEAK_MAXIMUM);
    assert.equal(monster.mhp, WEAK_MAXIMUM);
    assert.equal(edog.mhpmax_penalty, WEAK_PENALTY);
    assert.deepEqual(events, [
        ['weak', WEAK_LIMIT + 1],
        ['stop', WEAK_LIMIT + 1],
    ]);
});

test('dog_hunger preflights weak-state owners before mutation', async () => {
    const { monster, edog } = hungryPet();
    const before = structuredClone({ monster, edog });
    const env = hungerEnv(WEAK_LIMIT + 1);
    delete env.stopOccupation;

    await assert.rejects(
        dog_hunger(monster, edog, env),
        /stopOccupation/,
    );
    assert.deepEqual({ monster, edog }, before);
});

test('dog_hunger starves once when the maximum falls to zero', async () => {
    const { monster, edog } = hungryPet({
        monster: {
            mhp: 1, // Clamped to the zero maximum before DEADMONSTER().
            mhpmax: 2, // Integer division by three produces zero.
        },
    });
    const events = [];
    const result = await dog_hunger(
        monster,
        edog,
        hungerEnv(WEAK_LIMIT + 1, events),
    );

    assert.equal(result, true);
    assert.equal(monster.mhp, 0);
    assert.deepEqual(events, [['starve', WEAK_LIMIT + 1]]);
});

test('dog_hunger preserves the strict starvation deadline', async () => {
    for (const [moves, hitPoints, expected] of [
        [STARVE_LIMIT, ALIVE_HIT_POINTS, false],
        [STARVE_LIMIT + 1, ALIVE_HIT_POINTS, true],
        [WEAK_LIMIT + 1, DEAD_HIT_POINTS, true],
    ]) {
        const { monster, edog } = hungryPet({
            edog: {
                mhpmax_penalty: WEAK_PENALTY,
            },
            monster: {
                mhp: hitPoints,
            },
        });
        const events = [];
        const result = await dog_hunger(
            monster,
            edog,
            hungerEnv(moves, events),
        );

        assert.equal(result, expected);
        assert.deepEqual(
            events,
            expected ? [['starve', moves]] : [],
        );
    }
});
