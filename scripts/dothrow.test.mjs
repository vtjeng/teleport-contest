// dothrow.c multishot_class_bonus(), breaktest(), find_launcher() and
// impact_disturbs_zombies(), plus zap.c skiprange(). Every expected value is
// read out of the C source and cited at the assertion that uses it; the
// objects.c skills and materials the arms select on are asserted first, so a
// wrong table entry fails as itself rather than as a wrong bonus.

import assert from 'node:assert/strict';
import test from 'node:test';

import { OBJ_INVENT, P_SLING } from '../js/const.js';
import {
    breaktest,
    find_launcher,
    impact_disturbs_zombies,
    multishot_class_bonus,
} from '../js/dothrow.js';
import {
    PM_CAVE_DWELLER,
    PM_MONK,
    PM_NINJA,
    PM_RANGER,
    PM_ROGUE,
    PM_SAMURAI,
    PM_WIZARD,
} from '../js/monsters.js';
import { newObject } from '../js/obj.js';
import {
    ARROW,
    BOW,
    CREAM_PIE,
    CRYSTAL_PLATE_MAIL,
    DAGGER,
    DART,
    FLINT,
    GLASS,
    LEATHER,
    LEATHER_ARMOR,
    MINERAL,
    LENSES,
    POT_WATER,
    SHURIKEN,
    SLING,
    SPEAR,
    YA,
    YUMI,
    objects_globals_init,
} from '../js/objects.js';
import { skiprange } from '../js/zap.js';

function makeState() {
    const state = {};
    objects_globals_init(state);
    return state;
}

function object(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        owornmask: 0,
        where: OBJ_INVENT,
        ...overrides,
    });
}

// A fixed rn2 so a purity test never depends on the game stream. `value` is
// what rn2(100) answers inside zap.c obj_resists().
function resistDraw(value) {
    return { random: { rn2: () => value } };
}

const state = makeState();

test('the objects.c rows the multishot arms select on', () => {
    // objects.c gives ammunition a negative oc_skill naming its launcher and
    // a melee weapon a positive one naming its own skill. Each arm of
    // multishot_class_bonus() compares against one of these.
    assert.equal(state.objects[FLINT].oc_skill, -P_SLING);
    assert.equal(state.objects[FLINT].oc_material, MINERAL);
    assert.equal(state.objects[LENSES].oc_material, GLASS);
    assert.equal(state.objects[CRYSTAL_PLATE_MAIL].oc_material, GLASS);
    assert.equal(state.objects[POT_WATER].oc_material, GLASS);
});

test('multishot_class_bonus() gives the Cave Dweller sling and spear', () => {
    // dothrow.c:46-51. A Caveman gets +1 for `skill == -P_SLING ||
    // skill == P_SPEAR` and nothing else, so a bow's arrow gets no bonus.
    const flint = object(state, FLINT);
    const spear = object(state, SPEAR);
    const arrow = object(state, ARROW);
    assert.equal(
        multishot_class_bonus(PM_CAVE_DWELLER, flint, null, state), 1,
    );
    assert.equal(
        multishot_class_bonus(PM_CAVE_DWELLER, spear, null, state), 1,
    );
    assert.equal(
        multishot_class_bonus(PM_CAVE_DWELLER, arrow, null, state), 0,
    );
});

test('multishot_class_bonus() gives the Ranger everything but daggers', () => {
    // dothrow.c:59-62 is the one arm whose test is an inequality, so a
    // dagger is the only missile that misses out.
    assert.equal(
        multishot_class_bonus(PM_RANGER, object(state, ARROW), null, state), 1,
    );
    assert.equal(
        multishot_class_bonus(PM_RANGER, object(state, DAGGER), null, state),
        0,
    );
    // dothrow.c:63-66 is the Rogue's, which is that same test the other way.
    assert.equal(
        multishot_class_bonus(PM_ROGUE, object(state, DAGGER), null, state), 1,
    );
    assert.equal(
        multishot_class_bonus(PM_ROGUE, object(state, ARROW), null, state), 0,
    );
    // dothrow.c:53-56, the Monk's shuriken.
    assert.equal(
        multishot_class_bonus(PM_MONK, object(state, SHURIKEN), null, state),
        1,
    );
    // dothrow.c:80-82. Every unlisted role takes `default: break`.
    assert.equal(
        multishot_class_bonus(PM_WIZARD, object(state, ARROW), null, state), 0,
    );
});

test('multishot_class_bonus() falls the Ninja through to the Samurai', () => {
    // dothrow.c:67-76. The PM_NINJA arm has no `break`: a shuriken or dart
    // scores +1 there and then the Samurai's ya-and-yumi test runs too, so a
    // ninja firing ya from a yumi collects both.
    const ya = object(state, YA);
    const yumi = object(state, YUMI);
    assert.equal(multishot_class_bonus(PM_NINJA, ya, yumi, state), 1);
    assert.equal(
        multishot_class_bonus(PM_NINJA, object(state, DART), yumi, state), 1,
    );
    // A dart is not ya, so the fallthrough adds nothing to the dart's own +1
    // -- and a shuriken fired from no launcher keeps just its own.
    assert.equal(
        multishot_class_bonus(PM_NINJA, object(state, SHURIKEN), null, state),
        1,
    );
    // The Samurai reaches only the second test.
    assert.equal(multishot_class_bonus(PM_SAMURAI, ya, yumi, state), 1);
    assert.equal(multishot_class_bonus(PM_SAMURAI, ya, null, state), 0);
    assert.equal(
        multishot_class_bonus(PM_SAMURAI, object(state, ARROW), yumi, state),
        0,
    );
});

test('breaktest() asks obj_resists() before anything else', () => {
    // dothrow.c:2586-2593. An ordinary object gets nonbreakchance 1, so
    // `rn2(100) < 1` protects it and every draw above 0 lets the type
    // decide. A potion is on the switch list at :2601, so it breaks.
    const potion = object(state, POT_WATER);
    assert.equal(breaktest(potion, { state, ...resistDraw(0) }), false);
    assert.equal(breaktest(potion, { state, ...resistDraw(1) }), true);
    // Glass armor gets nonbreakchance 90 instead (:2588-2589), so the same
    // draw of 1 that broke the potion leaves crystal plate mail whole.
    const armor = object(state, CRYSTAL_PLATE_MAIL);
    assert.equal(breaktest(armor, { state, ...resistDraw(1) }), false);
    assert.equal(breaktest(armor, { state, ...resistDraw(89) }), false);
    assert.equal(breaktest(armor, { state, ...resistDraw(90) }), true);
});

test('breaktest() breaks glass that is not a gem', () => {
    // dothrow.c:2594-2597. Lenses are GLASS and TOOL_CLASS, so they break on
    // the material test alone.
    assert.equal(
        breaktest(object(state, LENSES), { state, ...resistDraw(50) }), true,
    );
    // A flint stone is MINERAL and GEM_CLASS: it fails the material test and
    // is not on the switch list, so it always survives a landing. That is
    // what makes the Caveman's volley in seed1150-caveman-explore-move draw
    // rn2(100) twice and break nothing.
    const flint = object(state, FLINT);
    assert.equal(breaktest(flint, { state, ...resistDraw(0) }), false);
    assert.equal(breaktest(flint, { state, ...resistDraw(99) }), false);
});

test('find_launcher() prefers a launcher whose curse status is known', () => {
    // dothrow.c:449-461. The loop skips a known-cursed item outright, returns
    // the first launcher whose bknown is set, and otherwise answers the first
    // unknown one it saw.
    const cursed = object(state, BOW, { cursed: 1, bknown: 1 });
    const unknown = object(state, BOW);
    const known = object(state, BOW, { bknown: 1 });
    const arrow = object(state, ARROW);
    const chain = (...items) => {
        items.forEach((item, index) => {
            item.nobj = items[index + 1] ?? null;
        });
        return { objects: state.objects, invent: items[0] };
    };
    assert.equal(find_launcher(arrow, chain(cursed, unknown, known)), known);
    assert.equal(find_launcher(arrow, chain(cursed, unknown)), unknown);
    assert.equal(find_launcher(arrow, chain(cursed)), null);
    // A sling launches no arrow, so a pack of them answers nothing at all.
    assert.equal(find_launcher(arrow, chain(object(state, SLING))), null);
    assert.equal(find_launcher(null, chain(known)), null);
});

test('impact_disturbs_zombies() weighs a landing before waking anyone', () => {
    // hack.c:1789-1793 over obj.h is_flimsy() (418-420). A light or soft
    // object returns before reaching the buried chain; only a heavy hard one
    // gets as far as disturb_buried_zombies().
    let chainReads = 0;
    const zombieState = {
        objects: state.objects,
        get level() {
            chainReads++;
            return { buriedobjlist: null };
        },
    };
    // mkobj.c gives a fresh single object its type's oc_weight; newObject()
    // leaves owt at 0, so the fixture supplies what the game would.
    const drop = (otyp, violent) => {
        const before = chainReads;
        const landed = object(state, otyp, {
            ox: 5, oy: 6, owt: state.objects[otyp].oc_weight,
        });
        impact_disturbs_zombies(landed, violent, zombieState);
        return chainReads > before;
    };
    // An arrow weighs 1 in objects.c, under the violent threshold of 10.
    assert.equal(state.objects[ARROW].oc_weight, 1);
    assert.equal(drop(ARROW, true), false);
    // A cream pie weighs 10, which clears that threshold, but its material is
    // VEGGY -- at or below LEATHER -- so is_flimsy() stops it anyway.
    assert.equal(state.objects[CREAM_PIE].oc_weight, 10);
    assert.ok(state.objects[CREAM_PIE].oc_material <= LEATHER);
    assert.equal(drop(CREAM_PIE, true), false);
    // A flint stone weighs the same 10 and is MINERAL, so it gets through.
    assert.equal(state.objects[FLINT].oc_weight, 10);
    assert.ok(state.objects[FLINT].oc_material > LEATHER);
    assert.equal(drop(FLINT, true), true);
    // The gentler threshold is 100, which the same stone does not reach.
    assert.equal(drop(FLINT, false), false);
    // LEATHER itself is on the flimsy side of is_flimsy()'s `<=`, and a suit
    // of leather armor weighs 150, so it is the case that separates that
    // comparison from a strict one.
    assert.equal(state.objects[LEATHER_ARMOR].oc_material, LEATHER);
    assert.equal(drop(LEATHER_ARMOR, true), false);
});

test('skiprange() picks the window a thrown rock may skip over', () => {
    // zap.c:3579-3589. `tr` is range/4 and the first draw is rnd(tr) only
    // when tr is positive, so a range under 4 draws once rather than twice.
    const draws = [];
    const rnd = (n) => {
        draws.push(n);
        return n; /* the largest value rnd(n) can answer */
    };
    // range 20: tr = 5, tmp = 20 - 5 = 15, end = 15 - (3 * 3) = 6.
    assert.deepEqual(skiprange(20, { rnd }), { skipstart: 15, skipend: 6 });
    assert.deepEqual(draws, [5, 3]);
    // range 3: tr = 0, so the first draw is skipped and tmp stays 3;
    // end = 3 - (0 * 3) = 3, which the guard at :3587 lowers to 2.
    draws.length = 0;
    assert.deepEqual(skiprange(3, { rnd }), { skipstart: 3, skipend: 2 });
    assert.deepEqual(draws, [3]);
});
