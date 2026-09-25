import assert from 'node:assert/strict';
import test from 'node:test';

import { TT_BURIEDBALL, TT_PIT } from '../js/const.js';
import { buried_ball } from '../js/dig.js';
import { HEAVY_IRON_BALL, IRON_CHAIN } from '../js/objects.js';

function ball(otyp, ox, oy, nobj = null) {
    return { otyp, ox, oy, nobj };
}

function state(buriedobjlist, { utrap = 0, utraptype = TT_PIT } = {}) {
    return { u: { utrap, utraptype }, level: { buriedobjlist } };
}

test('buried_ball returns a ball at the target coordinate first', () => {
    const nearby = ball(HEAVY_IRON_BALL, 11, 10);
    const direct = ball(HEAVY_IRON_BALL, 10, 10, nearby);
    const cc = { x: 10, y: 10 };

    assert.equal(buried_ball(cc, state(direct)), direct);
    assert.deepEqual(cc, { x: 10, y: 10 });
});

test('buried_ball moves the coordinate to the nearest ball within dist2 8', () => {
    const far = ball(HEAVY_IRON_BALL, 13, 10);
    const nearest = ball(HEAVY_IRON_BALL, 11, 11, far);
    const farther = ball(HEAVY_IRON_BALL, 12, 10, nearest);
    const chain = ball(IRON_CHAIN, 10, 11, farther);
    const cc = { x: 10, y: 10 };

    assert.equal(buried_ball(cc, state(chain)), nearest);
    assert.deepEqual(cc, { x: 11, y: 11 });
});

test('buried_ball keeps the first ball on a distance tie', () => {
    const second = ball(HEAVY_IRON_BALL, 9, 10);
    const first = ball(HEAVY_IRON_BALL, 11, 10, second);
    const cc = { x: 10, y: 10 };

    assert.equal(buried_ball(cc, state(first)), first);
    assert.deepEqual(cc, { x: 11, y: 10 });
});

test('buried_ball skips lookup while trapped by a different trap', () => {
    const target = ball(HEAVY_IRON_BALL, 10, 10);
    const cc = { x: 10, y: 10 };

    assert.equal(
        buried_ball(cc, state(target, { utrap: 1, utraptype: TT_PIT })), null,
    );
    assert.deepEqual(cc, { x: 10, y: 10 });
    assert.equal(
        buried_ball(cc, state(target, { utrap: 1, utraptype: TT_BURIEDBALL })),
        target,
    );
});
