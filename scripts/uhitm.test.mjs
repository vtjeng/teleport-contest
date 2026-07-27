import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { monflee } from '../js/monmove.js';
import {
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_PONY,
} from '../js/monsters.js';
import { do_attack } from '../js/uhitm.js';

const DATETIME = '20300102030405';
function petRc({
    role = 'Tourist',
    gender = 'male',
    align = 'neutral',
    pettype,
    safePet = true,
} = {}) {
    return `OPTIONS=name:PetGate,role:${role},race:human,gender:${gender},`
        + `align:${align},!legacy,!tutorial,!splash_screen,`
        + `mention_walls,${safePet ? '' : '!'}safe_pet,!acoustics`
        + `${pettype ? `,pettype:${pettype}` : ''}`;
}
const RC = petRc();

async function startingPet({
    seed = 31006,
    expectedPm = PM_KITTEN,
    ...configuration
} = {}) {
    await runSegment({
        seed,
        datetime: DATETIME,
        nethackrc: petRc(configuration),
        moves: '',
    });
    let pet = game.level.monlist;
    while (pet && pet.m_id !== game.context.startingpet_mid)
        pet = pet.nmon;
    assert.ok(pet, 'startingpet_mid identifies a live starting pet');
    assert.equal(pet.data.pmidx, expectedPm);
    return pet;
}

test('do_attack passes the safe-pet gate for every starting-pet species',
    async () => {
        const cases = [
            { expectedPm: PM_KITTEN, pettype: 'cat' },
            { expectedPm: PM_LITTLE_DOG, pettype: 'dog' },
            {
                seed: 2026072257,
                expectedPm: PM_PONY,
                role: 'Knight',
                align: 'lawful',
            },
        ];

        for (const configuration of cases) {
            const pet = await startingPet(configuration);
            const bounds = [];
            assert.equal(
                await do_attack(pet, game, {
                    random: {
                        rn2(bound) {
                            bounds.push(bound);
                            return 6;
                        },
                        rnd() {
                            assert.fail(
                                'successful pet gate must not draw rnd(6)',
                            );
                        },
                    },
                    message: () => assert.fail(
                        'successful gate has no message',
                    ),
                    endRunning: () => assert.fail(
                        'successful gate keeps movement',
                    ),
                    unsupported: (reason) => assert.fail(reason),
                }),
                false,
            );
            assert.deepEqual(bounds, [7]);
            assert.equal(pet.mflee, false);
        }
    });

test('do_attack sends a false safe-monster predicate to combat unchanged',
    async () => {
        const pet = await startingPet({
            pettype: 'cat',
            safePet: false,
        });
        const before = structuredClone({
            mflee: pet.mflee,
            mfleetim: pet.mfleetim,
            mtrack: pet.mtrack,
        });
        let unsupportedCalls = 0;

        await assert.rejects(
            do_attack(pet, game, {
                random: {
                    rn2: () => assert.fail('unsafe collision must not draw'),
                    rnd: () => assert.fail('unsafe collision must not draw'),
                },
                unsupported(reason, subject, state) {
                    ++unsupportedCalls;
                    assert.equal(reason, 'hero combat');
                    assert.equal(subject, pet);
                    assert.equal(state, game);
                    throw new Error('combat boundary');
                },
            }),
            /combat boundary/u,
        );
        assert.equal(unsupportedCalls, 1);
        assert.deepEqual({
            mflee: pet.mflee,
            mfleetim: pet.mfleetim,
            mtrack: pet.mtrack,
        }, before);
    });

test('do_attack preserves refusal draw, flee, message, and stop order',
    async () => {
        const kitten = await startingPet();
        const events = [];
        const random = {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                // Zero is do_attack()'s one-in-seven refusal outcome.
                return 0;
            },
            rnd(bound) {
                events.push(`rnd(${bound})`);
                // Three is the exact flee duration from the independent
                // PetRefuse C reproduction.
                return 3;
            },
        };

        assert.equal(
            await do_attack(kitten, game, {
                random,
                monFlee: async (...args) => {
                    events.push('monflee');
                    await monflee(...args);
                },
                message: (message) => events.push(`message:${message}`),
                endRunning: () => events.push('end_running'),
                unsupported: (reason) => assert.fail(reason),
            }),
            true,
        );

        assert.deepEqual(events, [
            'rn2(7)',
            'rnd(6)',
            'monflee',
            'message:You stop.  Your kitten is in the way!',
            'end_running',
        ]);
        assert.equal(kitten.mflee, true);
        assert.equal(kitten.mfleetim, 3);
        assert.ok(
            kitten.mtrack.every(({ x, y }) => x === 0 && y === 0),
            'monflee clears all remembered hero-track coordinates',
        );
    });

test('safe-pet refusal continues through the timed fleeing pet turns',
    async () => {
        await runSegment({
            // Independent C reproduction: the southwest bump refuses on
            // rn2(7)==0, assigns rnd(6)==3, then four waits exercise the
            // movemon_singlemon() timeout and dochug() flee paths.
            seed: 31009,
            datetime: DATETIME,
            nethackrc: RC,
            moves: 'y....',
        });

        assert.equal(game._commandDispatchCount, 5);
        let pet = game.level.monlist;
        while (pet && pet.m_id !== game.context.startingpet_mid)
            pet = pet.nmon;
        assert.ok(pet, 'starting pet remains live after fleeing continuation');
        assert.equal(pet.mflee, false);
        assert.equal(pet.mfleetim, 0);
    });
