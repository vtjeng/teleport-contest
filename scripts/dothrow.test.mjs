// dothrow.c's whole `f` path: multishot_class_bonus(), breaktest(),
// find_launcher(), impact_disturbs_zombies(), ok_to_throw(), dofire(),
// throw_obj() and throwit(), plus zap.c skiprange(). Every expected value is
// read out of the C source and cited at the assertion that uses it; the
// objects.c skills and materials the arms select on are asserted first, so a
// wrong table entry fails as itself rather than as a wrong bonus.
//
// The three command functions are driven on a state this file builds rather
// than on a replayed session, so nothing here imports js/jsmain.js. That is
// what lets scripts/mutate-sites.mjs judge js/dothrow.js by these tests:
// it admits only the test files that reach a module without passing through
// another js/ module, and a session replay reaches dothrow.js through
// runSegment(). scripts/fire-command.test.mjs covers the same command the
// other way round, over recorded recipes.
//
// Two kinds of assertion carry most of the weight:
//
//   - the shape of the random-number draws, `rnd(2)` or `rn2(100)` without
//     the answer. dothrow.c fixes which call happens with which argument, so
//     a branch that C does not take costs a draw that is missing here; the
//     answers depend on ARENA_SEED and are named only where one is used.
//   - which UnsupportedThrowError the port stops at. Most branches of these
//     functions end in an unported call, so the branch taken is legible in
//     the refusal's own text.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CON,
    A_DEX,
    A_STR,
    CONFUSION,
    CQ_CANNED,
    DEAF,
    ECMD_OK,
    ECMD_TIME,
    ECMD_CANCEL,
    FUMBLING,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    LAST_PROP,
    LAVAPOOL,
    LEVITATION,
    OBJ_FREE,
    OBJ_INVENT,
    POOL,
    P_CROSSBOW,
    P_DAGGER,
    P_EXPERT,
    P_SKILLED,
    P_SLING,
    ROOM,
    STONE_RES,
    STUNNED,
    TIMER_OBJECT,
    TRAPDOOR,
    WT_SPLASH_THRESHOLD,
    W_SWAPWEP,
    W_WEP,
    ZOMBIFY_MON,
} from '../js/const.js';
import {
    breaktest,
    dofire,
    dothrow,
    find_launcher,
    impact_disturbs_zombies,
    multishot_class_bonus,
    throw_obj,
    throw_ok,
    throwit,
} from '../js/dothrow.js';
import { GameMap } from '../js/game.js';
import {
    PM_CAVE_DWELLER,
    PM_CLERIC,
    PM_COCKATRICE,
    PM_ELF,
    PM_FLOATING_EYE,
    PM_GIANT,
    PM_GIANT_ANT,
    PM_HEALER,
    PM_HUMAN,
    PM_MONK,
    PM_NINJA,
    PM_ORC,
    PM_RANGER,
    PM_ROGUE,
    PM_SAMURAI,
    PM_TOURIST,
    PM_VALKYRIE,
    PM_WIZARD,
    monst_globals_init,
} from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { UnsupportedObjectOperationError, newObject } from '../js/obj.js';
import {
    AKLYS,
    ARROW,
    BOOMERANG,
    BOULDER,
    BOW,
    BULLWHIP,
    CLUB,
    CORPSE,
    CREAM_PIE,
    CROSSBOW,
    CROSSBOW_BOLT,
    CRYSTAL_PLATE_MAIL,
    DAGGER,
    DART,
    DIAMOND,
    ELVEN_ARROW,
    ELVEN_BOW,
    FLINT,
    FOOD_RATION,
    GLASS,
    GOLD_PIECE,
    IRON,
    LEATHER,
    LEATHER_ARMOR,
    LEATHER_GLOVES,
    LANCE,
    MINERAL,
    LENSES,
    ORCISH_ARROW,
    ORCISH_BOW,
    POT_WATER,
    QUARTERSTAFF,
    SHORT_SWORD,
    SHURIKEN,
    SLING,
    SPEAR,
    SCR_IDENTIFY,
    WAR_HAMMER,
    WOOD,
    YA,
    YUMI,
    objects_globals_init,
} from '../js/objects.js';
import { ART_MJOLLNIR } from '../js/artifacts.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { initialize_symbols_from_options } from '../js/symbols.js';
import { HeadlessTerminal } from '../js/terminal.js';
import {
    peek_timer,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';
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

// ---------------------------------------------------------------------------
// dofire(), throw_obj() and throwit() on a built state
// ---------------------------------------------------------------------------

// One seed for every arena below. arena() reseeds, so each test reads the same
// stream from its own first draw and no test depends on the order the runner
// picked. Two answers this seed fixes are used, and each is named where it is:
// the first rn2(100) is 45 and the first rn2(7) is 5.
const ARENA_SEED = 1;

enableRngLog();

// u_init.c u_init()'s uprops[], which every property macro indexes.
function zeroProperties() {
    return Array.from(
        { length: LAST_PROP + 1 },
        () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
    );
}

// A straight run of floor at row 4 from column 1 to `last`, with the hero at
// column 1 facing east and everything in sight -- the same shape
// scripts/bhit.test.mjs flies its missiles down, since throwit() hands each
// one to bhit(). Column `last + 1` stays STONE, which is what stops a missile
// that outlives its range.
//
// The defaults are an unencumbered, unwounded human Valkyrie: no role or race
// arm of throw_obj()'s multishot block selects her, so a test that wants one
// names it and every other test starts from no bonus at all.
function arena({
    last = 12,
    role = PM_VALKYRIE,
    race = PM_HUMAN,
    str = 16,
    con = 16,
    dex = 12,
    uhp = 12,
    uhpmax = 12,
} = {}) {
    initRng(ARENA_SEED);
    const state = {};
    state.level = new GameMap();
    for (let x = 1; x <= last; x++) state.level.at(x, 4).typ = ROOM;
    state.u = {
        ux: 1,
        uy: 4,
        uz: { dnum: 0, dlevel: 1 },
        dx: 1,
        dy: 0,
        dz: 0,
        uhp,
        uhpmax,
        // u_init.c u_init() sets both from urole.mnum, which is what keeps
        // Upolyd() false; the port's comments in js/dothrow.js rely on that.
        umonnum: role,
        umonster: role,
        twoweap: false,
        acurr: { a: [] },
        uprops: zeroProperties(),
        weapon_skills: [],
    };
    state.u.acurr.a[A_STR] = str;
    state.u.acurr.a[A_CON] = con;
    state.u.acurr.a[A_DEX] = dex;
    state.flags = {};
    // iflags.fireassist is on by default in C, and dofire()'s launcher search
    // is the arm it gates.
    state.iflags = { fireassist: true };
    state.gw = {};
    // mkobj.c next_ident() refuses a zero ident, and every splitobj() in
    // throw_obj()'s volley loop draws one.
    state.context = { ident: 1 };
    state.program_state = {};
    state.moves = 0;
    state.urole = { mnum: role };
    state.urace = { mnum: race };
    state.youmonst = { data: null };
    monst_globals_init(state);
    objects_globals_init(state);
    // xname() enters the named type in the discoveries list, which needs the
    // per-class bases init_objects() builds. The constant rn2 keeps its
    // description shuffle off the game RNG.
    init_objects(state, () => 0);
    initialize_symbols_from_options({ flags: {} }, state);
    state.youmonst.data = state.mons[role];
    state.viz_array = [];
    state.viz_array[4] = [];
    for (let x = 0; x <= last + 1; x++) state.viz_array[4][x] = 0x2;
    // getdir()'s prompt reads a key through the window port, so the direction
    // tests push one onto this queue.
    state.nhDisplay = new HeadlessTerminal({ cols: 80, rows: 24 });
    return state;
}

// mkobj.c gives a fresh object its type's oc_weight; newObject() leaves owt at
// 0, so the fixture supplies what the game would. A thrown object arrives at
// throwit() already freed from inventory, which is what OBJ_FREE says.
function item(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        owornmask: 0,
        owt: state.objects[otyp].oc_weight,
        where: OBJ_FREE,
        ...overrides,
    });
}

// Put `items` in inventory in the order given and hand back the head.
function carry(state, ...items) {
    items.forEach((item, index) => {
        item.where = OBJ_INVENT;
        item.nobj = items[index + 1] ?? null;
    });
    state.invent = items[0] ?? null;
    return items[0] ?? null;
}

// Every draw so far, as `name(argument)`. The answers are dropped: dothrow.c
// fixes the calls and their arguments, and the answers belong to ARENA_SEED.
function draws() {
    return getRngLog().map((entry) => entry.slice(0, entry.indexOf('=')));
}

// How many draws a volley spends before its first missile lands. dothrow.c
// calls rnd() once at :233 and once more at :231 when the crossbow reload
// penalty applies; mkobj.c next_ident() then draws rnd(2) for the split that
// takes the first missile off the stack, and zap.c obj_resists()'s rn2(100)
// inside breaktest() is the landing. Counting to that landing measures the
// penalty without pinning any argument that is the answer to an earlier draw.
function rollsBeforeFirstLanding() {
    const all = draws();
    const landing = all.indexOf('rn2(100)');
    return landing < 0 ? all.length : landing;
}

// The floor pile at <x,y>, head first, as js/obj.js place_object() links it.
function pileAt(state, x, y) {
    const found = [];
    for (let obj = state.level.objects[x]?.[y]; obj; obj = obj.nexthere)
        found.push(obj);
    return found;
}

// Answer the next direction prompt with `key` and leave enough spaces behind
// it to dismiss any --More-- a volley's messages raise. The queue is emptied
// first so a prompt that reads one key too many finds a space rather than the
// tail of the last answer.
function aim(state, key) {
    state.nhDisplay.clearInputQueue();
    state.nhDisplay.pushKey(key.charCodeAt(0));
    for (let i = 0; i < 8; i++) state.nhDisplay.pushKey(' '.charCodeAt(0));
}

const aimEast = (state) => aim(state, 'l');
// cmd.c getdir() skips confdir() when the answer set u.dz, so aiming down is
// also how a confused or stunned hero reaches throw_obj() at all.
const aimDown = (state) => aim(state, '>');

test('throwit() lands a thrown weapon at the end of its range', async () => {
    // dothrow.c:1614-1626. Not crossbowing, so urange is ACURRSTR/2 = 8 and a
    // dagger's 10 units of weight cost `10/40` = 0 of it. bhit() then walks 8
    // squares east from column 1.
    const state = arena();
    const dagger = item(state, DAGGER);
    assert.equal(state.objects[DAGGER].oc_weight, 10);
    await throwit(dagger, 0, false, null, state);
    assert.deepEqual(state.gb.bhitpos, { x: 9, y: 4 });
    assert.deepEqual(pileAt(state, 9, 4), [dagger]);
    // dothrow.c:1780 asks breaktest() -- one rn2(100) inside obj_resists() --
    // and nothing else draws: :1526's rn2(7) belongs to a cursed or greased
    // missile and this one is neither.
    assert.deepEqual(draws(), ['rn2(100)']);
    // :1823 clears gt.thrownobj once the missile is on the floor.
    assert.equal(state.thrownobj, null);
});

test('throwit() draws rn2(7) only for a cursed or greased missile',
    async () => {
        // dothrow.c:1526, `(obj->cursed || obj->greased) && (u.dx || u.dy)
        // && !rn2(7)`. Each conjunct gates the draw, so a missile that is
        // merely cursed still costs the draw and a missile that is neither
        // costs nothing.
        for (const flag of ['cursed', 'greased']) {
            const state = arena();
            const dagger = item(state, DAGGER, { [flag]: 1 });
            await throwit(dagger, 0, false, null, state);
            // ARENA_SEED's first rn2(7) is 5, and `!rn2(7)` wants 0, so the
            // missile keeps the direction it was thrown in.
            assert.deepEqual(draws(), ['rn2(7)', 'rn2(100)'],
                `a ${flag} missile has to ask whether it slips`);
            assert.deepEqual(state.gb.bhitpos, { x: 9, y: 4 });
        }
        // With no direction to slip away from -- u.dx and u.dy both zero --
        // the second conjunct stops the draw. u.dz is what throwit() reads
        // next, and throwing straight down is unported, so the refusal is
        // where this one ends.
        const down = arena();
        down.u.dx = 0;
        down.u.dy = 0;
        down.u.dz = 1;
        await assert.rejects(
            () => throwit(item(down, DAGGER, { cursed: 1 }), 0, false, null,
                down),
            /straight up or down/u,
        );
        assert.deepEqual(draws(), []);
    });

test('throwit() refuses a weapon that would return to the hand', async () => {
    // dothrow.c:30-34 AutoReturn(). The aklys arm needs the weapon in the
    // primary slot; the boomerang arm needs nothing.
    const wielded = arena();
    await assert.rejects(
        () => throwit(item(wielded, AKLYS), W_WEP, false, null, wielded),
        /returning_missile/u,
    );
    // Thrown from anywhere but the hand the same aklys is an ordinary
    // missile, so it flies and lands.
    const loose = arena();
    const aklys = item(loose, AKLYS);
    await throwit(aklys, 0, false, null, loose);
    assert.deepEqual(pileAt(loose, loose.gb.bhitpos.x, 4), [aklys]);
    // A boomerang returns whatever slot it came from, so the wield mask never
    // reaches its half of the test. dothrow.c:1601 boomhit() is the next
    // unported call, which is what a missed AutoReturn() would stop at
    // instead.
    const boomerang = arena();
    await assert.rejects(
        () => throwit(item(boomerang, BOOMERANG), 0, false, null, boomerang),
        /returning_missile/u,
    );
});

test('throwit() stops for the recoil of a weightless throw', async () => {
    // dothrow.c:1650-1657, `Is_airlevel(&u.uz) || Levitation`. Neither holds
    // for a hero standing on an ordinary floor, and either alone is enough.
    const state = arena();
    state.u.uprops[LEVITATION].extrinsic = 1;
    await assert.rejects(
        () => throwit(item(state, DAGGER), 0, false, null, state),
        /recoil of a weightless throw/u,
    );
    // The refusal is ahead of breaktest(), so the levitating throw draws
    // nothing at all.
    assert.deepEqual(draws(), []);
});

test('throwit() takes its range from the launcher, not from the hand',
    async () => {
        // dothrow.c:1614-1616. `crossbowing` needs both halves: the ammo has
        // to match the wielded launcher *and* that launcher has to be a
        // crossbow. A hero holding a crossbow and throwing daggers matches
        // only the second, so urange stays ACURRSTR/2 = 8 rather than
        // becoming 18/2 = 9.
        const state = arena({ last: 20 });
        const crossbow = item(state, CROSSBOW, { owornmask: W_WEP });
        state.uwep = crossbow;
        carry(state, crossbow);
        await throwit(item(state, DAGGER), 0, false, null, state);
        assert.deepEqual(state.gb.bhitpos, { x: 9, y: 4 });
        // With bolts in the same hands both halves hold, so :1638 replaces
        // the range with BOLT_LIM (8) outright rather than adding one to it.
        const bolts = arena({ last: 20 });
        const launcher = item(bolts, CROSSBOW, { owornmask: W_WEP });
        bolts.uwep = launcher;
        carry(bolts, launcher);
        await throwit(item(bolts, CROSSBOW_BOLT), 0, false, null, bolts);
        assert.deepEqual(bolts.gb.bhitpos, { x: 9, y: 4 });
    });

test('throwit() breaks what lands hard and drowns what lands wet',
    async () => {
        // dothrow.c:1780. A cream pie is on breaktest()'s switch list at
        // :2601 and ARENA_SEED's first rn2(100) is 45, well clear of the
        // nonbreakchance of 1, so it does not resist.
        const hard = arena();
        await assert.rejects(
            () => throwit(item(hard, CREAM_PIE), 0, false, null, hard),
            /breakobj/u,
        );
        assert.deepEqual(draws(), ['rn2(100)']);
        // A dagger asks the same question and answers no, so it lands.
        const survives = arena();
        const dagger = item(survives, DAGGER);
        await throwit(dagger, 0, false, null, survives);
        assert.deepEqual(pileAt(survives, 9, 4), [dagger]);
        // :1794-1802. Water is IS_SOFT, so the object never reaches
        // breaktest(); it sounds the landing and then hands the object to
        // do.c flooreffects(), whose trap.c water_damage() arm is what stops
        // the port. Neither the sound nor the handover costs a draw.
        const wet = arena();
        wet.level.at(9, 4).typ = POOL;
        await assert.rejects(
            () => throwit(item(wet, DAGGER), 0, false, null, wet),
            /landing in water/u,
        );
        assert.deepEqual(draws(), []);
    });

test('throwit() sounds a landing in liquid exactly where C sounds it',
    async () => {
        // dothrow.c:1794-1802, `!Deaf && !Underwater` over
        // `is_pool(x, y) || (is_lava(x, y) && !is_flammable(obj))`, then
        // weight.h:11's WT_SPLASH_THRESHOLD of 9 picking the word. Both
        // liquids leave the object to flooreffects() afterwards, so each case
        // below reads the message the throw printed on its way to that
        // refusal.
        //
        // mkobj.c is_flammable() (2270-2286) selects on oc_material, so the
        // two rows that decide the lava cases are asserted first: a dagger is
        // IRON, above WOOD and not PLASTIC, and a club is WOOD.
        const materials = arena();
        assert.equal(materials.objects[DAGGER].oc_material, IRON);
        assert.equal(materials.objects[CLUB].oc_material, WOOD);
        // mkobj.c weight() ends at `wt * obj->quan`, so a dart's oc_weight of
        // 1 puts the threshold at a countable stack size: nine darts weigh
        // exactly WT_SPLASH_THRESHOLD and ten weigh one more. A dagger's 10 is
        // over it on its own.
        assert.equal(materials.objects[DAGGER].oc_weight, 10);
        assert.equal(materials.objects[DART].oc_weight, 1);
        assert.equal(WT_SPLASH_THRESHOLD, 9);

        // A pool sounds for any object heavy enough, whatever it is made of.
        const splash = arena();
        splash.level.at(9, 4).typ = POOL;
        splash._ttyToplines = '';
        await assert.rejects(
            () => throwit(item(splash, DAGGER), 0, false, null, splash),
            /landing in water/u,
        );
        assert.equal(splash._ttyToplines, 'Splash!');
        // rm.h:129 puts POOL at 16 and DRAWBRIDGE_UP at 19, so IS_POOL and
        // with it IS_SOFT (rm.h:140) hold here, and dothrow.c:1780's
        // `!IS_SOFT(...) && breaktest(obj)` short-circuits before breaktest().
        // The sound itself has no roll, so a pool landing draws nothing.
        assert.deepEqual(draws(), []);

        // The same pool, at exactly WT_SPLASH_THRESHOLD: C wants strictly
        // more than the threshold, so nine darts only plop.
        const plop = arena();
        plop.level.at(9, 4).typ = POOL;
        plop._ttyToplines = '';
        await assert.rejects(
            () => throwit(item(plop, DART, { quan: 9, owt: 9 }),
                0, false, null, plop),
            /landing in water/u,
        );
        assert.equal(plop._ttyToplines, 'Plop!');
        assert.deepEqual(draws(), []);

        // One dart more clears it. The fixture carries a deliberately stale
        // owt of 1: mkobj.c weight() recomputes `oc_weight * quan` as 10,
        // so this case says Splash! only if the port asks weight() rather
        // than reading the cached field, which would answer 1 and plop.
        const heavier = arena();
        heavier.level.at(9, 4).typ = POOL;
        heavier._ttyToplines = '';
        await assert.rejects(
            () => throwit(item(heavier, DART, { quan: 10, owt: 1 }),
                0, false, null, heavier),
            /landing in water/u,
        );
        assert.equal(heavier._ttyToplines, 'Splash!');
        assert.deepEqual(draws(), []);

        // The same weight() call refuses for a food the hero has bitten:
        // js/obj.js needs an eatenStat hook to read oeaten and js/eat.js is
        // its only provider, which js/dothrow.js cannot import without
        // closing a cycle. The stop must come before any output, and
        // js/cmd.js failClosedCommandRefusals() is what turns it into a
        // segment end rather than a crash.
        const bitten = arena();
        bitten.level.at(9, 4).typ = POOL;
        bitten._ttyToplines = '';
        await assert.rejects(
            () => throwit(item(bitten, FOOD_RATION, { oeaten: 400 }),
                0, false, null, bitten),
            UnsupportedObjectOperationError,
        );
        assert.equal(bitten._ttyToplines, '');
        assert.deepEqual(draws(), []);

        // Lava sounds only for what will not burn. An iron dagger will not.
        const lava = arena();
        lava.level.at(9, 4).typ = LAVAPOOL;
        lava._ttyToplines = '';
        await assert.rejects(
            () => throwit(item(lava, DAGGER), 0, false, null, lava),
            /landing on lava/u,
        );
        assert.equal(lava._ttyToplines, 'Splash!');
        // rm.h:76 puts LAVAPOOL at 20, outside IS_POOL, so IS_SOFT is false
        // and dothrow.c:1780 does call breaktest(), which asks
        // obj_resists(obj, 1, 99) (dothrow.c:2592) and spends its rn2(100).
        // A lava landing therefore draws where a pool landing does not, and
        // it draws before the sound.
        assert.deepEqual(draws(), ['rn2(100)']);

        // A wooden club over the same lava is flammable, so C says nothing
        // and leaves the burning to flooreffects() -> lava_damage().
        const burns = arena();
        burns.level.at(9, 4).typ = LAVAPOOL;
        burns._ttyToplines = '';
        await assert.rejects(
            () => throwit(item(burns, CLUB), 0, false, null, burns),
            /landing on lava/u,
        );
        assert.equal(burns._ttyToplines, '');
        // Silent, but not draw-free: breaktest() runs for lava whatever the
        // object is made of, and is_flammable() only decides the sound.
        assert.deepEqual(draws(), ['rn2(100)']);

        // youprop.h Deaf (125) has three sources and the roleplay conduct is
        // the one a game can start with. A deaf hero hears no splash.
        const conduct = arena();
        conduct.level.at(9, 4).typ = POOL;
        conduct.u.uroleplay = { deaf: true };
        conduct._ttyToplines = '';
        await assert.rejects(
            () => throwit(item(conduct, DAGGER), 0, false, null, conduct),
            /landing in water/u,
        );
        assert.equal(conduct._ttyToplines, '');
        assert.deepEqual(draws(), []);

        // ...and neither does one deafened by the property itself.
        const deafened = arena();
        deafened.level.at(9, 4).typ = POOL;
        deafened.u.uprops[DEAF].intrinsic = 1;
        deafened._ttyToplines = '';
        await assert.rejects(
            () => throwit(item(deafened, DAGGER), 0, false, null, deafened),
            /landing in water/u,
        );
        assert.equal(deafened._ttyToplines, '');
        assert.deepEqual(draws(), []);

        // youprop.h Underwater (279) is u.uinwater, which dothrow.c:1637 has
        // already read to cut the range to 1: the missile lands at column 2,
        // so that is where this pool goes.
        const submerged = arena();
        submerged.level.at(2, 4).typ = POOL;
        submerged.u.uinwater = 1;
        submerged._ttyToplines = '';
        await assert.rejects(
            () => throwit(item(submerged, DAGGER), 0, false, null, submerged),
            /landing in water/u,
        );
        assert.equal(submerged.gb.bhitpos.x, 2);
        assert.equal(submerged._ttyToplines, '');
        // Draw-free because this pool skips breaktest(), not because the
        // Underwater gate suppressed anything: that gate owns the sound
        // alone.
        assert.deepEqual(draws(), []);
    });

test('throwit() ships an object down a staircase but not down a hole it '
    + 'cannot see', async () => {
    // dokick.c down_gate(), which ship_object() (dothrow.c:1819) asks first.
    // A down staircase under the landing square answers yes on its own.
    const stairs = arena();
    stairs.stairs = { sx: 9, sy: 4, up: false, next: null };
    await assert.rejects(
        () => throwit(item(stairs, DAGGER), 0, false, null, stairs),
        /ship_object/u,
    );
    // An up staircase is not a way down, so the missile lands on it.
    const up = arena();
    up.stairs = { sx: 9, sy: 4, up: true, next: null };
    const onStairs = item(up, DAGGER);
    await throwit(onStairs, 0, false, null, up);
    assert.deepEqual(pileAt(up, 9, 4), [onStairs]);
    // A trapdoor is a hole, but down_gate() wants `ttmp->tseen` as well, and
    // this one has not been found yet.
    const hidden = arena();
    hidden.level.traps = [{ tx: 9, ty: 4, ttyp: TRAPDOOR, tseen: false }];
    const overIt = item(hidden, DAGGER);
    await throwit(overIt, 0, false, null, hidden);
    assert.deepEqual(pileAt(hidden, 9, 4), [overIt]);
    // Once it is seen the same trapdoor takes the missile away.
    const seen = arena();
    seen.level.traps = [{ tx: 9, ty: 4, ttyp: TRAPDOOR, tseen: true }];
    await assert.rejects(
        () => throwit(item(seen, DAGGER), 0, false, null, seen),
        /ship_object/u,
    );
});

test('throwit() hands an unpaid missile to the shopkeeper', async () => {
    // dothrow.c:1835, `(*u.ushops || obj->unpaid) && obj != uball`. Either
    // half alone reaches check_shop_obj(), so an unpaid missile thrown
    // outside a shop still does.
    const unpaid = arena();
    await assert.rejects(
        () => throwit(item(unpaid, DAGGER, { unpaid: 1 }), 0, false, null,
            unpaid),
        /check_shop_obj/u,
    );
    // A paid missile thrown outside a shop reaches neither half.
    const paid = arena();
    const dagger = item(paid, DAGGER);
    await throwit(dagger, 0, false, null, paid);
    assert.deepEqual(pileAt(paid, 9, 4), [dagger]);
});

test('throwit() wakes buried zombies with a violent impact', async () => {
    // dothrow.c:1831 passes TRUE, which hack.c impact_disturbs_zombies()
    // (1787-1794) reads as the weight threshold 10 rather than 100. A flint
    // stone weighs exactly 10, so it is the weight that separates the two.
    const state = arena();
    const corpse = item(state, CORPSE, {
        corpsenm: PM_COCKATRICE, ox: 9, oy: 4, timed: 1,
    });
    state.level.buriedobjlist = corpse;
    timeout_globals_init(state);
    start_timer(30, TIMER_OBJECT, ZOMBIFY_MON, corpse, state);
    assert.equal(peek_timer(ZOMBIFY_MON, corpse, state), 30);
    assert.equal(state.objects[FLINT].oc_weight, 10);
    await throwit(item(state, FLINT), 0, false, null, state);
    // hack.c:1809 restarts the timer at two thirds of what was left.
    assert.equal(peek_timer(ZOMBIFY_MON, corpse, state), 20);
});

// Each row is one way to fail dothrow.c:1549-1553, the five conjuncts that
// decide whether a throw drops out of a tired hand. `pack` is the weight of
// the one object left in inventory and `weight` that of the missile, which is
// what calc_capacity() adds to it: hack.c capacity_from_excess() answers
// `trunc(excess * 2 / weight_cap) + 1` for a positive excess, over a
// weight_cap of 25 * (STR + CON) + 50.
const STAMINA_CASES = [
    // 25 * (3 + 3) + 50 = 200, so an excess of 100 is where the answer stops
    // being SLT_ENCUMBER. A pack of 270 plus the thrown 30 is an excess of
    // 100, which answers 2 and clears `> SLT_ENCUMBER`.
    { name: 'burdened enough', pack: 270, drops: true },
    // One unit lighter is an excess of 99, which answers SLT_ENCUMBER itself
    // and fails a strict `>`.
    { name: 'exactly slightly encumbered', pack: 269, drops: false },
    // An empty pack is an excess below zero, which answers UNENCUMBERED.
    { name: 'unencumbered', pack: 0, drops: false },
    // u.uhp < 10: ten hit points is one too many.
    { name: 'ten hit points', pack: 270, uhp: 10, drops: false },
    // u.uhp != u.uhpmax: an undamaged hero throws freely however faint.
    { name: 'undamaged', pack: 270, uhp: 5, uhpmax: 5, drops: false },
    // obj->owt > u.uhp * 2: five hit points make 10, and the thrown weight
    // has to beat it rather than match it.
    { name: 'weight equal to twice the hit points', pack: 290, weight: 10,
        drops: false },
    { name: 'weight above twice the hit points', pack: 289, weight: 11,
        drops: true },
];

test('throwit() drops a heavy missile from a tired hand', async () => {
    for (const row of STAMINA_CASES) {
        const state = arena({
            str: 3, con: 3, uhp: row.uhp ?? 5, uhpmax: row.uhpmax ?? 12,
        });
        const weight = row.weight ?? 30;
        carry(state, item(state, DAGGER, { owt: row.pack }));
        const dagger = item(state, DAGGER, { owt: weight });
        state._ttyToplines = '';
        if (row.drops) {
            // The block sets u.dz to 1, and throwing straight down is
            // unported, so the drop always ends at that refusal.
            await assert.rejects(
                () => throwit(dagger, 0, false, null, state),
                /straight up or down/u,
                row.name,
            );
            assert.equal(state.u.dz, 1, row.name);
            assert.match(state._ttyToplines, /so little stamina/u, row.name);
            // :1557 exercises Constitution downward, and attrib.c
            // exerciseAttribute() spends `-rn2(2)` on a decrease where an
            // increase would ask rn2(19) and compare it against the
            // attribute.
            assert.deepEqual(draws(), ['rn2(2)'], row.name);
        } else {
            await throwit(dagger, 0, false, null, state);
            assert.deepEqual(pileAt(state, state.gb.bhitpos.x, 4), [dagger],
                row.name);
            assert.doesNotMatch(state._ttyToplines, /so little stamina/u,
                row.name);
            // Nothing was exercised, so breaktest() is the only draw.
            assert.deepEqual(draws(), ['rn2(100)'], row.name);
        }
    }
});

test('throwit() reads the stamina test differently in each direction',
    async () => {
        // dothrow.c:1549's first conjunct is `(u.dx || u.dy || (u.dz < 1))`.
        // Aimed straight up -- u.dx and u.dy zero, u.dz -1 -- only the third
        // term holds, and it is enough. The block then aims the throw down,
        // which is unported, so both answers end at the same refusal and the
        // message is what tells them apart.
        const upward = arena({ str: 3, con: 3, uhp: 5 });
        carry(upward, item(upward, DAGGER, { owt: 270 }));
        upward.u.dx = 0;
        upward.u.dy = 0;
        upward.u.dz = -1;
        upward._ttyToplines = '';
        await assert.rejects(
            () => throwit(item(upward, DAGGER, { owt: 30 }), 0, false, null,
                upward),
            /straight up or down/u,
        );
        assert.match(upward._ttyToplines, /so little stamina/u);
        assert.equal(upward.u.dz, 1);
        // Aimed straight down, `u.dz < 1` is false and no term holds, so the
        // same tired hero keeps hold of the same weight.
        const downward = arena({ str: 3, con: 3, uhp: 5 });
        carry(downward, item(downward, DAGGER, { owt: 270 }));
        downward.u.dx = 0;
        downward.u.dy = 0;
        downward.u.dz = 1;
        downward._ttyToplines = '';
        await assert.rejects(
            () => throwit(item(downward, DAGGER, { owt: 30 }), 0, false,
                null, downward),
            /straight up or down/u,
        );
        assert.doesNotMatch(downward._ttyToplines, /so little stamina/u);
    });

test('throw_obj() refuses the throws C answers with a message', async () => {
    // dothrow.c:112-113. Gold is thrown whole unless it is quivered, so
    // throw_obj() dispatches to throw_gold() on the first half of that test;
    // a dagger reaches it only through the second half, and a dagger that is
    // not the quivered stack passes. The dagger pins the second half alone:
    // it is not COIN_CLASS, so no mutation of the first half can send it to
    // throw_gold(), and nothing here covers that dispatch. throw_gold() has
    // been ported since 5d30999, and the arms that still stop are inside it.
    const loose = arena();
    const dagger = item(loose, DAGGER);
    carry(loose, dagger);
    loose.uquiver = null;
    aimEast(loose);
    assert.equal(await throw_obj(dagger, 0, loose), ECMD_TIME);
    assert.deepEqual(pileAt(loose, 9, 4), [dagger]);

    // :128-130. "It's too heavy." wants a boulder in hands that cannot throw
    // rocks. A Valkyrie's cannot, so the object type is the half that decides,
    // and a dagger is not a boulder.
    const heavy = arena();
    const ordinary = item(heavy, DAGGER);
    carry(heavy, ordinary);
    heavy.uquiver = ordinary;
    aimEast(heavy);
    heavy._ttyToplines = '';
    await throw_obj(ordinary, 0, heavy);
    assert.doesNotMatch(heavy._ttyToplines, /too heavy/u);

    // :133-136. Aimed east, u.dx is 1, so the hero is not the target.
    const away = arena();
    const thrown = item(away, DAGGER);
    carry(away, thrown);
    away.uquiver = thrown;
    aimEast(away);
    away._ttyToplines = '';
    assert.equal(await throw_obj(thrown, 0, away), ECMD_TIME);
    assert.doesNotMatch(away._ttyToplines, /at yourself/u);

    // Answering the same prompt with `.` names the hero's own square, which
    // is the case that message exists for. It costs no turn.
    const atSelf = arena();
    const kept = item(atSelf, DAGGER);
    carry(atSelf, kept);
    atSelf.uquiver = kept;
    atSelf.nhDisplay.pushKey('.'.charCodeAt(0));
    atSelf._ttyToplines = '';
    assert.equal(await throw_obj(kept, 0, atSelf), ECMD_OK);
    assert.match(atSelf._ttyToplines, /cannot throw an object at yourself/u);
    assert.equal(atSelf.invent, kept);
});

test('throw_obj() lets gloves carry a petrifying corpse', async () => {
    // dothrow.c:139-143, `!uarmg && obj->otyp == CORPSE
    // && touch_petrifies(...) && !Stone_resistance`. The port carries all
    // four conjuncts. The gloved case below fails the first, so the
    // cockatrice corpse leaves those hands unharmed; the two stone-resistant
    // cases fail the fourth, which is what C grants a hero who cannot be
    // petrified. instapetrify() is the half that stays unported, and it is
    // where a bare-handed hero without the resistance stops.
    const gloved = arena();
    gloved.uarmg = item(gloved, LEATHER_GLOVES, { owt: 10 });
    const corpse = item(gloved, CORPSE,
        { corpsenm: PM_COCKATRICE, owt: 30 });
    carry(gloved, corpse);
    gloved.uquiver = corpse;
    aimEast(gloved);
    assert.equal(await throw_obj(corpse, 0, gloved), ECMD_TIME);
    assert.deepEqual(pileAt(gloved, gloved.gb.bhitpos.x, 4), [corpse]);
    // Bare hands reach the same corpse's third conjunct.
    const bare = arena();
    const deadly = item(bare, CORPSE, { corpsenm: PM_COCKATRICE, owt: 30 });
    carry(bare, deadly);
    bare.uquiver = deadly;
    aimEast(bare);
    await assert.rejects(() => throw_obj(deadly, 0, bare), /instapetrify/u);

    // Stone resistance fails the fourth conjunct on its own, so the same
    // bare-handed throw of the same corpse costs nothing and lands.
    const immune = arena();
    const harmless = item(immune, CORPSE,
        { corpsenm: PM_COCKATRICE, owt: 30 });
    carry(immune, harmless);
    immune.uquiver = harmless;
    immune.u.uprops[STONE_RES].intrinsic = 1;
    aimEast(immune);
    immune._ttyToplines = '';
    assert.equal(await throw_obj(harmless, 0, immune), ECMD_TIME);
    assert.deepEqual(pileAt(immune, immune.gb.bhitpos.x, 4), [harmless]);
    // C's message belongs to the branch this hero skips, so it must not
    // appear; the throw itself prints nothing.
    assert.doesNotMatch(immune._ttyToplines, /bare/u);
    // The extrinsic half of youprop.h Stone_resistance (63-65) reads the same
    // way. Nothing this port equips grants it, so the assertion is what keeps
    // the union honest.
    const worn = arena();
    const spare = item(worn, CORPSE, { corpsenm: PM_COCKATRICE, owt: 30 });
    carry(worn, spare);
    worn.uquiver = spare;
    worn.u.uprops[STONE_RES].extrinsic = 1;
    aimEast(worn);
    assert.equal(await throw_obj(spare, 0, worn), ECMD_TIME);
    assert.deepEqual(pileAt(worn, worn.gb.bhitpos.x, 4), [spare]);
});

test('throw_obj() opens the multishot block only for a stack it can volley',
    async () => {
        // dothrow.c:163-168. A single dagger fails the first conjunct, so
        // multishot stays 1 without asking rnd() anything; the one draw the
        // throw does cost is the splitobj()-free landing's breaktest().
        const single = arena();
        const dagger = item(single, DAGGER);
        carry(single, dagger);
        single.uquiver = dagger;
        aimEast(single);
        await throw_obj(dagger, 0, single);
        assert.deepEqual(draws(), ['rn2(100)']);

        // A stack of five opens it. mkobj.c next_ident() draws rnd(2) for
        // each split the volley makes, after :233's rnd(multishot).
        const stack = arena();
        stack.u.weapon_skills[P_DAGGER] = {
            skill: P_SKILLED, max_skill: P_EXPERT, advance: 0,
        };
        const five = item(stack, DAGGER, { quan: 5 });
        carry(stack, five);
        stack.uquiver = five;
        aimEast(stack);
        await throw_obj(five, 0, stack);
        assert.equal(draws()[0], 'rnd(2)');
        assert.ok(five.quan < 5, 'the volley left the stack alone');

        // :168, `!(Confusion || Stunned)`. Either alone shuts the block, and
        // each is the union of an intrinsic and an extrinsic half. All four
        // are aimed down: cmd.c confdir() refuses a stunned hero outright and
        // spends an rn2(5) on a confused one, and getdir() reaches it only
        // for an answer that left u.dz clear.
        for (const property of [CONFUSION, STUNNED]) {
            for (const half of ['intrinsic', 'extrinsic']) {
                const impaired = arena();
                // P_EXPERT rather than P_SKILLED so the argument an open
                // block would pass rnd() is 3, which no split can be mistaken
                // for.
                impaired.u.weapon_skills[P_DAGGER] = {
                    skill: P_EXPERT, max_skill: P_EXPERT, advance: 0,
                };
                impaired.u.uprops[property][half] = 1;
                const held = item(impaired, DAGGER, { quan: 5 });
                carry(impaired, held);
                impaired.uquiver = held;
                aimDown(impaired);
                // Throwing straight down is unported, so the volley the
                // closed block sized at one stops there -- after its split.
                await assert.rejects(
                    () => throw_obj(held, 0, impaired),
                    /straight up or down/u,
                    `${property}/${half}`,
                );
                assert.deepEqual(draws(), ['rnd(2)'],
                    `${property}/${half} still volleyed`);
                assert.equal(held.quan, 4);
            }
        }
        // The same expert hero unimpaired opens it, and rnd(3) is the first
        // thing the block asks for.
        const clear = arena();
        clear.u.weapon_skills[P_DAGGER] = {
            skill: P_EXPERT, max_skill: P_EXPERT, advance: 0,
        };
        const ready = item(clear, DAGGER, { quan: 5 });
        carry(clear, ready);
        clear.uquiver = ready;
        aimDown(clear);
        await assert.rejects(
            () => throw_obj(ready, 0, clear), /straight up or down/u,
        );
        assert.equal(draws()[0], 'rnd(3)');
    });

// dothrow.c:170-174, weakmultishot. Each row holds the block open with a
// P_SKILLED stack of daggers and then names one reason the hero might not get
// the skill bonus, so the argument :233 passes to rnd() is 1 rather than 2.
const WEAK_MULTISHOT_CASES = [
    // Role_if(PM_WIZARD) and Role_if(PM_CLERIC), the first two terms.
    { name: 'wizard', role: PM_WIZARD, weak: true },
    { name: 'cleric', role: PM_CLERIC, weak: true },
    // Role_if(PM_HEALER) && skill != P_KNIFE. A dagger is not a knife.
    { name: 'healer', role: PM_HEALER, weak: true },
    // Role_if(PM_TOURIST) && skill != -P_DART. A dagger is not a dart.
    { name: 'tourist', role: PM_TOURIST, weak: true },
    // Fumbling.
    { name: 'fumbling', fumbling: true, weak: true },
    // ACURR(A_DEX) <= 6, which six itself satisfies.
    { name: 'dexterity six', dex: 6, weak: true },
    { name: 'dexterity seven', dex: 7, weak: false },
    // A Valkyrie of ordinary dexterity matches no term at all.
    { name: 'valkyrie', weak: false },
];

test('throw_obj() withholds the skill bonus from a weak multishot role',
    async () => {
        for (const row of WEAK_MULTISHOT_CASES) {
            const state = arena({
                role: row.role ?? PM_VALKYRIE,
                dex: row.dex ?? 12,
            });
            if (row.fumbling) state.u.uprops[FUMBLING].intrinsic = 1;
            state.u.weapon_skills[P_DAGGER] = {
                skill: P_SKILLED, max_skill: P_EXPERT, advance: 0,
            };
            const stack = item(state, DAGGER, { quan: 5 });
            carry(state, stack);
            state.uquiver = stack;
            aimEast(state);
            await throw_obj(stack, 0, state);
            // :182-185. P_SKILLED adds one only when weakmultishot is clear;
            // no role here collects a multishot_class_bonus() for daggers and
            // no human collects a racial one.
            assert.equal(draws()[0], row.weak ? 'rnd(1)' : 'rnd(2)', row.name);
        }
    });

test('throw_obj() adds the expert bonus whether or not the role is weak',
    async () => {
        // dothrow.c:178-185. P_EXPERT increments and then falls through to
        // P_SKILLED, so an expert weak role still collects one.
        for (const [role, expected] of [
            [PM_VALKYRIE, 'rnd(3)'], [PM_WIZARD, 'rnd(2)'],
        ]) {
            const state = arena({ role });
            state.u.weapon_skills[P_DAGGER] = {
                skill: P_EXPERT, max_skill: P_EXPERT, advance: 0,
            };
            const stack = item(state, DAGGER, { quan: 8 });
            carry(state, stack);
            state.uquiver = stack;
            aimEast(state);
            await throw_obj(stack, 0, state);
            assert.equal(draws()[0], expected, `role ${role}`);
        }
    });

test('throw_obj() gives the racial bow bonus only for its own arrow',
    async () => {
        // dothrow.c:194-206. Each racial arm wants the race's own arrow and
        // the race's own bow; a plain arrow from an elven bow matches only
        // half of the elf's, so the volley keeps the Ranger's own bonus and
        // nothing more.
        const RACIAL = [
            { name: 'elf, plain arrow', race: PM_ELF, ammo: ARROW,
                launcher: ELVEN_BOW, expected: 'rnd(2)' },
            { name: 'elf, elven arrow', race: PM_ELF, ammo: ELVEN_ARROW,
                launcher: ELVEN_BOW, expected: 'rnd(3)' },
            { name: 'orc, plain arrow', race: PM_ORC, ammo: ARROW,
                launcher: ORCISH_BOW, expected: 'rnd(2)' },
            { name: 'orc, orcish arrow', race: PM_ORC, ammo: ORCISH_ARROW,
                launcher: ORCISH_BOW, expected: 'rnd(3)' },
        ];
        for (const row of RACIAL) {
            const state = arena({ role: PM_RANGER, race: row.race });
            const bow = item(state, row.launcher, { owornmask: W_WEP });
            state.uwep = bow;
            const ammo = item(state, row.ammo, { quan: 5 });
            carry(state, bow, ammo);
            state.uquiver = ammo;
            aimEast(state);
            await throw_obj(ammo, 0, state);
            // :190. A Ranger's multishot_class_bonus() adds one for anything
            // but a dagger, which is the whole of the plain-arrow rows.
            assert.equal(draws()[0], row.expected, row.name);
        }
    });

test('throw_obj() stops for a quest artifact launcher', async () => {
    // dothrow.c:220-222, `uwep && is_quest_artifact(uwep)
    // && ammo_and_launcher(obj, uwep)`. An ordinary bow fails the second
    // conjunct, so a plain elven Ranger's volley never reaches the arm.
    const plain = arena({ role: PM_RANGER, race: PM_ELF });
    const bow = item(plain, ELVEN_BOW, { owornmask: W_WEP });
    plain.uwep = bow;
    const arrows = item(plain, ELVEN_ARROW, { quan: 5 });
    carry(plain, bow, arrows);
    plain.uquiver = arrows;
    aimEast(plain);
    assert.equal(await throw_obj(arrows, 0, plain), ECMD_TIME);
    // Marking the same bow as an artifact reaches it.
    const quest = arena({ role: PM_RANGER, race: PM_ELF });
    const relic = item(quest, ELVEN_BOW, { owornmask: W_WEP, oartifact: 1 });
    quest.uwep = relic;
    const shafts = item(quest, ELVEN_ARROW, { quan: 5 });
    carry(quest, relic, shafts);
    quest.uquiver = shafts;
    aimEast(quest);
    await assert.rejects(
        () => throw_obj(shafts, 0, quest), /is_quest_artifact/u,
    );
});

// dothrow.c:228-231, the crossbow reload. All four conjuncts have to hold
// before the volley is rolled twice, and 18 is the strength that loads one
// quickly for everyone but a gnome.
const CROSSBOW_CASES = [
    // A skilled Valkyrie's multishot is 2, so `multishot > 1` holds; at
    // strength 17 the last conjunct does too, and the two rolls plus the
    // first split make three draws before the first bolt lands.
    { name: 'strength seventeen', str: 17, skill: P_SKILLED,
        first: 'rnd(2)', rolls: 3 },
    // Strength 18 exactly fails a strict `<`, so only :233 rolls.
    { name: 'strength eighteen', str: 18, skill: P_SKILLED,
        first: 'rnd(2)', rolls: 2 },
    // An unskilled hero's multishot is 1, which fails the first conjunct
    // however weak the arms holding the crossbow.
    { name: 'unskilled', str: 17, skill: 0, first: 'rnd(1)', rolls: 2 },
];

test('throw_obj() rolls a crossbow volley twice for a weak hero', async () => {
    for (const row of CROSSBOW_CASES) {
        const state = arena({ str: row.str });
        state.u.weapon_skills[P_CROSSBOW] = {
            skill: row.skill, max_skill: P_EXPERT, advance: 0,
        };
        const crossbow = item(state, CROSSBOW, { owornmask: W_WEP });
        state.uwep = crossbow;
        const bolts = item(state, CROSSBOW_BOLT, { quan: 5 });
        carry(state, crossbow, bolts);
        state.uquiver = bolts;
        aimEast(state);
        await throw_obj(bolts, 0, state);
        assert.equal(draws()[0], row.first, row.name);
        assert.equal(rollsBeforeFirstLanding(), row.rolls, row.name);
    }
});

test('throw_obj() announces a volley and honours a count prefix', async () => {
    // dothrow.c:236-247. `shotlimit > 0` gates both the clamp and the
    // message, so a count of one still names the single missile it threw --
    // and :245 spells it singular.
    const counted = arena();
    counted.u.weapon_skills[P_DAGGER] = {
        skill: P_SKILLED, max_skill: P_EXPERT, advance: 0,
    };
    const stack = item(counted, DAGGER, { quan: 5 });
    carry(counted, stack);
    counted.uquiver = stack;
    aimEast(counted);
    counted._ttyToplines = '';
    await throw_obj(stack, 1, counted);
    assert.equal(stack.quan, 4);
    assert.match(counted._ttyToplines, /^You throw 1 dagger\./u);

    // With no count and a volley of one, neither half of :243 holds and the
    // throw says nothing at all.
    const quiet = arena();
    const one = item(quiet, DAGGER, { quan: 2 });
    carry(quiet, one);
    quiet.uquiver = one;
    aimEast(quiet);
    quiet._ttyToplines = '';
    await throw_obj(one, 0, quiet);
    assert.equal(one.quan, 1);
    assert.doesNotMatch(quiet._ttyToplines, /You throw/u);

    // A volley above one announces itself without any count, and :245 spells
    // that one plural.
    const volley = arena();
    volley.u.weapon_skills[P_DAGGER] = {
        skill: P_SKILLED, max_skill: P_EXPERT, advance: 0,
    };
    const many = item(volley, DAGGER, { quan: 5 });
    carry(volley, many);
    volley.uquiver = many;
    aimEast(volley);
    volley._ttyToplines = '';
    await throw_obj(many, 0, volley);
    assert.equal(many.quan, 3);
    assert.match(volley._ttyToplines, /^You throw 2 daggers\./u);
    // :275 leaves gm.m_shot.s clear, and daggers were never launched from
    // anything, so it was clear before the loop too.
    assert.equal(volley.m_shot.s, false);
    assert.equal(volley.m_shot.n, 0);
});

test('throw_obj() empties the slot when a stack ends', async () => {
    // dothrow.c:258-266. A stack of more than one is split; the last one is
    // taken whole, and taking it whole is what leaves nothing behind in
    // inventory.
    const state = arena();
    const dagger = item(state, DAGGER);
    carry(state, dagger);
    state.uquiver = dagger;
    aimEast(state);
    await throw_obj(dagger, 0, state);
    assert.equal(state.invent, null);
    assert.deepEqual(pileAt(state, 9, 4), [dagger]);
    // No split happened, so mkobj.c next_ident() was never asked and the
    // landing's breaktest() is the only draw.
    assert.deepEqual(draws(), ['rn2(100)']);
});

test('throw_obj() puts a partly thrown stack back together', async () => {
    // dothrow.c:284-286. The undo wants an object that is not the quiver and
    // whose o_id matches one of the two svc.context.objsplit remembers, so a
    // second throw from the same unquivered stack is where it fires: the
    // first throw's split is what objsplit still holds.
    const state = arena();
    const stack = item(state, DAGGER, { quan: 5 });
    carry(state, stack);
    state.uquiver = null;
    aimEast(state);
    assert.equal(await throw_obj(stack, 0, state), ECMD_TIME);
    assert.equal(state.context.objsplit.parent_oid, stack.o_id);
    aimEast(state);
    await assert.rejects(() => throw_obj(stack, 0, state), /unsplitobj/u);
    // The same stack quivered is exempt, because dofire() throws from there
    // every time and would otherwise undo its own split.
    const quivered = arena();
    const readied = item(quivered, DAGGER, { quan: 5 });
    carry(quivered, readied);
    quivered.uquiver = readied;
    aimEast(quivered);
    await throw_obj(readied, 0, quivered);
    aimEast(quivered);
    assert.equal(await throw_obj(readied, 0, quivered), ECMD_TIME);
});

test('dofire() asks whether the hero can throw at all', async () => {
    // dothrow.c:302-311. Each of the three refusals answers FALSE, which
    // :498-499 turns into an ECMD_OK that spends no turn, and the quiver is
    // untouched behind it.
    const REFUSALS = [
        // notake(), a floating eye: "cannot pick up objects".
        { name: 'notake', species: PM_FLOATING_EYE,
            message: /physically incapable/u },
        // nohands(), a giant ant, which can take but cannot throw.
        { name: 'nohands', species: PM_GIANT_ANT,
            message: /without hands/u },
    ];
    for (const row of REFUSALS) {
        const state = arena();
        state.youmonst.data = state.mons[row.species];
        const stack = item(state, DAGGER, { quan: 5 });
        carry(state, stack);
        state.uquiver = stack;
        state._ttyToplines = '';
        assert.equal(await dofire(state), ECMD_OK, row.name);
        assert.match(state._ttyToplines, row.message, row.name);
        assert.equal(stack.quan, 5, row.name);
    }
    // hack.c check_capacity(). 25 * (3 + 3) + 50 = 200 units of capacity, so
    // a pack of 700 is an excess of 500 and `trunc(500 * 2 / 200) + 1` is 6,
    // which is past EXT_ENCUMBER.
    const loaded = arena({ str: 3, con: 3 });
    const stack = item(loaded, DAGGER, { quan: 5, owt: 700 });
    carry(loaded, stack);
    loaded.uquiver = stack;
    loaded._ttyToplines = '';
    assert.equal(await dofire(loaded), ECMD_OK);
    assert.match(loaded._ttyToplines, /carrying so much stuff/u);
    assert.equal(stack.quan, 5);
    // The same hero carrying nothing gets past all three and throws.
    const free = arena({ str: 3, con: 3 });
    const light = item(free, DAGGER, { quan: 5 });
    carry(free, light);
    free.uquiver = light;
    aimEast(free);
    assert.equal(await dofire(free), ECMD_TIME);
    assert.equal(light.quan, 4);
});

test('dofire() throws a wielded returning weapon over quivered ammo',
    async () => {
        // dothrow.c:506-508. The arm wants a wielded throw-and-return weapon
        // and a quiver that is empty or holds ammo. A wielded aklys over
        // quivered arrows matches both.
        const ammo = arena();
        const aklys = item(ammo, AKLYS, { owornmask: W_WEP });
        ammo.uwep = aklys;
        const arrows = item(ammo, ARROW, { quan: 5 });
        carry(ammo, aklys, arrows);
        ammo.uquiver = arrows;
        aimEast(ammo);
        await assert.rejects(
            () => dofire(ammo), /thrown-and-return weapon/u,
        );
        // Quivered daggers are missiles rather than ammo, so the same aklys
        // stays in hand and the daggers fly.
        const missiles = arena();
        const held = item(missiles, AKLYS, { owornmask: W_WEP });
        missiles.uwep = held;
        const daggers = item(missiles, DAGGER, { quan: 5 });
        carry(missiles, held, daggers);
        missiles.uquiver = daggers;
        aimEast(missiles);
        assert.equal(await dofire(missiles), ECMD_TIME);
        assert.equal(daggers.quan, 4);
        // An ordinary bow is not a returning weapon, so quivered arrows go
        // through the launcher search below instead.
        const bowman = arena();
        const bow = item(bowman, BOW, { owornmask: W_WEP });
        bowman.uwep = bow;
        const shafts = item(bowman, ARROW, { quan: 5 });
        carry(bowman, bow, shafts);
        bowman.uquiver = shafts;
        aimEast(bowman);
        assert.equal(await dofire(bowman), ECMD_TIME);
        assert.equal(shafts.quan, 4);
    });

test('dofire() with an empty quiver reads the hands before complaining',
    async () => {
        // dothrow.c:511-528, the four arms an empty quiver and
        // flags.autoquiver off can take. Empty hands take the last of them
        // and then stop at doquiver_core(), which prompts for a missile.
        const empty = arena();
        empty._ttyToplines = '';
        await assert.rejects(() => dofire(empty), /doquiver_core/u);
        assert.match(empty._ttyToplines, /no ammunition readied/u);
        // A wielded polearm takes the first.
        const polearm = arena();
        const lance = item(polearm, LANCE, { owornmask: W_WEP });
        polearm.uwep = lance;
        carry(polearm, lance);
        await assert.rejects(() => dofire(polearm), /use_pole/u);
        // A polearm in the secondary slot takes the third, which swaps to it
        // and reissues the command rather than spending a turn.
        const swap = arena();
        const stowed = item(swap, LANCE, { owornmask: W_SWAPWEP });
        swap.uswapwep = stowed;
        carry(swap, stowed);
        assert.equal(await dofire(swap), ECMD_OK);
        assert.deepEqual(
            swap.command_queue[CQ_CANNED].map((node) => node.ec_entry.ef_txt),
            ['swap', 'fire'],
        );
        // :520 wants a polearm that is not known to be cursed. Cursed but
        // unidentified still counts as usable, so it swaps.
        const unknown = arena();
        const suspect = item(unknown, LANCE,
            { owornmask: W_SWAPWEP, cursed: 1 });
        unknown.uswapwep = suspect;
        carry(unknown, suspect);
        assert.equal(await dofire(unknown), ECMD_OK);
        assert.deepEqual(
            unknown.command_queue[CQ_CANNED].map(
                (node) => node.ec_entry.ef_txt,
            ),
            ['swap', 'fire'],
        );
        // Known to be cursed, it drops through to the complaint.
        const known = arena();
        const bad = item(known, LANCE,
            { owornmask: W_SWAPWEP, cursed: 1, bknown: 1 });
        known.uswapwep = bad;
        carry(known, bad);
        known._ttyToplines = '';
        await assert.rejects(() => dofire(known), /doquiver_core/u);
        assert.match(known._ttyToplines, /no ammunition readied/u);
        // :516-517, the bullwhip arm between the first and the third.
        const whip = arena();
        const bullwhip = item(whip, BULLWHIP, { owornmask: W_WEP });
        whip.uwep = bullwhip;
        carry(whip, bullwhip);
        await assert.rejects(() => dofire(whip), /use_whip/u);
    });

test('dofire() finds a launcher for the quivered ammo', async () => {
    // dothrow.c:557-575. The search wants ammo in the quiver and
    // iflags.fireassist set. Quivered daggers are not ammo, so a wielded
    // polearm is never consulted and the daggers are simply thrown.
    const missiles = arena();
    const lance = item(missiles, LANCE, { owornmask: W_WEP });
    missiles.uwep = lance;
    const daggers = item(missiles, DAGGER, { quan: 5 });
    carry(missiles, lance, daggers);
    missiles.uquiver = daggers;
    aimEast(missiles);
    assert.equal(await dofire(missiles), ECMD_TIME);
    assert.equal(daggers.quan, 4);
    // Quivered arrows do reach it, and :561 applies the polearm instead.
    const ammo = arena();
    const pole = item(ammo, LANCE, { owornmask: W_WEP });
    ammo.uwep = pole;
    const arrows = item(ammo, ARROW, { quan: 5 });
    carry(ammo, pole, arrows);
    ammo.uquiver = arrows;
    await assert.rejects(() => dofire(ammo), /use_pole/u);
    // With fireassist off the whole search is skipped, so the arrows are
    // thrown by hand -- which this port does not carry either.
    const unassisted = arena();
    const shafts = item(unassisted, ARROW, { quan: 5 });
    const bow = item(unassisted, BOW, { owornmask: W_SWAPWEP });
    unassisted.uswapwep = bow;
    carry(unassisted, bow, shafts);
    unassisted.uquiver = shafts;
    unassisted.iflags.fireassist = false;
    aimEast(unassisted);
    await assert.rejects(
        () => dofire(unassisted), /ammo without a launcher/u,
    );
    // With it on, :566 finds the launcher in the secondary slot, swaps to it
    // and reissues the command without spending a turn.
    const assisted = arena();
    const quivered = item(assisted, ARROW, { quan: 5 });
    const secondary = item(assisted, BOW, { owornmask: W_SWAPWEP });
    assisted.uswapwep = secondary;
    carry(assisted, secondary, quivered);
    assisted.uquiver = quivered;
    assert.equal(await dofire(assisted), ECMD_OK);
    assert.equal(quivered.quan, 5);
    assert.deepEqual(
        assisted.command_queue[CQ_CANNED].map((node) => node.ec_entry.ef_txt),
        ['swap', 'fire'],
    );
    // :571. A launcher that is neither wielded nor readied has to be wielded
    // first, which is dowield()'s job.
    const packed = arena();
    const loose = item(packed, ARROW, { quan: 5 });
    const spare = item(packed, BOW);
    carry(packed, spare, loose);
    packed.uquiver = loose;
    await assert.rejects(() => dofire(packed), /dowield/u);
});

// ── the `t` command ──
//
// throw_ok() is the whole visible surface of `t`: getobj() prints every
// GETOBJ_SUGGEST letter between the brackets and hides every GETOBJ_DOWNPLAY
// one behind `?*`, so each test below names the arm it selects and the arm it
// would fall into if that one were moved or dropped.

// An inventory the prompt can be built over. getobj() needs invlet_constant
// set, a message window, and somewhere to put disp.botl.
function pack(state, ...items) {
    items.forEach((entry, index) => {
        entry.invlet = 'abcdefghijklmnop'[index];
    });
    carry(state, ...items);
    state.flags.invlet_constant = 1;
    state.flags.verbose = 1;
    state.disp = {};
    state._ttyToplines = '';
    return items;
}

// The top line as the terminal holds it. yn_function() writes the prompt
// straight to the window rather than through pline(), so _ttyToplines cannot
// see it.
function promptOf(state) {
    return state.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// cmd.c NHKF_ESC, one of the quitchars getobj() answers with Never_mind.
const ESCAPE_KEY = '\u001B';

// Answer the prompts `keys` spells, then leave spaces behind it so that a
// --More-- cannot swallow a later answer. The returned array collects the top
// line as each of those keys is read: the object prompt is painted straight to
// the window rather than through pline(), and getdir()'s prompt overwrites it
// one keystroke later, so it is legible only while its own answer is pending.
function type(state, keys) {
    const terminal = state.nhDisplay;
    terminal.clearInputQueue();
    for (const ch of keys) terminal.pushKey(ch.charCodeAt(0));
    for (let i = 0; i < 8; i++) terminal.pushKey(' '.charCodeAt(0));
    const prompts = [];
    const readKey = terminal.readKey.bind(terminal);
    terminal.readKey = (options) => {
        prompts.push(promptOf(state));
        return readKey(options);
    };
    return prompts;
}

test('throw_ok() excludes the hands and downplays what is not a missile',
    () => {
        const state = arena();
        // dothrow.c:319-320. getobj() asks the callback about the null object
        // first, and GETOBJ_EXCLUDE is what keeps "- " out of the prompt.
        assert.equal(throw_ok(null, state), GETOBJ_EXCLUDE);
        // :347, the fall-through every object that is not gold, a weapon, a
        // slung gem or a boulder reaches.
        assert.equal(
            throw_ok(item(state, FOOD_RATION), state), GETOBJ_DOWNPLAY,
        );
    });

test('throw_ok() downplays a weapon known to be welded before anything else',
    () => {
        // dothrow.c:322-323, the first arm. A cursed wielded stack of two
        // daggers passes every later test: quan is not 1, so :330-331 does not
        // catch it, and :336-337 would suggest it.
        const state = arena();
        const stuck = item(state, DAGGER,
            { quan: 2, cursed: 1, bknown: 1, owornmask: W_WEP });
        state.uwep = stuck;
        assert.equal(throw_ok(stuck, state), GETOBJ_DOWNPLAY);
        // wield.c welded() wants the object in the primary slot, so the same
        // cursed stack carried loose is an ordinary missile.
        const loose = arena();
        const spare = item(loose, DAGGER, { quan: 2, cursed: 1, bknown: 1 });
        assert.equal(throw_ok(spare, loose), GETOBJ_SUGGEST);
        // C's first conjunct is `obj->bknown`: a curse the hero has not
        // noticed leaves the weapon looking throwable.
        const unknown = arena();
        const hidden = item(unknown, DAGGER,
            { quan: 2, cursed: 1, owornmask: W_WEP });
        unknown.uwep = hidden;
        assert.equal(throw_ok(hidden, unknown), GETOBJ_SUGGEST);
    });

test('throw_ok() suggests a returning weapon out of the wielding hand', () => {
    // dothrow.c:325-328 runs before :330-331, so an aklys in hand is offered
    // where any other single wielded weapon is hidden.
    const state = arena();
    const aklys = item(state, AKLYS, { owornmask: W_WEP });
    state.uwep = aklys;
    assert.equal(throw_ok(aklys, state), GETOBJ_SUGGEST);
    // AutoReturn()'s W_WEP conjunct: the same aklys carried loose falls
    // through to the WEAPON_CLASS arm, which happens to suggest it too, so
    // the discriminating case is a single wielded club.
    const club = arena();
    const held = item(club, CLUB, { owornmask: W_WEP });
    club.uwep = held;
    assert.equal(throw_ok(held, club), GETOBJ_DOWNPLAY);
});

test('throw_ok() weighs Mjollnir against the wielder and her strength', () => {
    // dothrow.c:325-328. AutoReturn()'s Mjollnir half needs a Valkyrie, and
    // the caller then needs ACURR(A_STR) >= STR19(25), which attrib.h:37
    // defines as 125: 18/** Strength tops out at 118, so only gauntlets of
    // power reach it.
    const weak = arena({ role: PM_VALKYRIE, str: 124 });
    const mjollnir = item(weak, WAR_HAMMER,
        { oartifact: ART_MJOLLNIR, owornmask: W_WEP });
    weak.uwep = mjollnir;
    // Falls past :325 to :330-331, the single wielded weapon.
    assert.equal(throw_ok(mjollnir, weak), GETOBJ_DOWNPLAY);

    const strong = arena({ role: PM_VALKYRIE, str: 125 });
    const hammer = item(strong, WAR_HAMMER,
        { oartifact: ART_MJOLLNIR, owornmask: W_WEP });
    strong.uwep = hammer;
    assert.equal(throw_ok(hammer, strong), GETOBJ_SUGGEST);

    // AutoReturn()'s Role_if(PM_VALKYRIE): the same hammer in a Samurai's
    // hand does not return, so the strength test is never consulted.
    const samurai = arena({ role: PM_SAMURAI, str: 125 });
    const borrowed = item(samurai, WAR_HAMMER,
        { oartifact: ART_MJOLLNIR, owornmask: W_WEP });
    samurai.uwep = borrowed;
    assert.equal(throw_ok(borrowed, samurai), GETOBJ_DOWNPLAY);
});

test('throw_ok() hides a single wielded weapon and shows a stacked one', () => {
    // dothrow.c:330-331, the arm that decides what a starting hero sees. It
    // wants quan == 1, so a stack in the same slot is suggested instead.
    const state = arena();
    const spear = item(state, SPEAR, { owornmask: W_WEP });
    state.uwep = spear;
    assert.equal(throw_ok(spear, state), GETOBJ_DOWNPLAY);

    const stacked = arena();
    const pair = item(stacked, SPEAR, { quan: 2, owornmask: W_WEP });
    stacked.uwep = pair;
    assert.equal(throw_ok(pair, stacked), GETOBJ_SUGGEST);

    // The secondary slot needs u.twoweap as well, which is why a Samurai's
    // wakizashi is offered and his katana is not.
    const swap = arena();
    const wakizashi = item(swap, SHORT_SWORD, { owornmask: W_SWAPWEP });
    swap.uswapwep = wakizashi;
    assert.equal(throw_ok(wakizashi, swap), GETOBJ_SUGGEST);
    swap.u.twoweap = true;
    assert.equal(throw_ok(wakizashi, swap), GETOBJ_DOWNPLAY);
});

test('throw_ok() suggests gold, weapons without a sling and gems with one',
    () => {
        // dothrow.c:333-345, in C's order. Gold is unconditional.
        const state = arena();
        assert.equal(throw_ok(item(state, GOLD_PIECE), state), GETOBJ_SUGGEST);
        // :336-337 and :341-342 read uslinging() in opposite directions, so
        // one sling swaps both answers.
        const barehanded = arena();
        assert.equal(
            throw_ok(item(barehanded, DAGGER), barehanded), GETOBJ_SUGGEST,
        );
        assert.equal(
            throw_ok(item(barehanded, DIAMOND), barehanded), GETOBJ_DOWNPLAY,
        );
        const slinger = arena();
        const sling = item(slinger, SLING, { owornmask: W_WEP });
        slinger.uwep = sling;
        assert.equal(throw_ok(item(slinger, DAGGER), slinger),
            GETOBJ_DOWNPLAY);
        assert.equal(throw_ok(item(slinger, DIAMOND), slinger),
            GETOBJ_SUGGEST);
    });

test('throw_ok() suggests a boulder only to a form that throws rocks', () => {
    // dothrow.c:336-337 has already declined the boulder, which is a
    // ROCK_CLASS object, so :344-345 is the only arm that can offer it.
    const human = arena();
    assert.equal(throw_ok(item(human, BOULDER), human), GETOBJ_DOWNPLAY);
    const giant = arena();
    giant.youmonst.data = giant.mons[PM_GIANT];
    assert.equal(throw_ok(item(giant, BOULDER), giant), GETOBJ_SUGGEST);
    // The arm's second conjunct: a giant's other objects are classified as
    // anyone else's are.
    assert.equal(throw_ok(item(giant, FOOD_RATION), giant), GETOBJ_DOWNPLAY);
});

test('dothrow() prompts with the suggested letters and throws the answer',
    async () => {
        // dothrow.c:368-375. The prompt is getobj()'s, built over throw_ok():
        // the wielded spear is downplayed and the spare dagger suggested.
        const state = arena();
        const spear = item(state, SPEAR, { owornmask: W_WEP });
        state.uwep = spear;
        const dagger = item(state, DAGGER);
        const ration = item(state, FOOD_RATION);
        pack(state, spear, dagger, ration);
        const prompts = type(state, 'bl');
        assert.equal(await dothrow(state), ECMD_TIME);
        assert.equal(prompts[0], 'What do you want to throw? [b or ?*]');
        // The dagger left the pack and landed east of the hero.
        assert.deepEqual(
            [state.invent.invlet, state.invent.nobj.invlet], ['a', 'c'],
        );
        assert.deepEqual(pileAt(state, state.gb.bhitpos.x, 4), [dagger]);
    });

test('dothrow() prompts with [*] when nothing is suggested', async () => {
    // invent.c:1932's `buf ? ... : " [*]"`, which only a pack with no
    // suggested letter reaches. A Wizard's quarterstaff is downplayed by
    // dothrow.c:330-331 and her scroll by :347, and GETOBJ_PROMPT is what
    // stops getobj() answering "You don't have anything to throw." instead.
    const state = arena({ role: PM_WIZARD });
    const staff = item(state, QUARTERSTAFF, { owornmask: W_WEP });
    state.uwep = staff;
    const scroll = item(state, SCR_IDENTIFY);
    pack(state, staff, scroll);
    const prompts = type(state, 'bl');
    assert.equal(await dothrow(state), ECMD_TIME);
    assert.equal(prompts[0], 'What do you want to throw? [*]');
    // A downplayed letter typed by hand is still accepted and thrown.
    assert.equal(state.invent.invlet, 'a');
    assert.equal(state.invent.nobj, null);
    assert.deepEqual(pileAt(state, state.gb.bhitpos.x, 4), [scroll]);
});

test('dothrow() answers an escaped prompt with ECMD_CANCEL', async () => {
    // dothrow.c:375's `obj ? throw_obj(...) : ECMD_CANCEL`. getobj() answers
    // null for a quit character and prints Never_mind on the way out.
    const state = arena();
    const dagger = item(state, DAGGER);
    pack(state, dagger);
    type(state, '\u001B');
    assert.equal(await dothrow(state), ECMD_CANCEL);
    assert.match(state._ttyToplines, /Never mind\./u);
    assert.equal(state.invent, dagger);
    // No direction was asked for, so throw_obj() never ran.
    assert.equal(draws().length, 0);
});

test('dothrow() stops at ok_to_throw() before drawing a prompt', async () => {
    // dothrow.c:368. The three refusals are ok_to_throw()'s, already covered
    // through dofire(); what `t` adds is that getobj() is not reached, so the
    // pack is never classified and no prompt is drawn.
    const state = arena();
    state.youmonst.data = state.mons[PM_FLOATING_EYE];
    const dagger = item(state, DAGGER);
    pack(state, dagger);
    const prompts = type(state, 'al');
    assert.equal(await dothrow(state), ECMD_OK);
    assert.match(state._ttyToplines, /physically incapable/u);
    // Not one key was read, so getobj() never drew a prompt.
    assert.deepEqual(prompts, []);
    assert.equal(state.nhDisplay.inputQueueLength, 10);
    assert.equal(state.invent, dagger);
});
