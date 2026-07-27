import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { monflee } from '../js/monmove.js';
import { do_attack } from '../js/uhitm.js';

const DATETIME = '20300102030405';
const RC = 'OPTIONS=name:PetGate,role:Tourist,race:human,gender:male,'
    + 'align:neutral,!legacy,!tutorial,!splash_screen,'
    + 'mention_walls,safe_pet,!acoustics';

async function startingKitten() {
    await runSegment({
        // Seed 31006 places the ordinary active starting kitten next to the
        // hero and keeps it visible, isolating do_attack()'s safe-pet gate.
        seed: 31006,
        datetime: DATETIME,
        nethackrc: RC,
        moves: '',
    });
    return game.level.monlist;
}

test('do_attack returns false after the successful safe-pet gate', async () => {
    const kitten = await startingKitten();
    const bounds = [];

    assert.equal(
        await do_attack(kitten, game, {
            random: {
                rn2(bound) {
                    bounds.push(bound);
                    // Six is the known nonzero rn2(7) outcome in the strict
                    // PetSafe reproduction, so no refusal work follows.
                    return 6;
                },
                rnd() {
                    assert.fail('successful pet gate must not draw rnd(6)');
                },
            },
            message: () => assert.fail('successful gate has no message'),
            endRunning: () => assert.fail('successful gate keeps movement'),
            unsupported: (reason) => assert.fail(reason),
        }),
        false,
    );
    assert.deepEqual(bounds, [7]);
    assert.equal(kitten.mflee, false);
});

test('do_attack preserves refusal draw, flee, message, and stop order',
    async () => {
        const kitten = await startingKitten();
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
