import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    IN_SIGHT,
    I_SPECIAL,
    LOST_DROPPED,
    LOST_NONE,
    LOST_STOLEN,
    LOST_THROWN,
    NON_PM,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_MINVENT,
    ROOM,
    ROOMOFFSET,
    SHOPBASE,
    W_ARM,
    W_ARMH,
    W_SADDLE,
    W_WEP,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { count_unpaid } from '../js/invent.js';
import { AT_ENGL } from '../js/monsters.js';
import { UnsupportedObjectNameError } from '../js/objnam.js';
import {
    mpickobj,
    preflight_mpickobj,
    relobj,
    UnsupportedMonsterPickupOperationError,
} from '../js/steal.js';
import { init_objects } from '../js/o_init.js';
import {
    APPLE,
    ARMOR_CLASS,
    FIGURINE,
    FOOD_CLASS,
    GOLD_DRAGON_SCALE_MAIL,
    OIL_LAMP,
    ORCISH_DAGGER,
    ORCISH_HELM,
    POTION_CLASS,
    POT_BOOZE,
    WEAPON_CLASS,
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
        // obj.js newObject() zeroes owornmask, and steal.c mdrop_obj() reads
        // it before extract_from_minvent() clears it.
        owornmask: 0,
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
        // One hit point is the smallest value !DEADMONSTER() admits, so the
        // default carrier is alive; mdrop_obj()'s tail reads it.
        mhp: 1,
        misc_worn_check: 0,
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
            // The Dungeons of Doom level 1, which is what shk.c inhishop()
            // compares a shopkeeper's recorded shoplevel against.
            uz: { dnum: 0, dlevel: 1 },
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
    carrier: carrierOverrides = {},
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
        ...carrierOverrides,
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

// An unidentified potion. Its appearance is "brown potion" under the zero
// description shuffle state() above installs, which differs from the plain
// class form doname() falls back to while dknown is clear.
const UNSEEN_POTION = { otyp: POT_BOOZE, oclass: POTION_CLASS, dknown: false };

test('a nearby drop identifies the object before it leaves minvent', async () => {
    // steal.c:821-823 calls distant_name() "before extracting obj from
    // minvent" for its side-effects, and one of them shows: an object
    // still in minvent resolves through get_obj_location() to its carrier's
    // square, so distant_name() takes its near branch and doname() sets
    // dknown. Once extracted the object is OBJ_FREE, get_obj_location()
    // answers nothing, and the far branch raises gd.distantname instead.
    const { carrier, held, env, messages } = dropFixture({
        carried: UNSEEN_POTION,
    });

    await relobj(carrier, 0, true, env);

    assert.equal(held.dknown, true);
    assert.deepEqual(
        messages,
        ['The little dog drops an uncursed brown potion.'],
    );
});

test('a drop beyond the near square keeps the object unidentified', async () => {
    // objnam.c distant_name()'s neardist is r * r * 2 - r, which is 6 for the
    // ordinary xray_range. Six columns away is a distu() of 36, so the far
    // branch runs even though the drop square is lit and in sight.
    const far = dropFixture({ carried: UNSEEN_POTION });
    far.gameState.u.ux = DROP_X - 6;

    await relobj(far.carrier, 0, true, far.env);

    assert.equal(far.held.dknown, false);
    assert.deepEqual(
        far.messages,
        ['The little dog drops an uncursed potion.'],
    );
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

// Register an object on the drop square the way place_object() would, on both
// the coordinate pile and the level object list, so that the merge path's
// remove_object() can find and unlink it.
function floorObject(gameState, overrides = {}) {
    const resident = object({
        where: OBJ_FLOOR,
        ox: DROP_X,
        oy: DROP_Y,
        oclass: FOOD_CLASS,
        quan: 1,
        ...overrides,
    });
    resident.nexthere = gameState.level.objects[DROP_X][DROP_Y] ?? null;
    gameState.level.objects[DROP_X][DROP_Y] = resident;
    resident.nobj = gameState.level.objlist ?? null;
    gameState.level.objlist = resident;
    return resident;
}

test('relobj empties the pack instead of dropping one object', async () => {
    // steal.c:892's `while` re-asks droppables() after every drop, so one
    // release puts down everything the selector still offers. The second apple
    // is cursed, which stops invent.c mergable() at its blessed/cursed test,
    // so both objects stay separately visible on the pile.
    //
    // No starting pet can hold two droppable objects, so this loop has no
    // recorded case; scripts/run-pet-drop.mjs states the source argument and
    // the scan behind it.
    const { carrier, held, gameState, env, messages } = dropFixture();
    const second = object({
        where: OBJ_MINVENT, oclass: FOOD_CLASS, quan: 1, cursed: true,
    });
    held.nobj = second;
    second.ocarry = carrier;

    await relobj(carrier, 0, true, env);

    assert.equal(carrier.minvent, null);
    assert.equal(held.where, OBJ_FLOOR);
    assert.equal(second.where, OBJ_FLOOR);
    // place_object() prepends, so the object dropped second is the pile head.
    assert.equal(gameState.level.objects[DROP_X][DROP_Y], second);
    assert.equal(second.nexthere, held);
    assert.deepEqual(messages, [
        'The little dog drops an uncursed apple.',
        'The little dog drops a cursed apple.',
    ]);
});

test('a drop onto an occupied square stacks above what is there', async () => {
    const { carrier, held, gameState, env } = dropFixture();
    // Cursed again, so stackobj() walks the whole pile and merges nothing.
    // quan 4 is any value the dropped object does not carry, so a merge that
    // wrongly happened would show up in both quantities.
    const resident = floorObject(gameState, { cursed: true, quan: 4 });

    await relobj(carrier, 0, true, env);

    assert.equal(gameState.level.objects[DROP_X][DROP_Y], held);
    assert.equal(held.nexthere, resident);
    assert.equal(gameState.level.objlist, held);
    assert.equal(held.nobj, resident);
    assert.equal(held.quan, 1);
    assert.equal(resident.quan, 4);
    assert.equal(resident.where, OBJ_FLOOR);
});

test('a drop merges into a compatible pile member', async () => {
    // Ages 10 and 20 are arbitrary and distinct, so the weighted average below
    // could not come out right by copying either one.
    const { carrier, held, gameState, env } = dropFixture({
        carried: { age: 10, o_id: 101 },
    });
    const resident = floorObject(gameState, { age: 20, quan: 2, o_id: 102 });

    await relobj(carrier, 0, true, env);

    // invent.c stackobj() passes the newly placed object as merged()'s first
    // argument, so the dropped object survives and the older pile member is
    // unlinked from both chains and freed.
    assert.equal(gameState.level.objects[DROP_X][DROP_Y], held);
    assert.equal(held.nexthere, null);
    assert.equal(gameState.level.objlist, held);
    assert.equal(held.nobj, null);
    assert.equal(held.quan, 3);
    // invent.c merged() averages the ages by quantity before it adds the
    // quantities: trunc((10 * 1 + 20 * 2) / (1 + 2)).
    assert.equal(held.age, 16);
    // objects.c gives an apple oc_weight 2, and weight() multiplies by quan.
    assert.equal(held.owt, 6);
    assert.notEqual(resident.where, OBJ_FLOOR);
    assert.equal(resident.nobj, null);
    assert.equal(resident.nexthere, null);
});

test('a drop merges past a pile member it cannot join', async () => {
    // invent.c stackobj() walks `nexthere` until merged() succeeds, so a pile
    // whose head refuses the merge does not stop the one below it. No pet drop
    // in a scan of 8,650 fresh D:1 walks met such a pile, so the branch has no
    // recorded case and this is its only cover.
    const { carrier, held, gameState, env } = dropFixture({
        carried: { age: 10 },
    });
    const mergeable = floorObject(gameState, { age: 20, quan: 2 });
    const blocker = floorObject(gameState, { cursed: true, quan: 1 });

    await relobj(carrier, 0, true, env);

    assert.equal(gameState.level.objects[DROP_X][DROP_Y], held);
    assert.equal(held.nexthere, blocker);
    assert.equal(blocker.nexthere, null);
    assert.equal(held.quan, 3);
    assert.equal(held.age, 16);
    assert.notEqual(mergeable.where, OBJ_FLOOR);
});

test('relobj stops on the vault guard arm that is not ported', async () => {
    const guard = dropFixture({ isgd: true });
    await assert.rejects(
        relobj(guard.carrier, 0, true, guard.env),
        (error) => error instanceof RefusedRelease
            && error.reason === "a vault guard's gold vanishing",
    );
    assert.equal(guard.held.where, OBJ_MINVENT);
});

// ── mdrop_obj() with an object the monster had equipped ──

// A helmet the monster wears, which is the mask the one recorded equipped
// drop carries: an orcish helm off a dead goblin, W_ARMH per prop.h:103.
const WORN_HELM = { owornmask: W_ARMH, oclass: ARMOR_CLASS, otyp: ORCISH_HELM };

test("a dead monster's worn armor lands on the floor", async () => {
    // The slice's common case: mon.c m_detach() forces mhp to 0 before its
    // relobj(), so DEADMONSTER() holds and mdrop_obj()'s 844 tail is skipped.
    const { carrier, held, gameState, env } = dropFixture({
        carried: WORN_HELM,
        // The helmet is the only thing worn, so misc_worn_check carries just
        // its bit and has to come back empty apart from I_SPECIAL.
        carrier: { mhp: 0, misc_worn_check: W_ARMH },
    });

    await relobj(carrier, 0, false, env);

    assert.equal(carrier.minvent, null);
    assert.equal(held.where, OBJ_FLOOR);
    assert.equal(held.ox, DROP_X);
    assert.equal(held.oy, DROP_Y);
    assert.equal(gameState.level.objects[DROP_X][DROP_Y], held);
    // worn.c extract_from_minvent():1403 clears owornmask, :1409 clears the
    // worn bit, and :1411 check_gear_next_turn() sets I_SPECIAL so the
    // monster reconsiders its gear on its next move.
    assert.equal(held.owornmask, 0);
    assert.equal(carrier.misc_worn_check, I_SPECIAL);
});

test('a surviving monster stops after the equipment reaches the floor',
    async () => {
        // steal.c:844 runs update_mon_extrinsics() only for !DEADMONSTER(),
        // and C orders it after place_object() deliberately. Both live hit
        // point counts refuse; 1 and 2 together pin the comparison rather
        // than only its boundary.
        for (const mhp of [1, 2]) {
            const alive = dropFixture({
                carried: WORN_HELM,
                carrier: { mhp, misc_worn_check: W_ARMH },
            });
            await assert.rejects(
                relobj(alive.carrier, 0, false, alive.env),
                (error) => error instanceof RefusedRelease
                    && error.reason
                        === 'a surviving monster losing gear it had equipped',
            );
            // The refusal sits at the tail, so the drop already happened.
            assert.equal(alive.held.where, OBJ_FLOOR);
            assert.equal(alive.carrier.misc_worn_check, I_SPECIAL);
        }
    });

test('a surviving monster dropping unworn gear does not reach that stop',
    async () => {
        // Same live monster, owornmask 0: steal.c:844's second conjunct keeps
        // an ordinary drop clear of the unported call.
        const { carrier, held, env } = dropFixture({
            carrier: { mhp: 1 },
        });

        await relobj(carrier, 0, false, env);

        assert.equal(held.where, OBJ_FLOOR);
        assert.equal(carrier.misc_worn_check, 0);
    });

test('a dropped wielded weapon stops on mwepgone', async () => {
    // worn.c extract_from_minvent():1413-1415 calls weapon.c mwepgone(), which
    // is unported. No monster in the running port wields anything, so this is
    // reached only through the unit path, and the refusal exists so that the
    // first widening of the wield boundary ends a segment rather than throwing.
    const wielder = dropFixture({
        // A stack of two. objnam.c doname_base():1571 takes the "(wielded)"
        // phrasing for any quan != 1, which keeps the name off body_part(HAND)
        // and out of the hero's form; nothing here turns on which phrasing the
        // name gets.
        carried: {
            owornmask: W_WEP,
            oclass: WEAPON_CLASS,
            otyp: ORCISH_DAGGER,
            quan: 2,
        },
        carrier: { mhp: 0, misc_worn_check: 0 },
    });

    await assert.rejects(
        relobj(wielder.carrier, 0, false, wielder.env),
        (error) => error instanceof RefusedRelease
            && error.reason === 'a monster dropping the weapon it wields',
    );
    // mwepgone() runs after obj_extract_self(), so the weapon has left minvent
    // but has not been placed.
    assert.equal(wielder.held.where, OBJ_FREE);
});

test('a dropped lamplit suit of armor stops before its light is ended',
    async () => {
        // worn.c extract_from_minvent():1399-1400 ends the light on a worn
        // object that artifact_light() recognizes, and js/worn.js asks for the
        // endArtifactLight hook there. mdrop_obj() supplies no such hook, so
        // something ahead of that arm has to stop this drop, and it is
        // steal.c:823's distant_name(): the port's doname() refuses any lamplit
        // worn object, which is wider than the arm's own W_ARM test, before
        // extract_from_minvent() is reached. Remove that refusal and this drop
        // throws worn.js's bare "worn requires endArtifactLight" Error, which
        // js/jsmain.js does not recognize as a boundary.
        const lit = dropFixture({
            // Gold dragon scale mail worn as W_ARM is what artifact.c
            // artifact_light():2268-2270 calls lit armor; nothing else a
            // monster can wear qualifies.
            carried: {
                owornmask: W_ARM,
                oclass: ARMOR_CLASS,
                otyp: GOLD_DRAGON_SCALE_MAIL,
                lamplit: true,
            },
            carrier: { mhp: 0, misc_worn_check: W_ARM },
        });

        await assert.rejects(
            relobj(lit.carrier, 0, false, lit.env),
            (error) => error instanceof UnsupportedObjectNameError
                && error.branch === 'lit worn-object suffix',
        );
        // The name is taken first, so the suit has not left minvent and still
        // carries the mask extract_from_minvent() would have read.
        assert.equal(lit.held.where, OBJ_MINVENT);
        assert.equal(lit.held.owornmask, W_ARM);
    });

// ── mdrop_obj()'s saddle no_charge exemption (steal.c 826-832) ──

// The smallest level shape shk.c costly_spot() calls billable, laid over the
// drop square: one shop room holding the drop square, the hero's square, and
// the shopkeeper's own square, with the resident recording that room number.
// The shopkeeper stands east of the carrier so that costly_spot()'s last test,
// which exempts the square the shopkeeper occupies, does not fire on the drop.
const SHOP_ROOMNO = ROOMOFFSET;
const KEEPER_X = DROP_X + 1;

// A second shop, for the case that separates membership from non-emptiness.
// The next room number after the one around the drop, on a square west of
// every square makeShopAroundDrop() lays down.
const OTHER_SHOP_ROOMNO = ROOMOFFSET + 1;
const OTHER_SHOP_X = DROP_X - 3;

function makeShopAroundDrop(gameState) {
    gameState.level.flags.has_shop = true;
    const squares = [[DROP_X, DROP_Y], [DROP_X - 1, DROP_Y], [KEEPER_X, DROP_Y]];
    for (const [x, y] of squares) {
        Object.assign(gameState.level.at(x, y), {
            typ: ROOM,
            roomno: SHOP_ROOMNO,
            edge: false,
        });
    }
    gameState.level.rooms[SHOP_ROOMNO - ROOMOFFSET] = {
        rtype: SHOPBASE,
        resident: {
            isshk: true,
            mx: KEEPER_X,
            my: DROP_Y,
            mextra: {
                eshk: {
                    shoproom: SHOP_ROOMNO,
                    shoplevel: { ...gameState.u.uz },
                    shk: { x: KEEPER_X, y: DROP_Y },
                },
            },
        },
    };
}

// A saddled tame steed dying on a shop square the hero is also inside. The
// `no_charge: false` on the saddle is what a shop's own stock carries; the
// exemption is what sets it.
function saddleFixture({ carried = {}, carrier = {} } = {}) {
    const fixture = dropFixture({
        carried: { owornmask: W_SADDLE, no_charge: false, ...carried },
        carrier: { mhp: 0, mtame: true, misc_worn_check: W_SADDLE, ...carrier },
    });
    makeShopAroundDrop(fixture.gameState);
    return fixture;
}

test("a dead steed's saddle is not charged for inside the hero's shop",
    async () => {
        const { carrier, held, env } = saddleFixture();

        await relobj(carrier, 0, false, env);

        assert.equal(held.where, OBJ_FLOOR);
        assert.equal(held.no_charge, true);
    });

test('every reachable conjunct of the saddle exemption is required',
    async () => {
        // steal.c:828-831 is a six-term conjunction. Each case below falsifies
        // exactly one term and leaves the rest as the passing case has them,
        // so dropping any of these terms fails here.
        const cases = [
            // unwornmask and (unwornmask & W_SADDLE) cannot be falsified apart
            // from each other: an unworn saddle has no W_SADDLE bit either.
            ['a saddle the steed was not wearing',
                { carried: { owornmask: 0 }, carrier: { misc_worn_check: 0 } }],
            // (unwornmask & W_SADDLE) alone: a helmet worn by the same tame
            // steed in the same shop is billed as usual.
            ['a worn mask that is not W_SADDLE',
                { carried: WORN_HELM, carrier: { misc_worn_check: W_ARMH } }],
            // mon->mtame: a hostile monster's saddle stays billable.
            ['an untamed carrier', { carrier: { mtame: false } }],
        ];

        for (const [name, overrides] of cases) {
            const fixture = saddleFixture(overrides);
            await relobj(fixture.carrier, 0, false, fixture.env);
            assert.equal(fixture.held.where, OBJ_FLOOR, name);
            assert.equal(fixture.held.no_charge, false, name);
        }

        // costly_spot(omx, omy): shk.c:5362 excludes the square the shopkeeper
        // occupies, so a drop there is uncharged before the exemption is asked.
        const onKeeper = saddleFixture();
        const keeper = onKeeper.gameState.level.rooms[0].resident;
        Object.assign(keeper, { mx: DROP_X, my: DROP_Y });
        Object.assign(keeper.mextra.eshk.shk, { x: DROP_X, y: DROP_Y });
        await relobj(onKeeper.carrier, 0, false, onKeeper.env);
        assert.equal(onKeeper.held.no_charge, false);

        // strchr(in_rooms(u.ux, u.uy, SHOPBASE), roomno): the hero has to be
        // inside the same shop. DROP_X - 2 is outside the three shop squares
        // makeShopAroundDrop() lays down, so in_rooms() answers nothing.
        const heroOutside = saddleFixture();
        heroOutside.gameState.u.ux = DROP_X - 2;
        await relobj(heroOutside.carrier, 0, false, heroOutside.env);
        assert.equal(heroOutside.held.no_charge, false);

        // The same conjunct with a non-empty answer: a hero standing in a
        // different shop. in_rooms() returns that shop's room number, so a
        // port that only asked whether the hero is in some shop would exempt
        // the saddle here; C's strchr() and this port's .includes() both ask
        // whether the drop square's own room is among them.
        const otherShop = saddleFixture();
        Object.assign(
            otherShop.gameState.level.at(OTHER_SHOP_X, DROP_Y),
            { typ: ROOM, roomno: OTHER_SHOP_ROOMNO, edge: false },
        );
        // in_rooms() reads a room's rtype through goodRoomType() and nothing
        // else, so the second shop needs no resident to be answered for
        // SHOPBASE.
        otherShop.gameState.level.rooms[OTHER_SHOP_ROOMNO - ROOMOFFSET] = {
            rtype: SHOPBASE,
        };
        otherShop.gameState.u.ux = OTHER_SHOP_X;
        await relobj(otherShop.carrier, 0, false, otherShop.env);
        assert.equal(otherShop.held.no_charge, false);
    });

test('an unpaid saddle stops before the exemption can read it', async () => {
    // The remaining conjunct, !obj->unpaid, cannot be reached as false. C's
    // mdrop_obj() names the object first, at steal.c:823, and objnam.c
    // doname_base()'s shop-price suffix has no port: js/objnam.js
    // preflightDoname() refuses any unpaid object. So no drop of an unpaid
    // saddle gets as far as steal.c:829, and this pins where it does stop.
    const unpaid = saddleFixture({ carried: { unpaid: true } });

    await assert.rejects(
        relobj(unpaid.carrier, 0, false, unpaid.env),
        /shop price suffix/u,
    );
    assert.equal(unpaid.held.where, OBJ_MINVENT);
});

test('a monster release needs an unsupported operation', async () => {
    const { carrier, env } = dropFixture();
    delete env.unsupported;
    await assert.rejects(
        relobj(carrier, 0, true, env),
        /monster object release requires an unsupported operation/u,
    );
});

// Ring_gone tests: C ref: do_wear.c Ring_off_or_gone() (1347-1446).
// Ring_gone is the gone=true path: setnotworn() is called instead of setworn(),
// and the ring-type-specific side effect runs.

import { Ring_gone } from '../js/do_wear.js';
import {
    OBJECT_TEMPLATES,
    RIN_PROTECTION,
    RIN_INCREASE_ACCURACY,
    RIN_INCREASE_DAMAGE,
    RIN_COLD_RESISTANCE,
} from '../js/objects.js';
import { A_CHA, LEFT_RING, RIGHT_RING, W_RING, W_RINGL, W_RINGR } from '../js/const.js';

function ringTestState() {
    // OBJECT_TEMPLATES is pre-frozen; it has each ring type's oc_oprop,
    // which is what Ring_off_or_gone reads to verify the extrinsic. No
    // RNG initialization needed.
    //
    // uprops is initialized as an array covering all 60 property indices;
    // setnotworn()'s property() accessor throws for a missing index, and
    // recalc_telepat_range reads TELEPAT (30). Each entry starts with zero
    // intrinsic/extrinsic/blocked so the ring's property can be set by the
    // test.
    const uprops = [];
    for (let i = 0; i < 60; i++) {
        uprops[i] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    }
    const s = {
        u: {
            ux: 5, uy: 5,
            uhitinc: 0,
            udaminc: 0,
            abon: { a: [0, 0, 0, 0, 0, 0, 0] },
            uprops,
            unblind_telepat_range: -1,
        },
        uwep: null,
        uswapwep: null,
        uquiver: null,
        uleft: null,
        uright: null,
        uarm: null,
        uarmc: null,
        uarmf: null,
        uarmg: null,
        uarmh: null,
        uarms: null,
        uarmu: null,
        invent: null,
        flags: {},
        iflags: {},
        disp: { botl: false },
        objects: [...OBJECT_TEMPLATES],
        level: { at: () => ({ roomno: 0 }) },
    };
    return s;
}

test('Ring_gone for RIN_PROTECTION clears the worn mask', () => {
    // Ring of protection: Ring_gone calls setnotworn(), then runs the
    // RIN_PROTECTION arm which calls learnring(observable) and find_ac()
    // when spe != 0. C ref: do_wear.c:1430-1437.
    //
    // spe is 0 so learnring's observable is false, and dknown is false
    // so neither discover_object() nor observe_object() runs; both need
    // the discovery list initialized, which is too heavy for a unit test.
    const s = ringTestState();
    const ring = object({
        otyp: RIN_PROTECTION,
        oclass: 33, /* RING_CLASS constant value */
        owornmask: W_RINGR,
        spe: 0,
        in_use: 0,
        known: false,
        dknown: false,
    });
    // Set up the extrinsic so Ring_off_or_gone's sanity check passes.
    const oc_oprop = OBJECT_TEMPLATES[RIN_PROTECTION].oc_oprop;
    s.u.uprops[oc_oprop] = { extrinsic: W_RINGR };
    s.uright = ring;

    Ring_gone(ring, s);

    // After Ring_gone, the owornmask should be cleared by setnotworn().
    assert.equal(ring.owornmask, 0,
        'owornmask cleared by setnotworn()');
    // uright should be cleared by setnotworn().
    assert.equal(s.uright, null,
        'uright cleared by setnotworn()');
});

test('Ring_gone for RIN_INCREASE_ACCURACY decrements uhitinc', () => {
    // C ref: do_wear.c:1424-1425. u.uhitinc -= obj->spe.
    const s = ringTestState();
    s.u.uhitinc = 3;
    const ring = object({
        otyp: RIN_INCREASE_ACCURACY,
        oclass: 33,
        owornmask: W_RINGL,
        spe: 2,
        in_use: 0,
    });
    const oc_oprop = OBJECT_TEMPLATES[RIN_INCREASE_ACCURACY].oc_oprop;
    s.u.uprops[oc_oprop] = { extrinsic: W_RINGL };
    s.uleft = ring;

    Ring_gone(ring, s);

    // uhitinc should decrease by spe (3 - 2 = 1).
    assert.equal(s.u.uhitinc, 1,
        'uhitinc decremented by ring spe');
});

test('Ring_gone for RIN_COLD_RESISTANCE (no-op type) clears mask only', () => {
    // Sixteen ring types have no side effect beyond the extrinsic that
    // setnotworn() clears. C ref: do_wear.c:1361-1378.
    const s = ringTestState();
    const ring = object({
        otyp: RIN_COLD_RESISTANCE,
        oclass: 33,
        owornmask: W_RINGR,
        spe: 0,
        in_use: 0,
    });
    const oc_oprop = OBJECT_TEMPLATES[RIN_COLD_RESISTANCE].oc_oprop;
    s.u.uprops[oc_oprop] = { extrinsic: W_RINGR };
    s.uright = ring;

    Ring_gone(ring, s);

    assert.equal(ring.owornmask, 0, 'owornmask cleared');
    assert.equal(s.uright, null, 'uright cleared');
});
