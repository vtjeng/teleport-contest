import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    LOST_DROPPED,
    LOST_NONE,
    LOST_STOLEN,
    LOST_THROWN,
    NON_PM,
    OBJ_FREE,
    OBJ_MINVENT,
} from '../js/const.js';
import { count_unpaid } from '../js/invent.js';
import { AT_ENGL } from '../js/monsters.js';
import {
    mpickobj,
    preflight_mpickobj,
    UnsupportedMonsterPickupOperationError,
} from '../js/steal.js';
import { init_objects } from '../js/o_init.js';
import {
    APPLE,
    FIGURINE,
    OIL_LAMP,
    objects_globals_init,
} from '../js/objects.js';

// Distinct coordinates make the post-transfer snuff callback observable.
const CARRIER_X = 7;
const CARRIER_Y = 9;
// Any valid non-sentinel monster index exercises figurine timer attachment.
const TEST_SPECIES = 17;
// Distinct floor coordinates verify find_objowner() argument order.
const FLOOR_X = 4;
const FLOOR_Y = 6;

function object(overrides = {}) {
    return {
        otyp: APPLE,
        where: OBJ_FREE,
        nobj: null,
        nexthere: null,
        cobj: null,
        unpaid: false,
        no_charge: true,
        how_lost: LOST_NONE,
        lamplit: false,
        cursed: false,
        corpsenm: NON_PM,
        timed: 0,
        known: true,
        dknown: true,
        bknown: true,
        rknown: true,
        cknown: true,
        lknown: true,
        tknown: true,
        ...overrides,
    };
}

function monster(overrides = {}) {
    return {
        data: { mattk: [] },
        minvent: null,
        mtame: false,
        mx: CARRIER_X,
        my: CARRIER_Y,
        ...overrides,
    };
}

function state(overrides = {}) {
    const gameState = {
        gt: { thrownobj: null },
        gk: { kickedobj: null },
        u: {
            uswallow: false,
            ustuck: null,
            uprops: {
                [BLINDED]: {
                    intrinsic: 0,
                    extrinsic: 0,
                    blocked: 0,
                },
            },
        },
        ...overrides,
    };
    objects_globals_init(gameState);
    // Zero choices initialize descriptions without coupling pickup to RNG.
    init_objects(gameState, () => 0);
    return gameState;
}

test('mpickobj preserves missing and attached-object return values', () => {
    const carrier = monster();
    const ball = object();
    const gameState = state({ uball: ball });
    const impossible = [];
    const env = {
        state: gameState,
        hooks: {
            impossible(message) {
                impossible.push(message);
            },
        },
    };

    assert.equal(mpickobj(carrier, null, env), true);
    assert.equal(mpickobj(carrier, ball, env), false);
    assert.equal(carrier.minvent, null);
    assert.equal(ball.where, OBJ_FREE);
    assert.equal(impossible.length, 2);
});

test('mpickobj clears only the first matching projectile owner', () => {
    const carrier = monster({ mtame: true });
    const projectile = object();
    const gameState = state({
        gt: { thrownobj: projectile },
        gk: { kickedobj: projectile },
    });

    assert.equal(mpickobj(carrier, projectile, { state: gameState }), false);
    assert.equal(gameState.gt.thrownobj, null);
    assert.equal(gameState.gk.kickedobj, projectile);
    assert.equal(projectile.where, OBJ_MINVENT);
    assert.equal(projectile.ocarry, carrier);
});

test('mpickobj removes billing before unseen knowledge and ownership', () => {
    const events = [];
    const carrier = monster();
    const item = object({
        unpaid: true,
        how_lost: LOST_THROWN,
        ox: FLOOR_X,
        oy: FLOOR_Y,
    });
    const gameState = state();
    const env = {
        state: gameState,
        canSeeMonster() {
            events.push('visibility');
            return false;
        },
        hooks: {
            findObjectOwner(obj, x, y) {
                events.push(`owner:${x},${y}`);
                assert.equal(obj, item);
                return carrier;
            },
            subFromBill(obj, owner) {
                events.push('bill');
                assert.equal(obj, item);
                assert.equal(owner, carrier);
                obj.unpaid = false;
            },
        },
    };

    assert.equal(mpickobj(carrier, item, env), false);
    assert.deepEqual(events, [
        `owner:${FLOOR_X},${FLOOR_Y}`,
        'bill',
        'visibility',
    ]);
    assert.equal(item.no_charge, false);
    assert.equal(item.how_lost, LOST_STOLEN);
    assert.equal(item.known, true);
    assert.equal(item.dknown, false);
    assert.equal(item.bknown, false);
    assert.equal(item.where, OBJ_MINVENT);
});

test('count_unpaid traverses sibling and contained object chains', () => {
    const nestedUnpaid = object({ unpaid: true });
    const container = object({ cobj: nestedUnpaid });
    const directUnpaid = object({ unpaid: true });
    const secondDirectUnpaid = object({ unpaid: true });
    container.nobj = directUnpaid;
    directUnpaid.nobj = secondDirectUnpaid;

    // One nested and two direct entries exercise both recursive and loop paths.
    assert.equal(count_unpaid(container), 3);
});

test('tame pickup retains knowledge and dropped-object provenance', () => {
    const carrier = monster({ mtame: true });
    const item = object({ how_lost: LOST_DROPPED });
    assert.equal(mpickobj(carrier, item, {
        state: state(),
        canSeeMonster() {
            throw new Error('tame pickup must not test visibility');
        },
    }), false);
    assert.equal(item.how_lost, LOST_DROPPED);
    assert.equal(item.dknown, true);
});

test('unseen non-pet pickup forgets dropped provenance', () => {
    const carrier = monster();
    const item = object({ how_lost: LOST_DROPPED });
    assert.equal(mpickobj(carrier, item, {
        state: state(),
        canSeeMonster: () => false,
    }), false);
    assert.equal(item.how_lost, LOST_NONE);
    assert.equal(item.dknown, false);
});

test('mpickobj detects unpaid objects inside nested containers', () => {
    const carrier = monster({ mtame: true });
    const unpaidContent = object({ unpaid: true });
    const innerContainer = object({ cobj: unpaidContent });
    const outerContainer = object({ cobj: innerContainer });
    const calls = [];

    assert.equal(mpickobj(carrier, outerContainer, {
        state: state(),
        hooks: {
            findObjectOwner() {
                calls.push('owner');
                return carrier;
            },
            subFromBill(obj) {
                calls.push('bill');
                assert.equal(obj, outerContainer);
                unpaidContent.unpaid = false;
            },
        },
    }), false);
    assert.deepEqual(calls, ['owner', 'bill']);
    assert.equal(unpaidContent.unpaid, false);
});

test('cursed figurine carrying effect runs before inventory transfer', () => {
    const carrier = monster({ mtame: true });
    const figurine = object({
        otyp: FIGURINE,
        cursed: true,
        corpsenm: TEST_SPECIES,
    });
    let attached = 0;
    const env = {
        state: state(),
        hooks: {
            isDeadSpecies(species, includeGone) {
                assert.equal(species, TEST_SPECIES);
                assert.equal(includeGone, true);
                return false;
            },
            attachFigurineTimer(obj) {
                ++attached;
                assert.equal(obj.where, OBJ_FREE);
                assert.equal(carrier.minvent, null);
                obj.timed = 1;
            },
        },
    };
    const plan = preflight_mpickobj(carrier, figurine, env);

    assert.equal(mpickobj(carrier, figurine, env, plan), false);
    assert.equal(attached, 1);
    assert.equal(figurine.timed, 1);
    assert.equal(figurine.where, OBJ_MINVENT);
});

test('engulfing pickup reports before transfer and snuffs afterward', () => {
    const carrier = monster({
        data: { mattk: [{ aatyp: AT_ENGL }] },
    });
    const lamp = object({
        otyp: OIL_LAMP,
        lamplit: true,
    });
    const gameState = state();
    gameState.u.uswallow = true;
    gameState.u.ustuck = carrier;
    const events = [];

    assert.equal(mpickobj(carrier, lamp, {
        state: gameState,
        canSeeMonster: () => false,
        hooks: {
            reportObjectGoesOut(obj) {
                events.push('report');
                assert.equal(obj.no_charge, true);
                assert.equal(obj.where, OBJ_FREE);
            },
            snuffLightSource(x, y) {
                events.push('snuff');
                assert.deepEqual([x, y], [CARRIER_X, CARRIER_Y]);
                assert.equal(lamp.where, OBJ_MINVENT);
                assert.equal(lamp.ocarry, carrier);
            },
        },
    }), false);
    assert.deepEqual(events, ['report', 'snuff']);
});

test('unsupported billing and light seams stop before pickup mutation', () => {
    const carrier = monster({
        mtame: true,
        data: { mattk: [{ aatyp: AT_ENGL }] },
    });
    const billed = object({
        unpaid: true,
        how_lost: LOST_THROWN,
    });
    const gameState = state({ gt: { thrownobj: billed } });
    assert.throws(
        () => mpickobj(carrier, billed, { state: gameState }),
        (error) => error instanceof UnsupportedMonsterPickupOperationError
            && error.operation === 'findObjectOwner',
    );
    assert.equal(gameState.gt.thrownobj, billed);
    assert.equal(billed.no_charge, true);
    assert.equal(billed.where, OBJ_FREE);

    const lamp = object({ otyp: OIL_LAMP, lamplit: true });
    assert.throws(
        () => mpickobj(carrier, lamp, { state: state() }),
        (error) => error instanceof UnsupportedMonsterPickupOperationError
            && error.operation === 'snuffLightSource',
    );
    assert.equal(lamp.no_charge, true);
    assert.equal(lamp.where, OBJ_FREE);
});
