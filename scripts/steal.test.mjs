import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    IN_SIGHT,
    LOST_DROPPED,
    LOST_NONE,
    LOST_STOLEN,
    LOST_THROWN,
    NON_PM,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_MINVENT,
    ROOM,
    W_SADDLE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { count_unpaid } from '../js/invent.js';
import { AT_ENGL } from '../js/monsters.js';
import {
    mpickobj,
    preflight_mpickobj,
    relobj,
    UnsupportedMonsterPickupOperationError,
} from '../js/steal.js';
import { init_objects } from '../js/o_init.js';
import {
    APPLE,
    FIGURINE,
    FOOD_CLASS,
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

// ── steal.c relobj() and mdrop_obj() ──

// A drop square well inside the map, distinct from the coordinates the
// pickup fixtures above use so a stale index cannot pass by accident.
const DROP_X = 21;
const DROP_Y = 11;

class RefusedRelease extends Error {}

function refuse(reason) {
    const error = new RefusedRelease(reason);
    error.reason = reason;
    throw error;
}

// A carrier standing on <DROP_X,DROP_Y> holding one object, on a map the hero
// can see, with the message and redraw owners recorded rather than drawn.
function dropFixture({
    carried = {},
    verbose = true,
    isgd = false,
    seen = true,
} = {}) {
    const level = new GameMap();
    level.at(DROP_X, DROP_Y).typ = ROOM;
    const gameState = state();
    gameState.level = level;
    gameState.flags = { verbose };
    gameState.context = { mon_moving: true };
    gameState.u.ux = DROP_X - 1;
    gameState.u.uy = DROP_Y;
    gameState.viz_array = Array.from(
        { length: 21 },
        () => new Array(80).fill(0),
    );
    if (seen) gameState.viz_array[DROP_Y][DROP_X] = IN_SIGHT;

    const held = object({
        where: OBJ_MINVENT,
        oclass: FOOD_CLASS,
        quan: 1,
        ...carried,
    });
    const carrier = monster({
        // pmnames[NEUTRAL] is what do_name.c pmname() reads for a monster
        // with no gendered name, and it is what the drop line has to quote.
        data: { mattk: [], pmnames: [null, null, 'little dog'] },
        mtame: true,
        isgd,
        mx: DROP_X,
        my: DROP_Y,
        minvent: held,
    });
    held.ocarry = carrier;

    const messages = [];
    const redraws = [];
    const env = {
        state: gameState,
        unsupported: refuse,
        // droppables() is dogmove.c's selector; these tests drive relobj()
        // directly, so the carried object is offered until it leaves minvent.
        droppables: (mon) => mon.minvent,
        message: async (text) => { messages.push(text); },
        redraw: (x, y) => { redraws.push([x, y]); },
    };
    return { carrier, held, gameState, env, messages, redraws };
}

test('relobj drops a pet object onto the floor and announces it', async () => {
    const { carrier, held, gameState, env, messages, redraws } = dropFixture();

    await relobj(carrier, 0, true, env);

    assert.equal(carrier.minvent, null);
    assert.equal(held.where, OBJ_FLOOR);
    assert.equal(held.ocarry, null);
    assert.equal(held.ox, DROP_X);
    assert.equal(held.oy, DROP_Y);
    assert.equal(gameState.level.objects[DROP_X][DROP_Y], held);
    assert.equal(gameState.level.objlist, held);
    // object() above sets bknown, and objnam.c:1318-1348 prefixes "uncursed"
    // for a bknown uncursed object whose type is not charged, whatever
    // flags.implicit_uncursed says. A pet's own pickup leaves bknown clear, so
    // the running game usually reads "an apple"; the matrix covers that.
    assert.deepEqual(messages, ['The little dog drops an uncursed apple.']);
    // relobj()'s trailing newsym() is behind `show`, which dogmove.c passes as
    // mtmp->minvis; a visible pet leaves the square to m_move()'s redraw.
    assert.deepEqual(redraws, []);
});

test('relobj redraws the square only when show is set', async () => {
    const shown = dropFixture();
    await relobj(shown.carrier, 1, true, shown.env);
    assert.deepEqual(shown.redraws, [[DROP_X, DROP_Y]]);

    // The same show flag with the square out of sight draws nothing, because
    // steal.c:897 is `show && cansee(omx, omy)`.
    const unseen = dropFixture({ seen: false });
    await relobj(unseen.carrier, 1, true, unseen.env);
    assert.deepEqual(unseen.redraws, []);
    // The drop itself still happened; only the repaint and the line are gated.
    assert.equal(unseen.held.where, OBJ_FLOOR);
    assert.deepEqual(unseen.messages, []);
});

test('a pet drop prints only under flags.verbose', async () => {
    const quiet = dropFixture({ verbose: false });
    await relobj(quiet.carrier, 0, true, quiet.env);
    assert.deepEqual(quiet.messages, []);
    assert.equal(quiet.held.where, OBJ_FLOOR);

    // steal.c:893 passes `is_pet && flags.verbose`, so a non-pet release is
    // silent however verbose the game is.
    const untamed = dropFixture();
    untamed.carrier.mtame = false;
    await relobj(untamed.carrier, 0, false, untamed.env);
    assert.deepEqual(untamed.messages, []);
    assert.equal(untamed.held.where, OBJ_FLOOR);
});

test('relobj and mdrop_obj stop on the arms that are not ported', async () => {
    const guard = dropFixture({ isgd: true });
    await assert.rejects(
        relobj(guard.carrier, 0, true, guard.env),
        (error) => error instanceof RefusedRelease
            && error.reason === "a vault guard's gold vanishing",
    );
    assert.equal(guard.held.where, OBJ_MINVENT);

    // steal.c:892's `while` releases everything droppables() offers. Only the
    // first object of a release is ported.
    const pair = dropFixture();
    const second = object({ where: OBJ_MINVENT, quan: 1 });
    pair.held.nobj = second;
    second.ocarry = pair.carrier;
    await assert.rejects(
        relobj(pair.carrier, 0, true, pair.env),
        (error) => error instanceof RefusedRelease
            && error.reason === 'a monster releasing more than one object',
    );

    // mdrop_obj()'s saddle exemption and update_mon_extrinsics() both need an
    // object the monster still has equipped.
    const worn = dropFixture({ carried: { owornmask: W_SADDLE } });
    await assert.rejects(
        relobj(worn.carrier, 0, true, worn.env),
        (error) => error instanceof RefusedRelease
            && error.reason
                === 'a monster dropping an object it has equipped',
    );
    assert.equal(worn.held.where, OBJ_MINVENT);

    // invent.c stackobj() merging onto an occupied square is a later slice.
    const occupied = dropFixture();
    occupied.gameState.level.objects[DROP_X][DROP_Y] = object({
        where: OBJ_FLOOR, ox: DROP_X, oy: DROP_Y,
    });
    await assert.rejects(
        relobj(occupied.carrier, 0, true, occupied.env),
        (error) => error instanceof RefusedRelease
            && error.reason
                === 'a monster dropping onto a square that holds an object',
    );
    assert.equal(occupied.held.where, OBJ_MINVENT);
});

test('a monster release needs an unsupported operation', async () => {
    const { carrier, env } = dropFixture();
    delete env.unsupported;
    await assert.rejects(
        relobj(carrier, 0, true, env),
        /monster object release requires an unsupported operation/u,
    );
});
