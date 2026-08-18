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
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    ROOM,
    SINK,
    THROWN_WEAPON,
    WATER,
    WEB,
    ZAPPED_WAND,
} from '../js/const.js';
import { GLYPH_INVISIBLE, glyph_is_invisible } from '../js/display.js';
import { GameMap } from '../js/game.js';
import { UnsupportedBhitError, bhit } from '../js/zap.js';
import { initialize_symbols_from_options } from '../js/symbols.js';
import { PM_SHADE, monst_globals_init } from '../js/monsters.js';
import { newObject } from '../js/obj.js';
import { init_objects } from '../js/o_init.js';
import { objects_globals_init } from '../js/objects.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
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
    assert.deepEqual(state.gb.bhitpos, { x: 4, y: 4 });
    // A range that runs out first stops where the range does.
    const short = corridor(6);
    await fireEast(short, 2, missile(short));
    assert.deepEqual(short.gb.bhitpos, { x: 3, y: 4 });
    // zap.c:4098. `range-- > 0` is a post-decrement, so a range of 1 moves
    // exactly one square.
    const one = corridor(6);
    await fireEast(one, 1, missile(one));
    assert.deepEqual(one.gb.bhitpos, { x: 2, y: 4 });
});

test('bhit() stops at a wall of water or lava without backing up', async () => {
    // zap.c:3894-3898. That break is above the two lines that subtract the
    // step, so the position stays on the water square itself.
    for (const typ of [WATER, LAVAWALL]) {
        const state = corridor(6);
        state.level.at(3, 4).typ = typ;
        await fireEast(state, 8, missile(state));
        assert.deepEqual(state.gb.bhitpos, { x: 3, y: 4 });
    }
    // A sink stops it too, but only after the square has been drawn on
    // (zap.c:4093-4094), so the missile lands there rather than before it.
    const sink = corridor(6);
    sink.level.at(3, 4).typ = SINK;
    await fireEast(sink, 8, missile(sink));
    assert.deepEqual(sink.gb.bhitpos, { x: 3, y: 4 });
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
        assert.deepEqual(spent.gb.bhitpos, { x: 2, y: 4 });
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

test('bhit() catches a missile in a web on one draw in three', async () => {
    // zap.c:3928-3939. The web arm needs an empty square, a WEB trap and
    // `!rn2(3)` to be true -- that is, rn2(3) == 0, the one draw in three --
    // and it breaks without backing the position up.
    const web = corridor(6);
    web.level.traps = [{ tx: 3, ty: 4, ttyp: WEB, tseen: false }];
    const seen = [];
    const random = { rn2: (n) => { seen.push(n); return 0; }, rnd: () => 1 };
    await bhit(1, 0, 8, THROWN_WEAPON, null, null,
        { obj: missile(web, ARROW) }, web, random);
    assert.deepEqual(seen, [3]);
    assert.deepEqual(web.gb.bhitpos, { x: 3, y: 4 });
    assert.equal(web.level.traps[0].tseen, true);
    // The two draws in three that answer nonzero let the missile fly past.
    for (const draw of [1, 2]) {
        const through = corridor(6);
        through.level.traps = [{ tx: 3, ty: 4, ttyp: WEB, tseen: false }];
        await bhit(1, 0, 8, THROWN_WEAPON, null, null,
            { obj: missile(through, ARROW) }, through,
            { rn2: () => draw, rnd: () => 1 });
        assert.deepEqual(through.gb.bhitpos, { x: 6, y: 4 });
        assert.equal(through.level.traps[0].tseen, false);
    }
});

test('bhit() hands a monster in the flight path back to its caller',
    async () => {
        // zap.c:4021-4029, the `weapon != ZAPPED_WAND` arm. It ends the flight
        // and returns the monster; deciding what hits it is the caller's, and
        // the two callers reach different C functions -- thitmonst() through
        // dothrow.c throwit_mon_hit():1492 and dokick.c ghitm() from
        // throw_gold():2712.
        const state = corridor(6);
        // js/monst.js m_at() reads level.monsters as a column-major grid.
        const adjacent = { mx: 3, my: 4, data: state.mons[0] };
        state.level.monsters[3][4] = adjacent;
        assert.equal(await fireEast(state, 8, missile(state)), adjacent);
        assert.deepEqual(state.gb.bhitpos, { x: 3, y: 4 });
        // zap.c:4023-4024 ends the transient beam before the `goto bhit_done`,
        // and this arm returns rather than falling through to the DISP_END at
        // the foot of the function, so it is the only one that runs. An unended
        // frame would be left on the stack for whatever draws next.
        assert.deepEqual(state.tmp_at_stack, []);

        // With the same monster one square further on, the missile crosses the
        // squares before it first, so the position reports how far it got.
        const past = corridor(6);
        const further = { mx: 5, my: 4, data: past.mons[0] };
        past.level.monsters[5][4] = further;
        assert.equal(await fireEast(past, 8, missile(past)), further);
        assert.deepEqual(past.gb.bhitpos, { x: 5, y: 4 });
    });

test('bhit() records whether the missile stopped away from the head',
    async () => {
        // zap.c:3995. gn.notonhead compares the square the flight stopped on
        // with the monster's own square; they differ for a long worm's tail,
        // which m_at() answers for from anywhere along the worm.
        const head = corridor(6);
        head.level.monsters[3][4] = { mx: 3, my: 4, data: head.mons[0] };
        await fireEast(head, 8, missile(head));
        assert.equal(head.gn.notonhead, false);

        // The tail one square east of a head the hero can still spot.
        const tail = corridor(6);
        tail.level.monsters[3][4] = { mx: 2, my: 4, data: tail.mons[0] };
        await fireEast(tail, 8, missile(tail));
        assert.equal(tail.gn.notonhead, true);

        // C's test is `x != mtmp->mx || y != mtmp->my`, and the case above
        // varies only x, so the y disjunct needs its own row: a segment whose
        // head sits one row off the square the flight stopped on.
        const offRow = corridor(6);
        offRow.level.monsters[3][4] = { mx: 3, my: 3, data: offRow.mons[0] };
        await fireEast(offRow, 8, missile(offRow));
        assert.equal(offRow.gn.notonhead, true);
    });

test('bhit() maps a monster it stops at but cannot spot', async () => {
    // zap.c:4026-4027, display.c map_invisible(). Both conjuncts decide it:
    // the hero has to see the square and not be able to spot what is on it.
    const unseen = corridor(6);
    unseen.level.monsters[3][4] = {
        mx: 3, my: 4, data: unseen.mons[0], minvis: 1,
    };
    await fireEast(unseen, 8, missile(unseen));
    assert.equal(
        glyph_is_invisible(unseen.level.at(3, 4).remembered_glyph?.glyph),
        true,
    );

    // The same monster where the hero can spot it leaves no marker.
    const spotted = corridor(6);
    spotted.level.monsters[3][4] = { mx: 3, my: 4, data: spotted.mons[0] };
    await fireEast(spotted, 8, missile(spotted));
    assert.equal(spotted.level.at(3, 4).remembered_glyph, undefined);

    // Nor does an unspottable one on a square the hero cannot see.
    const dark = corridor(6);
    dark.viz_array[4][3] = 0;
    dark.level.monsters[3][4] = {
        mx: 3, my: 4, data: dark.mons[0], minvis: 1,
    };
    await fireEast(dark, 8, missile(dark));
    assert.equal(dark.level.at(3, 4).remembered_glyph, undefined);
});

test('bhit() consults shade_miss() before it stops at a monster', async () => {
    // zap.c:3985. uhitm.c shade_miss() is the first of the two tests that can
    // clear the monster and let the missile fly on, and js/uhitm.js refuses
    // for a shade an arrow cannot hurt rather than answering that it passed
    // harmlessly through.
    const shade = corridor(6);
    shade.level.monsters[3][4] = { mx: 3, my: 4, data: shade.mons[PM_SHADE] };
    // shade_miss() reaches weapon.c dmgval() only for a shade, and dmgval()
    // rolls the missile's damage dice on the game RNG, so this fixture is the
    // one here that needs a seeded context. The seed is arbitrary: every roll
    // an arrow can produce is zeroed again by dmgval()'s own shade clamp.
    initRng(1);
    enableRngLog();
    const before = getRngLog().length;
    await assert.rejects(
        () => fireEast(shade, 8, missile(shade)),
        /passing through a shade/u,
    );
    // The obj argument is what makes shade_miss() reach dmgval() at all:
    // uhitm.c:1575 is `|| (obj && dmgval(obj, mdef, ...))`, so handing it null
    // would take the refusal with no draw spent. That draw is the one thing
    // separating the two, and it is state, so it belongs in the assertion
    // rather than only in the fixture's comment.
    assert.ok(getRngLog().length > before,
        'dmgval() rolls the missile damage before the refusal');
});

test('bhit() refuses a mimic disguised as an object', async () => {
    // zap.c:3986-3989. C decides whether the missile flies past by reading the
    // glyph drawn on the square through display.c glyph_at(); this port's
    // glyph buffer holds no glyph number for a square showing a monster, so
    // the disguise the hero has seen through cannot be told from the one they
    // have not.
    const mimic = corridor(6);
    mimic.level.monsters[3][4] = {
        mx: 3, my: 4, data: mimic.mons[0], m_ap_type: M_AP_OBJECT,
    };
    await assert.rejects(
        () => fireEast(mimic, 8, missile(mimic)), /glyph_at/u,
    );

    // C names one appearance here, not any appearance: a mimic wearing
    // furniture or another monster is hit like anything else.
    for (const appearance of [M_AP_FURNITURE, M_AP_MONSTER]) {
        const other = corridor(6);
        const disguised = {
            mx: 3, my: 4, data: other.mons[0], m_ap_type: appearance,
        };
        other.level.monsters[3][4] = disguised;
        assert.equal(await fireEast(other, 8, missile(other)), disguised);
    }
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
        assert.deepEqual(state.gb.bhitpos, { x: COLNO - 1, y: 4 });
    });

test('bhit() erases a remembered invisible monster and nothing else',
    async () => {
        // zap.c:4082-4087, "'I' present but no monster: erase; do this before
        // tmp_at()". Both conjuncts decide it, and the conjunction is what
        // separates the two runs below: the marker has to be there and the
        // hero has to be able to see the square.
        const state = corridor(6);
        const marked = state.level.at(3, 4);
        marked.remembered_glyph = { glyph: GLYPH_INVISIBLE };

        await fireEast(state, 8, missile(state));
        assert.equal(glyph_is_invisible(marked.remembered_glyph.glyph), false);

        // Out of sight, the same marker survives the flight: unmap_object()
        // and newsym() are behind cansee(). The missile still crosses the
        // square, so the difference is the condition and nothing else.
        const unseen = corridor(6);
        unseen.viz_array[4][3] = 0;
        unseen.level.at(3, 4).remembered_glyph = { glyph: GLYPH_INVISIBLE };
        await fireEast(unseen, 8, missile(unseen));
        assert.deepEqual(unseen.gb.bhitpos, { x: 6, y: 4 });
        assert.equal(
            unseen.level.at(3, 4).remembered_glyph.glyph, GLYPH_INVISIBLE,
        );
    });
