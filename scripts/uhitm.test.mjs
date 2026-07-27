import assert from 'node:assert/strict';
import test from 'node:test';

import { moveloop_core } from '../js/allmain.js';
import { ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at, place_monster, remove_monster } from '../js/monst.js';
import { monflee } from '../js/monmove.js';
import {
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_PONY,
} from '../js/monsters.js';
import { initRng } from '../js/rng.js';
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

function topLine() {
    return game.nhDisplay.grid[0]
        .map(({ ch }) => ch).join('').trimEnd();
}

function deferred() {
    let resolve;
    const promise = new Promise((accept) => { resolve = accept; });
    return { promise, resolve };
}

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

test('live movement swaps every starting-pet species through safe-pet attack',
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
            const oldHero = [game.u.ux, game.u.uy];
            const destination = [game.u.ux + 1, game.u.uy];
            const occupant = m_at(destination[0], destination[1], game);
            assert.ok(!occupant || occupant === pet);
            remove_monster(pet.mx, pet.my, game);
            game.level.at(...destination).typ = ROOM;
            game.level.at(...destination).flags = 0;
            game.level.at(...destination).doormask = 0;
            game.level.objects[destination[0]][destination[1]] = null;
            game.level.traps = [];
            game.level.regions = [];
            game.head_engr = null;
            place_monster(pet, ...destination, game);
            initRng(1); // first rn2(7) is 5, the successful swap branch
            game.nhDisplay.pushKey('l'.charCodeAt(0));

            await moveloop_core();

            assert.deepEqual([game.u.ux, game.u.uy], destination);
            assert.deepEqual([pet.mx, pet.my], oldHero);
            assert.equal(m_at(...oldHero, game), pet);
            assert.equal(m_at(...destination, game), null);
            assert.match(
                game._pending_message,
                /^You swap places with your /u,
            );
            assert.equal(pet.mflee, false);
            let listCount = 0;
            for (let monster = game.level.monlist;
                monster;
                monster = monster.nmon) {
                if (monster === pet) ++listCount;
            }
            assert.equal(listCount, 1);
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

test('do_attack awaits flee and message before stopping the hero', async () => {
    const kitten = await startingPet();
    const fleeGate = deferred();
    const messageGate = deferred();
    const events = [];
    const pending = do_attack(kitten, game, {
        random: { rn2: () => 0, rnd: () => 3 },
        monFlee() {
            events.push('monflee');
            return fleeGate.promise;
        },
        message() {
            events.push('message');
            return messageGate.promise;
        },
        endRunning() {
            events.push('end_running');
        },
        unsupported: (reason) => assert.fail(reason),
    });

    assert.deepEqual(events, ['monflee']);
    fleeGate.resolve();
    await Promise.resolve();
    assert.deepEqual(events, ['monflee', 'message']);
    messageGate.resolve();
    assert.equal(await pending, true);
    assert.deepEqual(events, ['monflee', 'message', 'end_running']);
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
