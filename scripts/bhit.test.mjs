// zap.c bhit(), the flight of a thrown missile: where it stops, what it draws
// on the way, and which of the branches along its path this port refuses.
// dothrow.c throwit() is its only ported caller and always passes
// THROWN_WEAPON with both callbacks null.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO,
    IRONBARS,
    KICKED_WEAPON,
    LAVAWALL,
    ROOM,
    SINK,
    THROWN_WEAPON,
    WATER,
    WEB,
    ZAPPED_WAND,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { UnsupportedBhitError, bhit } from '../js/zap.js';
import { initialize_symbols_from_options } from '../js/symbols.js';
import { monst_globals_init } from '../js/monsters.js';
import { newObject } from '../js/obj.js';
import { init_objects } from '../js/o_init.js';
import { objects_globals_init } from '../js/objects.js';
import { resetGame } from '../js/gstate.js';
import {
    ARROW,
    HEAVY_IRON_BALL,
    OIL_LAMP,
    PICK_AXE,
    ROCK,
} from '../js/objects.js';

// A straight run of floor at row 4 from column 1 to `last`, with the hero at
// column 1 and everything in sight. Column `last + 1` stays STONE, which is
// what stops a missile that outlives its targets.
function corridor(last = 6) {
    const state = resetGame();
    state.level = new GameMap();
    for (let x = 1; x <= last; x++) state.level.at(x, 4).typ = ROOM;
    state.u = { ux: 1, uy: 4, umonnum: 0, uz: { dnum: 0, dlevel: 1 } };
    state.flags = {};
    state.iflags = {};
    monst_globals_init(state);
    objects_globals_init(state);
    // xname() enters the named type in the discoveries list, which needs the
    // per-class bases init_objects() builds. The constant rn2 keeps its
    // description shuffle off the game RNG.
    init_objects(state, () => 0);
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    state.viz_array[4] = [];
    for (let x = 0; x <= last + 1; x++) state.viz_array[4][x] = 0x2;
    return state;
}

function missile(state, otyp = ARROW, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        owornmask: 0,
        ...overrides,
    });
}

function fireEast(state, range, obj) {
    return bhit(1, 0, range, THROWN_WEAPON, null, null, { obj }, state);
}

test('bhit() stops on the last passable square and reports no monster', async () => {
    // zap.c:4076-4080. `!ZAP_POS(typ)` backs gb.bhitpos up one square, so the
    // missile lands on the last floor it crossed rather than inside the rock.
    const state = corridor(4);
    assert.equal(await fireEast(state, 8, missile(state)), null);
    assert.deepEqual(state.bhitpos, { x: 4, y: 4 });
    // A range that runs out first stops where the range does.
    const short = corridor(6);
    await fireEast(short, 2, missile(short));
    assert.deepEqual(short.bhitpos, { x: 3, y: 4 });
    // zap.c:4098. `range-- > 0` is a post-decrement, so a range of 1 moves
    // exactly one square.
    const one = corridor(6);
    await fireEast(one, 1, missile(one));
    assert.deepEqual(one.bhitpos, { x: 2, y: 4 });
});

test('bhit() stops at a wall of water or lava without backing up', async () => {
    // zap.c:3894-3898. That break is above the two lines that subtract the
    // step, so the position stays on the water square itself.
    for (const typ of [WATER, LAVAWALL]) {
        const state = corridor(6);
        state.level.at(3, 4).typ = typ;
        await fireEast(state, 8, missile(state));
        assert.deepEqual(state.bhitpos, { x: 3, y: 4 });
    }
    // A sink stops it too, but only after the square has been drawn on
    // (zap.c:4093-4094), so the missile lands there rather than before it.
    const sink = corridor(6);
    sink.level.at(3, 4).typ = SINK;
    await fireEast(sink, 8, missile(sink));
    assert.deepEqual(sink.bhitpos, { x: 3, y: 4 });
});

test('bhit() refuses every call type but a thrown weapon', async () => {
    // zap.c's other four call types reach zap_map(), bhitpile(),
    // flash_hits_mon() or hits_bars(); dothrow.c throwit() is the one ported
    // caller and always passes THROWN_WEAPON with both callbacks null.
    const state = corridor();
    for (const weapon of [ZAPPED_WAND, KICKED_WEAPON]) {
        await assert.rejects(
            () => bhit(1, 0, 4, weapon, null, null,
                { obj: missile(state) }, state),
            UnsupportedBhitError,
        );
    }
    await assert.rejects(
        () => bhit(1, 0, 4, THROWN_WEAPON, () => 0, null,
            { obj: missile(state) }, state),
        /an object or monster callback/u,
    );
    await assert.rejects(
        () => bhit(1, 0, 4, THROWN_WEAPON, null, () => 0,
            { obj: missile(state) }, state),
        /an object or monster callback/u,
    );
});

test('bhit() refuses the four branches along the flight it cannot finish',
    async () => {
        // Each stops at its own square, so the ones before it have already
        // been drawn and the ones after are never reached.
        const lit = corridor(6);
        await assert.rejects(
            () => fireEast(lit, 4, missile(lit, OIL_LAMP, { lamplit: 1 })),
            /show_transient_light/u,
        );
        const bars = corridor(6);
        bars.level.at(3, 4).typ = IRONBARS;
        await assert.rejects(
            () => fireEast(bars, 4, missile(bars)), /hits_bars/u,
        );
        const ball = corridor(6);
        await assert.rejects(
            () => fireEast(ball, 4, missile(ball, HEAVY_IRON_BALL)),
            /heavy iron ball/u,
        );
        // zap.c:4121. The ball arm is guarded by `range > 0`, so a ball that
        // has just spent its last step lands instead of stopping the segment.
        const spent = corridor(6);
        await fireEast(spent, 1, missile(spent, HEAVY_IRON_BALL));
        assert.deepEqual(spent.bhitpos, { x: 2, y: 4 });
        // A pick-axe is only caught inside a shop, and nothing here is one.
        const pick = corridor(6);
        assert.equal(await fireEast(pick, 4, missile(pick, PICK_AXE)), null);
    });

test('bhit() draws for a rock and asks whether it may skip', async () => {
    // zap.c:3855-3858. skiprange() and its rn2(3) run for a thrown rock and
    // for nothing else, whether or not any water lies ahead, so the draws are
    // part of the stream either way.
    const draws = [];
    const random = {
        rn2: (n) => { draws.push(`rn2(${n})`); return 1; },
        rnd: (n) => { draws.push(`rnd(${n})`); return 1; },
    };
    const rock = corridor(6);
    await bhit(1, 0, 8, THROWN_WEAPON, null, null,
        { obj: missile(rock, ROCK) }, rock, random);
    assert.deepEqual(draws, ['rnd(2)', 'rnd(3)', 'rn2(3)']);
    // An arrow draws nothing at all.
    draws.length = 0;
    const arrow = corridor(6);
    await bhit(1, 0, 8, THROWN_WEAPON, null, null,
        { obj: missile(arrow, ARROW) }, arrow, random);
    assert.deepEqual(draws, []);
});

test('bhit() catches a missile in a web on two draws out of three', async () => {
    // zap.c:3931-3944. The web arm needs an empty square, a WEB trap and
    // `!rn2(3)` to be false, and it breaks without backing the position up.
    const web = corridor(6);
    web.level.traps = [{ tx: 3, ty: 4, ttyp: WEB, tseen: false }];
    const seen = [];
    const random = { rn2: (n) => { seen.push(n); return 2; }, rnd: () => 1 };
    await bhit(1, 0, 8, THROWN_WEAPON, null, null,
        { obj: missile(web, ARROW) }, web, random);
    assert.deepEqual(seen, [3]);
    assert.deepEqual(web.bhitpos, { x: 3, y: 4 });
    assert.equal(web.level.traps[0].tseen, true);
    // The one draw in three that answers 0 lets the missile fly past.
    const through = corridor(6);
    through.level.traps = [{ tx: 3, ty: 4, ttyp: WEB, tseen: false }];
    await bhit(1, 0, 8, THROWN_WEAPON, null, null,
        { obj: missile(through, ARROW) }, through,
        { rn2: () => 0, rnd: () => 1 });
    assert.deepEqual(through.bhitpos, { x: 6, y: 4 });
    assert.equal(through.level.traps[0].tseen, false);
});

test('bhit() stops when a monster stands in the flight path', async () => {
    // zap.c:3990-4001 leads to dothrow.c thitmonst(), which is unported, and
    // the tests just above it can clear the monster and let the missile fly
    // on -- so this stops before any of them rather than inside the arm.
    const state = corridor(6);
    // js/monst.js m_at() reads level.monsters as a column-major grid.
    state.level.monsters[3][4] = { mx: 3, my: 4, data: state.mons[0] };
    await assert.rejects(
        () => fireEast(state, 8, missile(state)), /thitmonst/u,
    );
    // With the same monster one square further on, the missile crosses the
    // squares before it first, so the position reports how far it got.
    const past = corridor(6);
    past.level.monsters[5][4] = { mx: 5, my: 4, data: past.mons[0] };
    await assert.rejects(() => fireEast(past, 8, missile(past)), /thitmonst/u);
    assert.deepEqual(past.bhitpos, { x: 5, y: 4 });
});

test('bhit() treats solid rock beyond the map edge as the end of the run',
    async () => {
        // zap.c:3874-3878. isok() fails past column 79, and the two lines
        // under it put the position back on the last square inside the map.
        // COLNO is 80, so column 79 is the last one isok() admits.
        const state = corridor(6);
        for (let x = 1; x < COLNO; x++) {
            state.level.at(x, 4).typ = ROOM;
            state.viz_array[4][x] = 0x2;
        }
        state.u.ux = COLNO - 4;
        await bhit(1, 0, 8, THROWN_WEAPON, null, null,
            { obj: missile(state) }, state);
        assert.deepEqual(state.bhitpos, { x: COLNO - 1, y: 4 });
    });
