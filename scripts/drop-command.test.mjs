import assert from 'node:assert/strict';
import test from 'node:test';

import { reset_trapset } from '../js/apply.js';
import { reset_occupations } from '../js/cmd.js';
import {
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    OBJ_FLOOR,
    OBJ_INVENT,
    PIT,
    ROOM,
    SINK,
    W_ARMS,
    W_SADDLE,
} from '../js/const.js';
import {
    UnsupportedDropError, _dropInternals, canletgo, dodrop,
} from '../js/do.js';
import { game } from '../js/gstate.js';
import { any_obj_ok } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { stairway_at } from '../js/stairs.js';
import {
    FOOD_CLASS, GEM_CLASS, LEASH, LOADSTONE, MEAT_RING, RING_CLASS,
    RIN_PROTECTION, SPEAR, WEAPON_CLASS,
} from '../js/objects.js';
import {
    DROP_CASES,
    LOADSTONE_CASE,
    MEATRING_CASE,
    MERGE_CASE,
    QUIET_RC,
    loadDropCommandRecipe,
    loadDropLoadstoneRecipe,
    loadDropMeatRingRecipe,
    loadDropMergeRecipe,
} from './run-drop-command.mjs';

// The three recipes are the only record of which C branches were recorded, so
// a silent re-recording that lost one has to fail here.
test('the drop matrix keeps replay inputs only', () => {
    for (const recipe of [
        loadDropCommandRecipe(),
        loadDropLoadstoneRecipe(),
        loadDropMeatRingRecipe(),
        loadDropMergeRecipe(),
    ]) {
        // Version 5 recipes contain replay inputs and no recorded C answers.
        assert.equal(recipe.version, 5);
        assert.ok(recipe.segments.every(
            (segment) => !Object.hasOwn(segment, 'steps'),
        ));
    }
});

test('the drop matrix covers every do.c drop() slot arm', () => {
    // do.c:722-734 clears three equipment slots, one `if` each. A case that
    // stopped reaching one of them would leave that clear unexercised.
    assert.deepEqual(
        DROP_CASES.map((entry) => entry.slot).filter(Boolean).sort(),
        ['uquiver', 'uswapwep', 'uwep'],
    );
    // Two of the seven refuse without spending a turn: the escaped prompt and
    // the worn shield. The other five land an object on the floor.
    assert.equal(
        DROP_CASES.filter((entry) => entry.floor === null).length, 2,
    );
    assert.equal(LOADSTONE_CASE.floor, null);
    assert.equal(MEATRING_CASE.floor, 'e');
    assert.equal(MERGE_CASE.mergedQuantity, 2);
    // Every case ends with a rest, so a wrongly spent turn shifts a screen.
    for (const recipe of [
        loadDropCommandRecipe(),
        loadDropLoadstoneRecipe(),
        loadDropMeatRingRecipe(),
        loadDropMergeRecipe(),
    ]) {
        assert.ok(recipe.segments.every(({ moves }) => moves.endsWith('.')));
    }
    // The seed list is the separate tripwire for a silent re-recording.
    assert.deepEqual(
        loadDropCommandRecipe().segments.map(({ seed }) => seed),
        [4410001, 4410001, 4410001, 4410001, 4410001, 4410002, 4410002],
    );
});

// C ref: invent.c any_obj_ok() (1709-1715).
test('any_obj_ok suggests every object and excludes the hands', () => {
    // The callback never inspects the object, so one stand-in covers every
    // carried object; only the null hands/self choice takes the other arm.
    assert.equal(any_obj_ok({ otyp: 1 }), GETOBJ_SUGGEST);
    assert.equal(any_obj_ok(null), GETOBJ_EXCLUDE);
});

// C ref: apply.c reset_trapset() (2812-2817).
test('reset_trapset clears the armed trap and its bungle flag', () => {
    const state = { gt: { trapinfo: { tobj: { otyp: 1 }, force_bungle: true } } };
    reset_trapset(state);
    assert.deepEqual(state.gt.trapinfo, { tobj: null, force_bungle: false });
});

// C ref: cmd.c reset_occupations() (194-200). One assertion per call it makes,
// so dropping any one of the three fails this test.
test('reset_occupations clears all three interrupted occupations', () => {
    const state = {
        context: { takeoff: { mask: W_ARMS } },
        gt: { trapinfo: { tobj: { otyp: 1 }, force_bungle: true } },
        // lock.c reset_pick() clears six fields; each is set here so a partial
        // clear is visible.
        xlock: {
            usedtime: 7,
            chance: 33,
            picktyp: 1,
            magic_key: true,
            door: { typ: 1 },
            box: { otyp: 2 },
        },
    };

    reset_occupations(state);

    assert.equal(state.context.takeoff.mask, 0);
    assert.deepEqual(state.xlock, {
        usedtime: 0,
        chance: 0,
        picktyp: 0,
        magic_key: false,
        door: null,
        box: null,
    });
    assert.deepEqual(state.gt.trapinfo, { tobj: null, force_bungle: false });
});

// C ref: do.c canletgo() (664-711). Every arm is guarded by `if (*word)`, so
// the empty verb C's silent callers pass reaches each `return FALSE` with
// nothing printed. That is what lets one state cover all five arms.
function letGoState(overrides = {}) {
    return { u: {}, flags: { verbose: true }, ...overrides };
}

test('canletgo refuses each object it cannot be let go of', async () => {
    const cases = [
        // do.c:667, a worn piece. W_ARMS is one of the W_ARMOR bits.
        ['worn armor', { owornmask: W_ARMS }, {}],
        // do.c:672, the welded weapon. welded() answers TRUE only for the
        // wielded object, so uwep has to be this one.
        ['welded weapon', { otyp: SPEAR, oclass: WEAPON_CLASS, cursed: true },
            (obj) => ({ uwep: obj })],
        // do.c:685, a cursed loadstone.
        ['cursed loadstone', { otyp: LOADSTONE, cursed: true, quan: 1 }, {}],
        // do.c:700, a leash with a pet on the other end.
        ['tied leash', { otyp: LEASH, leashmon: 42 }, {}],
        // do.c:705, the saddle the hero is sitting on.
        ['worn saddle', { owornmask: W_SADDLE }, {}],
    ];
    for (const [name, fields, extra] of cases) {
        const obj = { otyp: 1, oclass: 0, owornmask: 0, quan: 1, ...fields };
        const state = letGoState(
            typeof extra === 'function' ? extra(obj) : extra,
        );
        assert.equal(await canletgo(obj, '', state), false, name);
        // The silent verb writes no message, which is what makes the answer
        // above the only thing the arm produced.
        assert.equal(state._ttyToplines, undefined, name);
    }
});

test('canletgo lets go of everything else', async () => {
    // The same object minus the one field that refused it. Each of these
    // would be refused if its arm tested the wrong half of its condition.
    for (const [name, fields] of [
        ['plain object', {}],
        // do.c:685 needs both the type and the curse.
        ['uncursed loadstone', { otyp: LOADSTONE, cursed: false }],
        ['cursed non-loadstone', { otyp: SPEAR, cursed: true }],
        // do.c:700 needs the leash to have a monster on it.
        ['unleashed leash', { otyp: LEASH, leashmon: 0 }],
        // do.c:672 needs the object to be the wielded one; a cursed weapon
        // lying in the pack is not welded to anything.
        ['cursed weapon not wielded',
            { otyp: SPEAR, oclass: WEAPON_CLASS, cursed: true }],
    ]) {
        const obj = { otyp: 1, oclass: 0, owornmask: 0, quan: 1, ...fields };
        assert.equal(await canletgo(obj, '', letGoState()), true, name);
    }
});

// C ref: do.c canletgo() (688-695), the loadstone message and the corpsenm
// kludge getobj() shares with it. The count getobj() would have parked in
// corpsenm is zero here, because get_count() is unported, so only the verb and
// the quantity move.
test('the cursed loadstone message names the verb and the count', async () => {
    for (const [word, quan, expected] of [
        // "drop" is not "throw", so the kludge does not fire whatever the
        // quantity is, and plur() alone changes with it.
        ['drop', 1, 'For some reason, you cannot drop the stone!'],
        ['drop', 2, 'For some reason, you cannot drop the stones!'],
        // do.c:691 fires for "throw" only above one stone.
        ['throw', 1, 'For some reason, you cannot throw the stone!'],
        ['throw', 2, 'For some reason, you cannot throw any of the stones!'],
    ]) {
        const obj = {
            otyp: LOADSTONE, oclass: GEM_CLASS, cursed: true, quan,
            corpsenm: 0, owornmask: 0, where: OBJ_INVENT,
        };
        const state = letGoState();
        assert.equal(await canletgo(obj, word, state), false);
        assert.equal(state._ttyToplines, expected, `${word} x${quan}`);
        // do.c:696 puts corpsenm back whichever branch set it.
        assert.equal(obj.corpsenm, 0);
        // do.c:697 teaches the hero the stone is cursed.
        assert.equal(obj.bknown, 1);
    }
});

// C ref: do.c dodrop() (33-34). sellobj_state() is unported, so a hero
// standing in a shop stops before getobj() can draw anything.
test('dodrop stops inside a shop before the prompt draws', async () => {
    // hack.c move_update() writes u.ushops as a room list; a nonzero first
    // entry is C's nonempty string.
    const inShop = { u: { ushops: [3, 0, 0, 0, 0] } };
    await assert.rejects(
        () => dodrop(inShop),
        (error) => error instanceof UnsupportedDropError
            && /sellobj_state/u.test(error.message),
    );
    // An empty list must not take that arm; reaching getobj() with this stub
    // state fails for a different reason than the shop refusal.
    const outside = { u: { ushops: [0, 0, 0, 0, 0] } };
    await assert.rejects(
        () => dodrop(outside),
        (error) => !(error instanceof UnsupportedDropError),
    );
});

const VALKYRIE_SEGMENT = loadDropCommandRecipe().segments[0];

async function playDrop(keys) {
    let boundary = null;
    await runSegment(
        { ...VALKYRIE_SEGMENT, moves: ` ${keys}` },
        { onBoundary: (error) => { boundary = error; } },
    );
    return { boundary, state: game };
}

function letters(state) {
    const result = [];
    for (let obj = state.invent; obj; obj = obj.nobj) result.push(obj.invlet);
    return result.join('');
}

function pileAt(state, x, y) {
    const pile = [];
    for (let obj = state.level.objects[x]?.[y] ?? null; obj; obj = obj.nexthere)
        pile.push(obj);
    return pile;
}

// C ref: do.c dodrop() (39-40). ECMD_FAIL is 0x04, so `if (result)` is true
// for the cancelled drop and reset_occupations() runs even though no turn
// elapsed. Each of the three contexts below is created by the function that
// clears it, and nothing else in this segment creates any of them, so their
// mere presence is what proves the call happened.
test('a cancelled drop resets the occupations and spends no turn', async () => {
    const rested = await playDrop('.');
    assert.equal(rested.boundary, null);
    assert.equal(rested.state.context.takeoff, undefined);
    assert.equal(rested.state.xlock, undefined);
    assert.equal(rested.state.gt?.trapinfo, undefined);
    const restedMoves = rested.state.moves;
    const pack = letters(rested.state);

    const cancelled = await playDrop('d\x1b.');
    assert.equal(cancelled.boundary, null);
    assert.equal(cancelled.state.context.takeoff.mask, 0);
    assert.equal(cancelled.state.xlock.usedtime, 0);
    assert.deepEqual(
        cancelled.state.gt.trapinfo, { tobj: null, force_bungle: false },
    );
    // The cancelled command is free, so the same trailing rest leaves the
    // turn counter where the bare rest did.
    assert.equal(cancelled.state.moves, restedMoves);
    assert.equal(letters(cancelled.state), pack);
    assert.equal(
        pileAt(cancelled.state, cancelled.state.u.ux, cancelled.state.u.uy)
            .length,
        0,
    );
    // _ttyToplines is the last line written, which for a cancel is C's
    // Never_mind from invent.c:1952.
    assert.equal(cancelled.state._ttyToplines, 'Never mind.');
});

// C ref: do.c drop() (774-778). The verbose message names the object with
// doname(), and dropx() then moves it to the square the hero stands on.
test('a carried object lands on the square with its message', async () => {
    const { boundary, state } = await playDrop('dd.');
    assert.equal(boundary, null);
    assert.equal(state._ttyToplines, 'You drop an uncursed food ration.');
    const pile = pileAt(state, state.u.ux, state.u.uy);
    assert.equal(pile.length, 1);
    assert.equal(pile[0].where, OBJ_FLOOR);
    // do.c:777 records how the object left the pack.
    assert.equal(pile[0].how_lost, 2 /* LOST_DROPPED */);
    assert.ok(!letters(state).includes('d'));
});

// C ref: do.c drop() (722-728). The wielded weapon leaves its slot before it
// leaves the pack, and worn.c setworn() clears its mask.
test('the wielded weapon leaves the weapon slot', async () => {
    const { boundary, state } = await playDrop('da.');
    assert.equal(boundary, null);
    assert.equal(state.uwep, null);
    const pile = pileAt(state, state.u.ux, state.u.uy);
    assert.equal(pile.length, 1);
    assert.equal(pile[0].owornmask, 0);
    // u_init.c:161 gives the Valkyrie a blessed +1 spear, and it is no longer
    // wielded when doname() names it, so no "(weapon in hand)" suffix.
    assert.equal(state._ttyToplines, 'You drop a blessed +1 spear.');
});

// C ref: do.c canletgo() (667-671), through the Norep at :669 with
// `something` from decl.c:45.
test('a worn piece is refused and stays worn', async () => {
    const { boundary, state } = await playDrop('dc.');
    // canletgo() answering TRUE here would send the shield into dropx(),
    // whose admission refuses a worn object and ends the segment.
    assert.equal(boundary, null);
    assert.equal(
        state._ttyToplines, 'You cannot drop something you are wearing.',
    );
    assert.equal(
        pileAt(state, state.u.ux, state.u.uy).length, 0,
    );
    assert.equal(state.uarms.owornmask, W_ARMS);
});

// C ref: do.c drop() (753-757). The sink arm tests the object first and the
// square second. Away from a sink a ring has to fall through to the ordinary
// drop; a meat ring is the type that satisfies the object half through its
// otyp rather than its class, because it is FOOD_CLASS.
test('a meat ring away from a sink reaches the ordinary drop', async () => {
    const segment = loadDropMeatRingRecipe().segments[0];
    let boundary = null;
    await runSegment(segment, { onBoundary: (error) => { boundary = error; } });
    // dosinkring() is a refusal, so taking the sink arm here would end the
    // segment instead of landing the ring.
    assert.equal(boundary, null);
    assert.equal(game._ttyToplines, 'You drop a meat ring.');
    const pile = pileAt(game, game.u.ux, game.u.uy);
    assert.equal(pile.length, 1);
    assert.equal(pile[0].otyp, MEAT_RING);
    assert.ok(!letters(game).includes('e'));
});

// C ref: do.c drop() (752-773). Both terrain arms refuse, and each has to
// refuse for its own reason: taking the wrong one would let a ring reach the
// square admission instead of dosinkring(), or send a hero who cannot reach
// the floor through the ordinary drop.
test('drop refuses the sink and the unreachable floor by square', async () => {
    // A real started game, so can_reach_floor() has the hero form it needs
    // and levl[][] is the map the port generated.
    await runSegment({ ...VALKYRIE_SEGMENT, moves: ' ' });
    const state = game;
    // The hero starts on the up staircase, which the square admission admits
    // whatever the terrain is. Stand her on an ordinary neighbour instead, so
    // the sink below is the only thing that square has.
    const neighbour = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => ({ x: state.u.ux + dx, y: state.u.uy + dy }))
        .find(({ x, y }) => state.level.at(x, y).typ === ROOM
            && !stairway_at(x, y, state));
    assert.ok(neighbour, 'the hero has no ordinary neighbouring square');
    state.u.ux = neighbour.x;
    state.u.uy = neighbour.y;
    const { ux, uy } = state.u;
    // The starting food ration: a real inventory object, so the arms past the
    // sink reach doname() and the square admission with everything they read.
    let plain = state.invent;
    while (plain && plain.invlet !== 'd') plain = plain.nobj;
    assert.ok(plain, 'the pack has no food ration');

    // do.c:753's two halves: the class, and the one FOOD_CLASS type that is
    // still a ring.
    state.level.at(ux, uy).typ = SINK;
    for (const ring of [
        { otyp: RIN_PROTECTION, oclass: RING_CLASS, owornmask: 0, quan: 1 },
        { otyp: MEAT_RING, oclass: FOOD_CLASS, owornmask: 0, quan: 1 },
    ]) {
        await assert.rejects(
            () => _dropInternals.drop(ring, state),
            /dosinkring/u,
        );
    }
    // Anything else on the same square falls past the sink arm and is
    // refused by the square admission instead.
    await assert.rejects(
        () => _dropInternals.drop(plain, state),
        /non-ordinary terrain/u,
    );

    // do.c:758. A seen pit the hero is standing beside rather than in makes
    // trap.c uteetering_at_seen_pit() true, which is the only thing
    // can_reach_floor()'s checkPit argument changes.
    state.level.at(ux, uy).typ = ROOM;
    state.level.traps.push({ tx: ux, ty: uy, ttyp: PIT, tseen: true });
    await assert.rejects(
        () => _dropInternals.drop(plain, state),
        /hitfloor/u,
    );
});

// C ref: do.c drop() (774). With flags.verbose off the object still lands but
// the drop says nothing, so the prompt the player answered is the last line
// written. This is a port-level check rather than a recorded case: the C
// terminal keeps that prompt row and this port blanks it, which the deferred
// entry drop-prompt-row-lost-without-a-following-message carries.
test('a drop with verbose off lands the object and says nothing', async () => {
    let boundary = null;
    await runSegment(
        { ...VALKYRIE_SEGMENT, nethackrc: QUIET_RC, moves: ' dd.' },
        { onBoundary: (error) => { boundary = error; } },
    );
    assert.equal(boundary, null);
    assert.equal(game.flags.verbose, false);
    assert.equal(
        game._ttyToplines, 'What do you want to drop? [abcd or ?*] d',
    );
    assert.equal(pileAt(game, game.u.ux, game.u.uy).length, 1);
    assert.ok(!letters(game).includes('d'));
});

// C ref: invent.c getobj() (1937-1949). C consults `allowcnt` only once a
// digit has been typed, so the prompt has to draw first and only then does
// the unported get_count() stop the command.
test('a count at the drop prompt stops after the prompt has drawn', async () => {
    const { boundary, state } = await playDrop('d2');
    assert.match(boundary.message, /get_count\(\) and splitobj\(\)/u);
    // Four suggested letters stay uncompacted; invent.c:1908 only calls
    // compactify() above five. The digit is the echo yn_function() made
    // before get_count() would have read the rest of the number.
    assert.equal(
        state._ttyToplines, 'What do you want to drop? [abcd or ?*] 2',
    );
    // Nothing left the pack behind the refusal.
    assert.equal(letters(state), 'abcd');
    assert.equal(pileAt(state, state.u.ux, state.u.uy).length, 0);
});
