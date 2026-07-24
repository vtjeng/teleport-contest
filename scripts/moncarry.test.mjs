import assert from 'node:assert/strict';
import test from 'node:test';

import { LARGEST_INT } from '../js/const.js';
import { can_carry } from '../js/moncarry.js';
import {
    AT_ENGL,
    M1_NOHANDS,
    M1_NOTAKE,
    M2_ROCKTHROW,
    M2_STRONG,
    MZ_MEDIUM,
    S_DRAGON,
    S_NYMPH,
} from '../js/monsters.js';
import {
    BOULDER,
    COIN_CLASS,
    GEM_CLASS,
    ROCK_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';

function monster(overrides = {}) {
    return {
        data: {
            // Human corpse weight gives a strong monster the 1000-unit cap.
            cwt: 1450,
            mattk: [],
            mflags1: 0,
            mflags2: M2_STRONG,
            // An ordinary monster class avoids each collector exception.
            mlet: 1,
            msize: MZ_MEDIUM,
        },
        isshk: false,
        minvent: null,
        mpeaceful: false,
        mtame: 0,
        ...overrides,
    };
}

function object(overrides = {}) {
    return {
        oclass: WEAPON_CLASS,
        // Any non-special type reaches the ordinary load check.
        otyp: 1,
        // Ten units fit comfortably below the ordinary carrying limit.
        owt: 10,
        // One item avoids the no-hands stack restriction by default.
        quan: 1,
        ...overrides,
    };
}

const touchable = { canTouchSafely: () => true };

test('can_carry enforces touch, anatomy, and load before returning quantity',
    () => {
        const carrier = monster();
        assert.equal(can_carry(carrier, object({
            // Three items exercise the complete-stack return.
            quan: 3,
        }), touchable), 3);
        assert.equal(can_carry(carrier, object(), {
            canTouchSafely: () => false,
        }), 0);

        carrier.data.mflags1 = M1_NOTAKE;
        assert.equal(can_carry(carrier, object(), touchable), 0);
        carrier.data.mflags1 = M1_NOHANDS;
        assert.equal(can_carry(carrier, object({
            // A three-item stack is capped to one for a handless carrier.
            quan: 3,
        }), touchable), 1);

        carrier.data.mflags1 = 0;
        assert.equal(
            // One unit above the strong human-weight carrying cap is rejected.
            can_carry(carrier, object({ owt: 1001 }), touchable),
            0,
        );
    });

test('can_carry preserves source exceptions for engulfers and collectors',
    () => {
        const noHands = monster();
        noHands.data.mflags1 = M1_NOHANDS;
        noHands.data.mattk = [{ aatyp: AT_ENGL }];
        assert.equal(can_carry(noHands, object({
            // Engulfing admits the whole three-item stack without hands.
            quan: 3,
        }), touchable), 3);

        const dragon = monster();
        dragon.data.mflags1 = M1_NOHANDS;
        dragon.data.mlet = S_DRAGON;
        assert.equal(can_carry(dragon, object({
            oclass: GEM_CLASS,
            // Four gems cover the dragon collector exception.
            quan: 4,
        }), touchable), 4);
        assert.equal(can_carry(dragon, object({
            oclass: COIN_CLASS,
            // Four coins exercise the other dragon collector class.
            quan: 4,
        }), touchable), 4);

        const nymph = monster();
        nymph.data.mlet = S_NYMPH;
        assert.equal(can_carry(nymph, object({
            oclass: ROCK_CLASS,
        }), touchable), 0);
        assert.equal(can_carry(nymph, object({
            // Nymphs bypass ordinary load limits for non-rock merchandise.
            owt: 1001,
        }), touchable), 1);

        const thrower = monster();
        thrower.data.mflags2 |= M2_ROCKTHROW;
        assert.equal(can_carry(thrower, object({
            oclass: ROCK_CLASS,
            otyp: BOULDER,
            // Five boulders cover the unlimited rock-thrower exception.
            quan: 5,
        }), touchable), 5);
    });

test('can_carry rejects steeds and peaceful non-pets', () => {
    const steed = monster();
    const state = { u: { usteed: steed } };
    assert.equal(can_carry(steed, object(), {
        ...touchable,
        state,
    }), 0);

    const peaceful = monster({ mpeaceful: true, mtame: 0 });
    assert.equal(can_carry(peaceful, object(), touchable), 0);
});

test('can_carry caps oversized quantities after anatomy and touch checks', () => {
    const bounds = [];
    const random = {
        rn2(bound) {
            bounds.push(bound);
            // Seven makes the returned capped quantity easy to distinguish.
            return 7;
        },
    };
    const shopkeeper = monster({ isshk: true });
    const oversized = object({
        // The first value beyond int range enters the source fallback draw.
        quan: LARGEST_INT + 1,
    });

    assert.equal(can_carry(shopkeeper, oversized, {
        ...touchable,
        random,
    }), 20007);
    assert.deepEqual(bounds, [LARGEST_INT - 20000 + 1]);

    bounds.length = 0;
    assert.equal(can_carry(shopkeeper, object({
        // A normal two-item stack must not draw.
        quan: 2,
    }), { ...touchable, random }), 2);
    assert.deepEqual(bounds, []);

    assert.equal(can_carry(shopkeeper, oversized, {
        random,
        canTouchSafely: () => false,
    }), 0);
    assert.deepEqual(bounds, []);
});

test('can_carry preserves early no-hands results before later exclusions', () => {
    const handlessStack = object({
        // Three items trigger the handless one-item return.
        quan: 3,
    });
    const steed = monster();
    steed.data.mflags1 = M1_NOHANDS;
    assert.equal(can_carry(steed, handlessStack, {
        ...touchable,
        state: { u: { usteed: steed } },
    }), 1);

    const shopkeeper = monster({ isshk: true });
    shopkeeper.data.mflags1 = M1_NOHANDS;
    assert.equal(can_carry(shopkeeper, handlessStack, touchable), 1);
});
