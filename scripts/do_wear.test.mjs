import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_ERODE, OBJ_DELETED, W_ARMC } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { addinv } from '../js/invent.js';
import { LEATHER_CLOAK } from '../js/objects.js';
import { mksobj } from '../js/obj.js';
import { destroy_arm, setwornEnv } from '../js/do_wear.js';
import { setworn } from '../js/worn.js';

async function equippedReadyToDestroy(seed, name) {
    await runSegment({
        seed,
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
    const cloak = addinv(mksobj(LEATHER_CLOAK, false, false, { state: game }),
        { state: game });
    await setworn(cloak, W_ARMC, setwornEnv(game));
    cloak.oeroded = MAX_ERODE;
    return cloak;
}

function destroyArmorRandom() {
    const draws = [];
    return {
        draws,
        rn2(bound) {
            draws.push(bound);
            return bound === 100 ? 99 : 0;
        },
        rnl() {
            assert.fail('destroying unblessed armor does not use rnl');
        },
    };
}

test('destroy_arm forwards ordinary erosion messages through its operation',
    async () => {
        const cloak = await equippedReadyToDestroy(981110, 'DestroyArmMessage');
        const messages = [];
        const random = destroyArmorRandom();

        assert.equal(await destroy_arm(game, random, {
            message: async text => messages.push(text),
        }), true);

        assert.deepEqual(messages, ['Your leather cloak smoulders away!']);
        assert.deepEqual(random.draws, [4, 2, 100]);
        assert.equal(cloak.where, OBJ_DELETED,
            'the source deletion removed the cloak');
    });

test('destroy_arm keeps planning erosion output on the silent operation',
    async () => {
        const cloak = await equippedReadyToDestroy(981111, 'DestroyArmPlanning');
        const screenBefore = game.nhDisplay.serialize();
        const pendingBefore = game._pending_message;
        const random = destroyArmorRandom();

        assert.equal(await destroy_arm(game, random, {
            planning: true,
            message: async () => {},
        }), true);

        assert.deepEqual(random.draws, [4, 2, 100]);
        assert.equal(cloak.where, OBJ_DELETED);
        assert.equal(game.nhDisplay.serialize(), screenBefore);
        assert.equal(game._pending_message, pendingBefore);
    });
