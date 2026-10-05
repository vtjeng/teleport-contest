// dothrow.c's whole `f` path: multishot_class_bonus(), breaktest(),
// find_launcher(), impact_disturbs_zombies(), ok_to_throw(), dofire(),
// throw_obj() and throwit(), plus zap.c skiprange(). Every expected value is
// read out of the C source and cited at the assertion that uses it; the
// objects.c skills and materials the arms select on are asserted first, so a
// wrong table entry fails as itself rather than as a wrong bonus.
//
// Most command helpers below use a small source-shaped arena. The recoil
// caller test uses one initialized global game because hurtle_step() redraws
// through C's process-wide display state. scripts/fire-command.test.mjs also
// covers the firing command over recorded recipes.
//
// Two kinds of assertion carry most of the weight:
//
//   - the shape of the random-number draws, `rnd(2)` or `rn2(100)` without
//     the answer. dothrow.c fixes which call happens with which argument, so
//     a branch that C does not take costs a draw that is missing here; the
//     answers depend on ARENA_SEED and are named only where one is used.
//   - the state and output left by each source branch. Calls whose C result is
//     explicitly discarded may be named as unported, but do not turn a
//     translated throw path into a production refusal.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    A_CON,
    A_DEX,
    A_STR,
    CONFUSION,
    CQ_CANNED,
    DEAF,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    ECMD_CANCEL,
    FUMBLING,
    HALLUC,
    HALLUC_RES,
    KEY_ESC,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    LAST_PROP,
    LAVAPOOL,
    LEVITATION,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    OBJ_MINVENT,
    POOL,
    P_CROSSBOW,
    P_DAGGER,
    P_EXPERT,
    P_SKILLED,
    P_SLING,
    ROOM,
    STUNNED,
    STR19,
    TT_WEB,
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
    endmultishot,
    find_launcher,
    hitfloor,
    impact_disturbs_zombies,
    hurtle,
    hurtle_step,
    mhurtle,
    multishot_class_bonus,
    should_mulch_missile,
    throw_obj,
    throw_ok,
    throwit,
    walk_path,
} from '../js/dothrow.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { vision_reset } from '../js/vision.js';
import { isThrowingWeapon } from '../js/invent.js';
import { canspotmon, GLYPH_INVISIBLE } from '../js/display.js';
import { planningState } from '../js/unported_monster_actions.js';
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
import { UnsupportedObjectOperationError, newObject, splitobj } from '../js/obj.js';
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
    LANCE,
    MINERAL,
    LENSES,
    LUCKSTONE,
    PICK_AXE,
    ORCISH_ARROW,
    ORCISH_BOW,
    POT_WATER,
    QUARTERSTAFF,
    SCALPEL,
    SHORT_SWORD,
    SHURIKEN,
    SLING,
    SPEAR,
    TOWEL,
    SCR_IDENTIFY,
    WAR_HAMMER,
    WOOD,
    YA,
    YUMI,
    objects_globals_init,
} from '../js/objects.js';
import {
    ART_EYE_OF_THE_AETHIOPICA,
    ART_EXCALIBUR,
    ART_LONGBOW_OF_DIANA,
    ART_MJOLLNIR,
    init_artifacts,
} from '../js/artifacts.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { initialize_symbols_from_options } from '../js/symbols.js';
import { HeadlessTerminal } from '../js/terminal.js';
import {
    peek_timer,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';
import { boomhit, skiprange } from '../js/zap.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_SHOPKEEPER } from '../js/monsters.js';
import { aligns } from '../js/roles.js';

const DOTHROW_C = readFileSync(
    new URL('../nethack-c/upstream/src/dothrow.c', import.meta.url), 'utf8',
);
const DOTHROW_JS = readFileSync(
    new URL('../js/dothrow.js', import.meta.url), 'utf8',
);

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

test('throwing_weapon follows the source missile and blade predicates', () => {
    // dothrow.c:1430-1438 accepts missiles, spears, non-sword piercing
    // blades, WAR_HAMMER and AKLYS.  In particular, a scalpel and ordinary
    // sword must stay outside the blade arm.
    // The source comment explicitly excludes ammunition from is_missile().
    assert.equal(isThrowingWeapon(object(state, ARROW), state), false);
    assert.equal(isThrowingWeapon(object(state, SPEAR), state), true);
    assert.equal(isThrowingWeapon(object(state, DAGGER), state), true);
    assert.equal(isThrowingWeapon(object(state, SCALPEL), state), false);
    assert.equal(isThrowingWeapon(object(state, SHORT_SWORD), state), false);
    assert.equal(isThrowingWeapon(object(state, WAR_HAMMER), state), true);
    assert.equal(isThrowingWeapon(object(state, AKLYS), state), true);
    assert.equal(isThrowingWeapon(object(state, QUARTERSTAFF), state), false);
});

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

test('should_mulch_missile follows source predicates and draw order', () => {
    // dothrow.c:1982-1985. These four inputs take the immediate FALSE arm:
    // NULL, a dagger outside both missile predicates, a boomerang excluded by
    // type, and a magic luckstone despite its GEM_CLASS ammunition skill.
    const local = makeState();
    const noDraw = () => assert.fail('predicate arm drew random numbers');
    const noRandom = { random: { rn2: noDraw, rnl: noDraw } };
    assert.equal(should_mulch_missile(null, local, noRandom), false);
    assert.equal(
        should_mulch_missile(object(local, DAGGER), local, noRandom), false,
    );
    assert.equal(
        should_mulch_missile(object(local, BOOMERANG), local, noRandom), false,
    );
    assert.equal(
        should_mulch_missile(object(local, LUCKSTONE), local, noRandom), false,
    );

    // dothrow.c:1990-1991. A +0 arrow with no erosion has chance 3 and uses
    // rn2(3), while +2 makes chance 1 and selects the rn2(4) fallback.
    const draws = [];
    let answers = [];
    const random = {
        rn2: (bound) => {
            draws.push(['rn2', bound]);
            return answers.shift() ?? 1;
        },
        rnl: (bound) => { draws.push(['rnl', bound]); return 1; },
    };
    answers = [1];
    assert.equal(
        should_mulch_missile(object(local, ARROW), local, { random }), true,
    );
    assert.deepEqual(draws, [['rn2', 3]]);
    draws.length = 0;
    answers = [0];
    assert.equal(
        should_mulch_missile(object(local, ARROW, { spe: 2 }), local,
            { random }),
        true,
    );
    assert.deepEqual(draws, [['rn2', 4]]);

    // dothrow.c:1992. Blessing uses rn2(3) while monsters are moving and
    // rnl(4) on the hero's turn; a zero draw clears an otherwise broken item.
    draws.length = 0;
    answers = [1, 0];
    local.context = { mon_moving: true };
    assert.equal(
        should_mulch_missile(object(local, ARROW, { blessed: true }), local,
            { random }),
        false,
    );
    assert.deepEqual(draws, [['rn2', 3], ['rn2', 3]]);
    draws.length = 0;
    answers = [1];
    local.context = { mon_moving: false };
    random.rnl = (bound) => { draws.push(['rnl', bound]); return 0; };
    assert.equal(
        should_mulch_missile(object(local, ARROW, { blessed: true }), local,
            { random }),
        false,
    );
    assert.deepEqual(draws, [['rn2', 3], ['rnl', 4]]);

    // dothrow.c:1996-2000. Tough gems and FLINT each get the final rn2(2)
    // check, which preserves either item when it answers zero.
    draws.length = 0;
    answers = [1, 0];
    assert.equal(
        should_mulch_missile(object(local, DIAMOND), local, { random }), false,
    );
    assert.deepEqual(draws, [['rn2', 3], ['rn2', 2]]);
    draws.length = 0;
    answers = [1, 0];
    assert.equal(
        should_mulch_missile(object(local, FLINT), local, { random }), false,
    );
    assert.deepEqual(draws, [['rn2', 3], ['rn2', 2]]);
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

test('walk_path() follows the source Bresenham cells and rewinds on failure', async () => {
    // dothrow.c:681-719. A 4-by-2 path takes the x-major arm and visits the
    // exact cells below; a failed callback leaves dest at the prior cell.
    const source = { x: 2, y: 2 };
    const destination = { x: 6, y: 4 };
    const visited = [];
    const result = await walk_path(
        source,
        destination,
        (_arg, x, y) => {
            visited.push({ x, y });
            return x !== 5;
        },
        null,
    );
    assert.equal(result, false);
    assert.deepEqual(visited, [
        { x: 3, y: 2 },
        { x: 4, y: 3 },
        { x: 5, y: 3 },
    ]);
    assert.deepEqual(destination, { x: 4, y: 3 });
});

test('hurtle_step() maps an unseen collision on the planned level only', async () => {
    const sourceStart = DOTHROW_C.indexOf(
        'hurtle_step(genericptr_t arg, coordxy x, coordxy y)',
    );
    const sourceEnd = DOTHROW_C.indexOf('\n/* used by mhurtle_step()', sourceStart);
    const cStep = DOTHROW_C.slice(sourceStart, sourceEnd);
    assert.ok(sourceStart >= 0 && sourceEnd > sourceStart,
        'the complete C hurtle_step source is available');
    assert.match(cStep,
        /wakeup\(mon, FALSE\);\s*if \(!canspotmon\(mon\)\)\s*map_invisible\(mon->mx, mon->my\);/u);

    resetGame();
    try {
        await runSegment({
            seed: ARENA_SEED,
            datetime: HURTLE_FIXTURE_DATETIME,
            nethackrc: 'OPTIONS=name:HurtleMemory,role:Valkyrie,race:human,gender:female,align:lawful\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',
            moves: '',
        });
        const state = game;
        const x = state.u.ux + 1;
        const y = state.u.uy;
        state.level.at(x, y).typ = ROOM;
        const monster = newMonster({
            data: state.mons[PM_ORC],
            mnum: PM_ORC,
            m_id: HURTLE_FIXTURE_MONSTER_ID,
            mhp: HURTLE_FIXTURE_MONSTER_HP,
            mhpmax: HURTLE_FIXTURE_MONSTER_HP,
            mcanmove: true,
            mcansee: true,
            minvis: true,
        });
        monster.nmon = state.level.monlist;
        state.level.monlist = monster;
        place_monster(monster, x, y, state);
        assert.equal(canspotmon(monster, state), false,
            'the invisible collision takes C hurtle_step()\'s map branch');

        const liveCell = state.level.at(x, y);
        liveCell.remembered_glyph = undefined;
        const originalDisplay = liveCell.disp_ch;
        const planned = planningState(state);
        const plannedMonster = planned.level.monsters[x][y];
        assert.ok(plannedMonster);
        assert.notStrictEqual(plannedMonster, monster);
        assert.equal(canspotmon(plannedMonster, planned), false);

        assert.equal(await hurtle_step({
            state: planned,
            planning: true,
            range: HURTLE_FIXTURE_COLLISION_RANGE,
        }, x, y), false);
        assert.equal(
            planned.level.at(x, y).remembered_glyph?.glyph,
            GLYPH_INVISIBLE,
            'the planning clone keeps C map memory for the unseen monster',
        );
        assert.equal(liveCell.remembered_glyph, undefined,
            'the planning pass does not write live map memory');
        assert.equal(liveCell.disp_ch, originalDisplay,
            'the planning pass does not paint the live display');

        // The live collision message is a stop message; dismiss its More so
        // the callback can finish its source-order effects.
        state.nhDisplay.pushKey(HURTLE_FIXTURE_MORE_KEY);
        assert.equal(await hurtle_step({
            state,
            range: HURTLE_FIXTURE_COLLISION_RANGE,
        }, x, y), false);
        assert.equal(liveCell.remembered_glyph?.glyph, GLYPH_INVISIBLE,
            'the live callback retains map_invisible() memory behavior');
        assert.notEqual(liveCell.disp_ch, originalDisplay,
            'the live callback still paints through map_invisible()');
    } finally {
        resetGame();
    }
});

test('hurtle() installs source multi state and walks normalized recoil', async () => {
    const start = DOTHROW_C.indexOf('\nhurtle(int dx, int dy, int range, boolean verbose)');
    const end = DOTHROW_C.indexOf('/* Move a monster through the air', start);
    const cFunction = DOTHROW_C.slice(start, end);
    assert.match(cFunction,
        /if \(Punished && !carried\(uball\)\)[\s\S]*?nomul\(0\);[\s\S]*?else if \(u\.utrap\)[\s\S]*?nomul\(0\);/u);
    assert.match(cFunction,
        /dx = sgn\(dx\);[\s\S]*?dy = sgn\(dy\);[\s\S]*?if \(!range \|\| \(!dx && !dy\) \|\| u\.ustuck\)/u);
    assert.match(cFunction,
        /nomul\(-range\);[\s\S]*?gm\.multi_reason = "moving through the air";[\s\S]*?gn\.nomovemsg = "";/u);
    assert.match(cFunction,
        /endmultishot\(TRUE\);[\s\S]*?uc\.x = u\.ux;[\s\S]*?cc\.x = u\.ux \+ \(dx \* range\);[\s\S]*?walk_path\(&uc, &cc, hurtle_step,[\s\S]*?&range\)/u);
    assert.match(DOTHROW_JS,
        /export async function hurtle\([\s\S]*?isolateVision = null/u);
    assert.match(DOTHROW_JS,
        /if \(planning\) \{\s*if \(typeof arg\?\.isolateVision !== 'function'\)[\s\S]*?arg\.isolateVision\(state\);\s*\}\s*vision_recalc\(1, \{ state, redraw \}\);/u);

    // This fixed startup input reaches the first command boundary and gives
    // hurtle_step() the initialized global display that its C redraw uses.
    resetGame();
    await runSegment({
        seed: ARENA_SEED,
        datetime: '20320415101723',
        nethackrc: 'OPTIONS=name:Hurtle,role:Valkyrie,race:human,gender:female,align:lawful\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',
        moves: '',
    });
    const state = game;
    const startX = state.u.ux;
    const startY = state.u.uy;
    // Two adjacent room cells make the normalized one-step recoil path clear.
    state.level.at(startX, startY).typ = ROOM;
    state.level.at(startX + 1, startY).typ = ROOM;
    state.level.regions ??= [];
    vision_reset(state);
    // C's range of 1 selects “float”; dx=3 proves sgn() normalizes direction.
    state.m_shot = { i: 1, n: 1, s: false };
    // Keep the source volley already complete so this test checks hurtle's
    // own output without creating endmultishot()'s separate stop message.
    state.iflags.cbreak = true;
    // The MSGTYPE_STOP float line waits for one ordinary space response.
    state.nhDisplay.pushKey(32);
    await hurtle(3, 0, 1, true, state);
    assert.deepEqual([state.u.ux, state.u.uy], [startX + 1, startY]);
    assert.equal(state.multi, -1);
    assert.equal(state.multi_reason, 'moving through the air');
    assert.equal(state.nomovemsg, '');
    assert.equal(state.m_shot.n, 1);
    assert.match(state._ttyToplines, /You float in the opposite direction\./u);

    // A detached punished ball and the web branch both stop before moving.
    const punished = arena();
    punished.uball = { where: OBJ_FREE };
    // A positive multi value lets C nomul(0) clear the ongoing count; the
    // source guard preserves negative counts as the documented bug fix.
    punished.multi = 1;
    await hurtle(1, 0, 1, false, punished);
    assert.deepEqual([punished.u.ux, punished.u.uy], [1, 4]);
    assert.equal(punished.multi, 0);
    assert.equal(punished.multi_reason, null);
    assert.match(punished._ttyToplines, /tug from the iron ball/u);

    const webbed = arena();
    webbed.u.utrap = 1;
    webbed.u.utraptype = TT_WEB;
    await hurtle(1, 0, 1, false, webbed);
    assert.deepEqual([webbed.u.ux, webbed.u.uy], [1, 4]);
    assert.equal(webbed.multi, 0);
    assert.match(webbed._ttyToplines, /anchored by the web/u);
});

test('mhurtle() moves a monster through the source callback and floor tail',
    async () => {
        const stepStart = DOTHROW_C.indexOf('mhurtle_step(genericptr_t arg');
        const stepEnd = DOTHROW_C.indexOf('/*\n * The player moves', stepStart);
        const cStep = DOTHROW_C.slice(stepStart, stepEnd);
        assert.match(cStep, /res = mintrap\(mon, HURTLING\);/u);
        assert.match(cStep,
            /res == Trap_Killed_Mon[\s\S]*?res == Trap_Caught_Mon[\s\S]*?res == Trap_Moved_Mon/u);
        assert.match(DOTHROW_C,
            /walk_path\(&mc, &cc, mhurtle_step,[\s\S]*?if \(!DEADMONSTER\(mon\)\)/u);

        const fixture = arena();
        const state = Object.assign(resetGame(), fixture);
        // The callback still calls display.c flush_screen() at each cell;
        // the source's level-construction suppression keeps this unit test
        // focused on map movement instead of full status-line initialization.
        state.in_mklev = true;
        state.level.regions = [];
        state.context = { ident: 1, mon_moving: false };
        const monster = newMonster({
            data: state.mons[PM_ORC],
            m_id: 1,
            mhp: 20,
            mhpmax: 20,
            mcansee: true,
            mcanmove: true,
        });
        place_monster(monster, 7, 4, state);
        try {
            await mhurtle(monster, -1, 0, 2, {
                state,
                message: async () => {},
            });
            assert.deepEqual([monster.mx, monster.my], [5, 4]);
            assert.equal(monster.movement, 0);
            assert.equal(monster.mstun, 1);
        } finally {
            resetGame();
        }
    });

// ---------------------------------------------------------------------------
// dofire(), throw_obj() and throwit() on a built state
// ---------------------------------------------------------------------------

// One seed for every arena below. arena() reseeds, so each test reads the same
// stream from its own first draw and no test depends on the order the runner
// picked. Two answers this seed fixes are used, and each is named where it is:
// the first rn2(100) is 45 and the first rn2(7) is 5.
// The hurtle fixture also uses this seed for repeatable startup state.
const ARENA_SEED = 1;

// The fixed date gives this startup-state regression a repeatable layout.
const HURTLE_FIXTURE_DATETIME = '20320415101723';
// A stable identity and positive HP keep the test target alive in the clone.
const HURTLE_FIXTURE_MONSTER_ID = 991;
const HURTLE_FIXTURE_MONSTER_HP = 10;
// One-cell range reaches the adjacent target; space dismisses its More.
const HURTLE_FIXTURE_COLLISION_RANGE = 1;
const HURTLE_FIXTURE_MORE_KEY = 32;

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

// C permits an object to carry an artifact ID only after that artifact exists.
// The test fixture builds the canonical artifact table, supplies a valid
// role_init alignment row, and marks the selected artifact as already created.
function markArtifactExisting(state, artifact) {
    state.flags.initalign = aligns.findIndex(
        (alignment) => alignment.name === 'neutral',
    );
    init_artifacts(state);
    state.artiexist[artifact].exists = 1;
}

// Every draw so far, as `name(argument)`. The answers are dropped: dothrow.c
// fixes the calls and their arguments, and the answers belong to ARENA_SEED.
function draws() {
    return getRngLog().map((entry) => entry.slice(0, entry.indexOf('=')));
}

test('hitfloor keeps its message, break, ship, and impact-drop order',
    async () => {
        const source = DOTHROW_C.slice(
            DOTHROW_C.indexOf('\nhitfloor('),
            DOTHROW_C.indexOf('\n/*\n * Walk a path',
                DOTHROW_C.indexOf('\nhitfloor(')),
        );
        const messageAt = source.indexOf('pline(');
        const breakAt = source.indexOf('hero_breaks(');
        const shipAt = source.indexOf('ship_object(');
        const dropAt = source.indexOf('dropz(obj, TRUE)');
        assert.ok(messageAt >= 0 && messageAt < breakAt);
        assert.ok(breakAt < shipAt && shipAt < dropAt);

        const state = arena();
        const dagger = item(state, DAGGER);
        state._ttyToplines = '';

        await hitfloor(dagger, true, state);

        assert.match(state._ttyToplines, /hits the floor\./u);
        assert.equal(dagger.where, OBJ_FLOOR);
        assert.equal(state.level.objects[1][4], dagger);
    });

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
    assert.equal(state.gt.thrownobj, null);
});

test('throwit() names a pick caught by a shopkeeper with the supplied state',
    async () => {
        // dothrow.c:1809-1816 runs after the missile's landing effects when a
        // shopkeeper catches a pick. Keep the target helpless so thitmonst()
        // leaves the object alive for that source tail, then assert that the
        // production call reaches it without an unbound xname() helper.
        const shopState = arena({ last: 9 });
        shopState.u.ualign = { type: 0, record: 0, abuse: 0 };
        const shopkeeper = newMonster({
            data: shopState.mons[PM_SHOPKEEPER],
            m_id: 1,
            mhp: 1000,
            mhpmax: 1000,
            mcanmove: false,
            mpeaceful: true,
            isshk: true,
        });
        place_monster(shopkeeper, 7, 4, shopState);
        const pick = item(shopState, PICK_AXE);
        await throwit(pick, 0, false, null, shopState);
        assert.equal(pick.where, OBJ_MINVENT);
        assert.equal(pick.ocarry, shopkeeper);
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
        // next; its downward branch reaches hitfloor() without a second
        // verbose landing message.
        const down = arena();
        down.u.dx = 0;
        down.u.dy = 0;
        down.u.dz = 1;
        await throwit(item(down, DAGGER, { cursed: 1 }), 0, false, null, down);
        assert.equal(down.iflags.returning_missile, null);
        assert.equal(down.gt.thrownobj, null);
        // hitfloor() now reaches hero_breaks() and its breaktest() even for
        // this ordinary iron dagger; the source asks obj_resists() once.
        assert.deepEqual(draws(), ['rn2(100)']);
    });

test('throwit runs the complete upward toss path before retiring the throw',
    async () => {
        // dothrow.c:1589-1594 passes `(rn2(5) && !Underwater)` to toss_up().
        // Its Boolean is discarded, but its impact damage and source order
        // remain observable before throwit_return() clears the transit object.
        const state = arena();
        state.u.dx = 0;
        state.u.dy = 0;
        state.u.dz = -1;
        state._ttyToplines = '';
        state.iflags.cbreak = true;
        // The new hitfloor tail can emit several source-ordered messages;
        // dismiss their pagers so this unit test reaches throwit_return().
        for (let i = 0; i < 8; i += 1) state.nhDisplay.pushKey(32);
        const thrown = item(state, DAGGER);
        const hp = state.u.uhp;

        await throwit(thrown, 0, false, null, state);

        assert.ok(draws().includes('rn2(5)'));
        assert.ok(draws().includes('rnd(4)'));
        assert.ok(state.u.uhp < hp);
        assert.equal(state._ttyToplines, 'A dagger hits the floor.');
        assert.equal(state.gt.thrownobj, null);
    });

test('throwit() handles weapons that return to the hand', async () => {
    // dothrow.c:30-34 AutoReturn(). The aklys arm needs the weapon in the
    // primary slot; the boomerang arm needs nothing.
    const wielded = arena();
    const returning = item(wielded, AKLYS);
    await throwit(returning, W_WEP, false, null, wielded);
    assert.equal(wielded.uwep, returning);
    assert.equal(wielded.iflags.returning_missile, null);
    // Thrown from anywhere but the hand the same aklys is an ordinary
    // missile, so it flies and lands.
    const loose = arena();
    const aklys = item(loose, AKLYS);
    await throwit(aklys, 0, false, null, loose);
    assert.deepEqual(pileAt(loose, loose.gb.bhitpos.x, 4), [aklys]);
    // A boomerang returns whatever slot it came from. Its curved traversal
    // ends at the map boundary in this empty arena, where throwit() drops it.
    const boomerang = arena();
    const thrownBoomerang = item(boomerang, BOOMERANG);
    await throwit(thrownBoomerang, 0, false, null, boomerang);
    assert.equal(boomerang.iflags.returning_missile, null);
    assert.equal(boomerang.gt.thrownobj, null);

    // youprop.h Hallucination: HHalluc && !HHalluc_res.  Resistance keeps
    // this weapon on the source's successful return arm, including the
    // second rn2(100) that the impaired arm skips.
    const resistant = arena();
    resistant.u.uprops[HALLUC].intrinsic = 1;
    resistant.u.uprops[HALLUC_RES].extrinsic = 1;
    const resistantAklys = item(resistant, AKLYS);
    await throwit(resistantAklys, W_WEP, true, null, resistant);
    assert.equal(resistant.uwep, resistantAklys);
    assert.equal(resistant.u.twoweap, true);
    assert.deepEqual(draws(), ['rn2(100)', 'rn2(100)']);
});

test('throwit() treats unresisted hallucination as impaired', async () => {
    const hallucinating = arena();
    hallucinating.u.uprops[HALLUC].intrinsic = 1;
    const aklys = item(hallucinating, AKLYS);
    // dothrow.c:throwit() tests the first rn2(100), then the impaired hero
    // skips the successful-return rn2(100) and reaches the rn2(2) landing
    // choice. js/dothrow.js:throwit() passes only `{ state }` to its dropy()
    // call, so that existing caller lacks required hooks. The path stops in
    // do.c:dropy() -> dropz() at the missing display.c:newsym check.
    // This pins the impaired branch and current caller boundary; it does not
    // claim that the object reaches the floor.
    await assert.rejects(
        () => throwit(aklys, W_WEP, false, null, hallucinating),
        /unsupported drop: missing newsym operation/u,
    );
    assert.notEqual(hallucinating.uwep, aklys);
    // The impaired arm goes directly to the damage test after its initial
    // return roll; it must not spend the successful-return rn2(100).
    assert.deepEqual(draws(), ['rn2(100)', 'rn2(2)']);
});

test('endmultishot() reports the source ordinal for a verbose volley stop', async () => {
    // dothrow.c:590-601.  A verbose stop outside monster movement emits the
    // source's firing/shot wording and then clamps the volley at m_shot.i;
    // ordinal 2 must use "2nd", while the toss arm uses the same formatter.
    const firing = arena();
    firing.m_shot = { i: 2, n: 5, s: true };
    firing.context.mon_moving = false;
    await endmultishot(true, firing);
    assert.equal(firing.m_shot.n, 2);
    assert.equal(
        firing._pending_message,
        'You stop firing after the 2nd shot.',
    );

    const throwing = arena();
    throwing.m_shot = { i: 13, n: 20, s: false };
    throwing.context.mon_moving = false;
    await endmultishot(true, throwing);
    assert.equal(throwing.m_shot.n, 13);
    assert.equal(
        throwing._pending_message,
        'You stop throwing after the 13th toss.',
    );
});

test('boomhit() applies the source self-hit and ends its volley', async () => {
    // zap.c:4148-4236.  A broad room lets the curved path return to the
    // hero; Fumbling selects the self-hit arm without spending the catch
    // roll.  The source-discarded calls still run their own effects: thitu()
    // damages the hero and endmultishot(TRUE) reports the stopped volley.
    const state = arena({ last: 30, uhp: 100, uhpmax: 100 });
    for (let y = 0; y < 21; y++) {
        for (let x = 1; x < 80; x++) state.level.at(x, y).typ = ROOM;
    }
    state.u.ux = 40;
    state.u.uy = 10;
    state.u.uac = 100;
    state.u.uprops[FUMBLING].intrinsic = 1;
    state.m_shot = { i: 1, n: 3, s: true };
    const boomerang = item(state, BOOMERANG);
    await boomhit(boomerang, 1, 0, state);
    assert.equal(state.m_shot.n, 1);
    assert.equal(state.u.uhp < 100, true);
    assert.match(state._ttyToplines, /You stop firing after the 1st shot\./u);
});

test('throwit() reaches hurtle after a weightless throw', async () => {
    // dothrow.c:1650-1657, `Is_airlevel(&u.uz) || Levitation`. Neither holds
    // for an ordinary floor; this levitating hero takes that arm. The web
    // pins hurtle at its source trap exit so this arena tests caller wiring,
    // while the live-game hurtle test above covers movement and redraw.
    const state = arena();
    state.u.uprops[LEVITATION].extrinsic = 1;
    state.u.utrap = 1;
    state.u.utraptype = TT_WEB;
    state.multi = 1;
    state.iflags.cbreak = true;
    // bhit and the anchored recoil message may reach an ordinary --More--.
    for (let i = 0; i < 8; ++i) state.nhDisplay.pushKey(32);
    const dagger = item(state, DAGGER);
    await throwit(dagger, 0, false, null, state);
    assert.deepEqual([state.u.ux, state.u.uy], [1, 4]);
    assert.ok(state.gb.bhitpos.x > state.u.ux);
    assert.equal(state.gt.thrownobj, null);
    assert.equal(state.multi, 0);
    assert.match(state._ttyToplines, /anchored by the web/u);
    assert.deepEqual(draws(), ['rn2(100)']);
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

test('throwit() halves an unlaunched missile range and names the hand throw',
    async () => {
        // dothrow.c:1640-1647.  An arrow without a matching launcher keeps
        // the throw path: urange is 8, its range is 8 before the ammo arm,
        // and the no-launcher branch halves that to 4.  The message uses
        // skill_name(weapon_type(obj)), weapon_descr(obj), and body_part(HAND)
        // in that source order.
        const state = arena({ last: 20 });
        state._ttyToplines = '';
        const arrow = item(state, ARROW);
        await throwit(arrow, 0, false, null, state);
        assert.equal(state._ttyToplines,
            "You aren't wielding a bow, so you throw your arrow by hand.");
        assert.deepEqual(state.gb.bhitpos, { x: 5, y: 4 });
        assert.deepEqual(draws(), ['rn2(100)']);
        assert.deepEqual(pileAt(state, 5, 4), [arrow]);
    });

test('throwit() breaks what lands hard and drowns what lands wet',
    async () => {
        // dothrow.c:1780. A cream pie is on breaktest()'s switch list at
        // :2601 and ARENA_SEED's first rn2(100) is 45, well clear of the
        // nonbreakchance of 1, so it does not resist.
        const hard = arena();
        const shattered = item(hard, CREAM_PIE);
        await throwit(shattered, 0, false, null, hard);
        // breaktest() asks obj_resists() first; breakobj() then owns the
        // source deletion lifecycle and performs its second protection draw.
        assert.deepEqual(draws(), ['rn2(100)', 'rn2(100)']);
        assert.equal(shattered.where, OBJ_DELETED);
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
        const wetDagger = item(wet, DAGGER);
        await throwit(wetDagger, 0, false, null, wet);
        assert.deepEqual(draws(), ['rn2(20)']);
        assert.equal(wetDagger.where, OBJ_FLOOR);
    });

test('breakobj wires the lit-oil source branch before object cleanup', () => {
    const c = readFileSync(
        new URL('../nethack-c/upstream/src/dothrow.c', import.meta.url),
        'utf8',
    );
    const cStart = c.indexOf('breakobj(\n    struct obj *obj,');
    const cEnd = c.indexOf('\n}\n\n/*', cStart);
    assert.ok(cStart > 0 && cEnd > cStart);
    const cBody = c.slice(cStart, cEnd).replace(/\s+/gu, ' ');
    assert.match(cBody,
        /if \(obj->otyp == POT_OIL && obj->lamplit\) \{ explode_oil\(obj, x, y\);/u);

    const js = readFileSync(new URL('../js/dothrow.js', import.meta.url), 'utf8');
    const jsStart = js.indexOf('export async function breakobj(');
    const jsEnd = js.indexOf('\n}\n\nfunction next2u', jsStart);
    assert.ok(jsStart > 0 && jsEnd > jsStart);
    const jsBody = js.slice(jsStart, jsEnd);
    assert.match(jsBody,
        /obj\.in_use = 1;[\s\S]*?if \(obj\.otyp === POT_OIL && obj\.lamplit\) \{\s*await explode_oil\(obj, x, y, state,/u);
    assert.ok(jsBody.indexOf('await explode_oil(obj, x, y, state,')
        < jsBody.indexOf('if (!fracture) delobj(obj, objectEnv)'));
    assert.equal(jsBody.includes("note_unported('potion.c explode_oil')"), false);
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
        await throwit(item(splash, DAGGER), 0, false, null, splash);
        assert.equal(splash._ttyToplines, 'Splash!');
        // rm.h:129 puts POOL at 16 and DRAWBRIDGE_UP at 19, so IS_POOL and
        // with it IS_SOFT (rm.h:140) hold here, and dothrow.c:1780's
        // `!IS_SOFT(...) && breaktest(obj)` short-circuits before breaktest().
        // The sound itself has no roll; water_damage's rust protection draw
        // follows the landing message.  erode_obj's visobj gate suppresses
        // the rust line on a pool square, matching trap.c's submerged-object
        // visibility test.
        assert.deepEqual(draws(), ['rn2(20)']);

        // The same pool, at exactly WT_SPLASH_THRESHOLD: C wants strictly
        // more than the threshold, so nine darts only plop.
        const plop = arena();
        plop.level.at(9, 4).typ = POOL;
        plop._ttyToplines = '';
        await throwit(item(plop, DART, { quan: 9, owt: 9 }),
            0, false, null, plop);
        assert.equal(plop._ttyToplines, 'Plop!');
        assert.deepEqual(draws(), ['rn2(20)']);

        // One dart more clears it. The fixture carries a deliberately stale
        // owt of 1: mkobj.c weight() recomputes `oc_weight * quan` as 10,
        // so this case says Splash! only if the port asks weight() rather
        // than reading the cached field, which would answer 1 and plop.
        const heavier = arena();
        heavier.level.at(9, 4).typ = POOL;
        heavier._ttyToplines = '';
        await throwit(item(heavier, DART, { quan: 10, owt: 1 }),
            0, false, null, heavier);
        assert.equal(heavier._ttyToplines, 'Splash!');
        assert.deepEqual(draws(), ['rn2(20)']);

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
        await throwit(item(lava, DAGGER), 0, false, null, lava);
        assert.equal(lava._ttyToplines, 'Splash!');
        // rm.h:76 puts LAVAPOOL at 20, outside IS_POOL, so IS_SOFT is false
        // and dothrow.c:1780 does call breaktest(), which asks
        // obj_resists(obj, 1, 99) (dothrow.c:2592) and spends its rn2(100).
        // A lava landing therefore draws where a pool landing does not, and
        // it draws before the sound.
        assert.deepEqual(draws(), ['rn2(100)', 'rn2(100)']);

        // A wooden club over the same lava is flammable, so the landing sound
        // is suppressed and flooreffects() -> lava_damage() reports its
        // destruction instead.
        const burns = arena();
        burns.level.at(9, 4).typ = LAVAPOOL;
        burns._ttyToplines = '';
        await throwit(item(burns, CLUB), 0, false, null, burns);
        assert.equal(burns._ttyToplines, 'It burns up!');
        // Silent landing sound, but not draw-free: breaktest() runs for lava
        // whatever the object is made of, then lava_damage() asks obj_resists
        // once more before reporting the destruction.
        assert.deepEqual(draws(), ['rn2(100)', 'rn2(100)', 'rn2(100)']);

        // youprop.h Deaf (125) has three sources and the roleplay conduct is
        // the one a game can start with. A deaf hero hears no splash, and the
        // pool's visobj gate also keeps the floor rust line hidden.
        const conduct = arena();
        conduct.level.at(9, 4).typ = POOL;
        conduct.u.uroleplay = { deaf: true };
        conduct._ttyToplines = '';
        await throwit(item(conduct, DAGGER), 0, false, null, conduct);
        assert.equal(conduct._ttyToplines, '');
        assert.deepEqual(draws(), ['rn2(20)']);

        // The DEAF property also suppresses the splash; the floor erosion
        // remains hidden on the pool square.
        const deafened = arena();
        deafened.level.at(9, 4).typ = POOL;
        deafened.u.uprops[DEAF].intrinsic = 1;
        deafened._ttyToplines = '';
        await throwit(item(deafened, DAGGER), 0, false, null, deafened);
        assert.equal(deafened._ttyToplines, '');
        assert.deepEqual(draws(), ['rn2(20)']);

        // youprop.h Underwater (279) is u.uinwater, which dothrow.c:1637 has
        // already read to cut the range to 1: the missile lands at column 2,
        // so that is where this pool goes.
        const submerged = arena();
        submerged.level.at(2, 4).typ = POOL;
        submerged.u.uinwater = 1;
        submerged._ttyToplines = '';
        await throwit(item(submerged, DAGGER), 0, false, null, submerged);
        assert.equal(submerged.gb.bhitpos.x, 2);
        assert.equal(submerged._ttyToplines, 'The dagger rusts!');
        // Draw-free because this pool skips breaktest(), not because the
        // Underwater gate suppressed anything: that gate owns the sound
        // alone.
        assert.deepEqual(draws(), ['rn2(20)']);
    });

test('throwit() ships an object down a ladder but not down a hole it '
    + 'cannot see', async () => {
    // dokick.c down_gate(), which ship_object() (dothrow.c:1819) asks first.
    // A ladder always ships; unlike stairs, it has no rn2(3) stay-here roll.
    const stairs = arena();
    stairs.stairs = { sx: 9, sy: 4, up: false, isladder: true,
        tolev: { dnum: 0, dlevel: 2 }, next: null };
    const shipped = item(stairs, DAGGER);
    await throwit(shipped, 0, false, null, stairs);
    assert.equal(stairs.gm.migrating_objs, shipped);
    assert.deepEqual([shipped.ox, shipped.oy], [0, 2]);
    assert.deepEqual(pileAt(stairs, 9, 4), []);
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
    seen.dungeons = [{ num_dunlevs: 10 }];
    seen.level.traps = [{ tx: 9, ty: 4, ttyp: TRAPDOOR, tseen: true }];
    const atHole = item(seen, DAGGER);
    await throwit(atHole, 0, false, null, seen);
    assert.ok(draws().includes('rn2(3)'), 'a seen hole asks whether to ship');
    assert.ok(seen.gm?.migrating_objs === atHole
        || pileAt(seen, 9, 4).includes(atHole));
});

test('throwit() settles an unpaid missile after landing', async () => {
    // dothrow.c:1835, `(*u.ushops || obj->unpaid) && obj != uball`. Either
    // half alone reaches check_shop_obj(), so an unpaid missile thrown
    // outside a shop still does.
    const unpaid = arena();
    const unpaidDagger = item(unpaid, DAGGER, { unpaid: 1 });
    await throwit(unpaidDagger, 0, false, null, unpaid);
    assert.deepEqual(pileAt(unpaid, 9, 4), [unpaidDagger]);
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
            state.iflags.cbreak = true;
            const displayed = [];
            const readKey = state.nhDisplay.readKey.bind(state.nhDisplay);
            state.nhDisplay.readKey = (...args) => {
                displayed.push(state._pending_message ?? '');
                return readKey(...args);
            };
            for (let i = 0; i < 8; i += 1)
                state.nhDisplay.pushKey(' '.charCodeAt(0));
            // The block sets u.dz to 1 and reaches hitfloor() after its
            // stamina message. Iron survives breaktest and is placed at the
            // hero's feet before throwit() retires its transit state.
            await throwit(dagger, 0, false, null, state);
            assert.equal(state.u.dz, 1, row.name);
            assert.ok(displayed.some((line) => /so little stamina/u.test(line)),
                row.name);
            assert.equal(state._ttyToplines,
                'Your movements are slowed slightly because of your load.',
                row.name);
            assert.equal(state.gt.thrownobj, null, row.name);
            assert.equal(dagger.where, OBJ_FLOOR, row.name);
            // :1557 exercises Constitution downward, and attrib.c
            // exerciseAttribute() spends `-rn2(2)` on a decrease where an
            // increase would ask rn2(19) and compare it against the
            // attribute.
            assert.deepEqual(draws(), ['rn2(2)', 'rn2(100)'], row.name);
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

test('throwit() keeps its foreign naming state for the stamina message',
    async () => {
        const foreign = arena({ str: 3, con: 3, uhp: 5, uhpmax: 12 });
        foreign.flags.initalign = 0;
        init_artifacts(foreign);
        foreign.gf = {
            ffruit: { fname: 'Excalibur', fid: 7, nextf: null },
        };
        foreign.artilist[ART_EXCALIBUR].name = 'Elsecalibur';
        const daggerType = foreign.objects[DAGGER];
        foreign.obj_descr[daggerType.oc_name_idx].oc_name = 'Excalibur';
        carry(foreign, item(foreign, DAGGER, { owt: 270 }));
        foreign._ttyToplines = '';
        foreign.iflags.cbreak = true;
        const displayed = [];
        const readKey = foreign.nhDisplay.readKey.bind(foreign.nhDisplay);
        foreign.nhDisplay.readKey = (...args) => {
            displayed.push(foreign._pending_message ?? '');
            return readKey(...args);
        };
        for (let i = 0; i < 8; i += 1)
            foreign.nhDisplay.pushKey(' '.charCodeAt(0));

        await throwit(
            item(foreign, DAGGER, { owt: 30 }), 0, false, null, foreign,
        );
        assert.ok(displayed.includes(
            'You have so little stamina, the Excalibur drops from your grasp.',
        ));
        assert.equal(foreign._ttyToplines,
            'Your movements are slowed slightly because of your load.');
    });

test('throwit() reads the stamina test differently in each direction',
    async () => {
        // dothrow.c:1549's first conjunct is `(u.dx || u.dy || (u.dz < 1))`.
        // Aimed straight up -- u.dx and u.dy zero, u.dz -1 -- only the third
        // term holds, and it is enough. The block then aims the throw down;
        // both source paths finish their vertical helper and clear transit.
        const upward = arena({ str: 3, con: 3, uhp: 5 });
        carry(upward, item(upward, DAGGER, { owt: 270 }));
        upward.u.dx = 0;
        upward.u.dy = 0;
        upward.u.dz = -1;
        upward._ttyToplines = '';
        upward.iflags.cbreak = true;
        for (let i = 0; i < 8; i += 1)
            upward.nhDisplay.pushKey(' '.charCodeAt(0));
        await throwit(
            item(upward, DAGGER, { owt: 30 }), 0, false, null, upward,
        );
        assert.equal(upward._ttyToplines,
            'Your movements are slowed slightly because of your load.');
        assert.equal(upward.u.dz, 1);
        // Aimed straight down, `u.dz < 1` is false and no term holds, so the
        // same tired hero keeps hold of the same weight.
        const downward = arena({ str: 3, con: 3, uhp: 5 });
        carry(downward, item(downward, DAGGER, { owt: 270 }));
        const downwardDagger = item(downward, DAGGER, { owt: 30 });
        downward.u.dx = 0;
        downward.u.dy = 0;
        downward.u.dz = 1;
        downward._ttyToplines = '';
        downward.iflags.cbreak = true;
        for (let i = 0; i < 8; i += 1)
            downward.nhDisplay.pushKey(' '.charCodeAt(0));
        await throwit(downwardDagger, 0, false, null, downward);
        assert.doesNotMatch(downward._ttyToplines, /so little stamina/u);
        // C's global `gb` is always allocated; the downward arm reaches the
        // throw cleanup without leaving an object in its transit slot.
        assert.ok(downward.gb);
        assert.equal(downward.gt.thrownobj, null);
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

test('throw_obj removes a singleton wielded item before freeing it', async () => {
    assert.match(DOTHROW_C,
        /if \(otmp->owornmask\)\s*remove_worn_item\(otmp, FALSE\);[\s\S]*?freeinv\(otmp\)/u);

    const state = arena();
    const weapon = item(state, DAGGER, { owornmask: W_WEP });
    carry(state, weapon);
    state.uwep = weapon;
    state.uquiver = null;
    aimEast(state);

    assert.equal(await throw_obj(weapon, 0, state), ECMD_TIME);
    assert.equal(state.uwep, null,
        'remove_worn_item clears the wielded slot before transfer');
    assert.equal(weapon.owornmask, 0,
        'the thrown item is no longer marked worn');
    assert.equal(weapon.where, OBJ_FLOOR,
        'the singleton reaches the thrown object landing path');
    assert.deepEqual(pileAt(state, 9, 4), [weapon]);
});

test('throw_obj applies C\'s wield and strength gates only to Mjollnir',
    async () => {
        const source = DOTHROW_C.slice(
            DOTHROW_C.indexOf('\nthrow_obj('),
            DOTHROW_C.indexOf('\n/* common to dothrow'),
        );
        assert.match(source,
            /is_art\(obj, ART_MJOLLNIR\) && obj != uwep/u);
        assert.match(source,
            /is_art\(obj, ART_MJOLLNIR\) && ACURR\(A_STR\) < STR19\(25\)/u);
        assert.match(DOTHROW_JS,
            /if \(is_art\(obj, ART_MJOLLNIR\) && obj !== state\.uwep\)/u);
        assert.match(DOTHROW_JS,
            /acurr\(state, A_STR\) < STR19\(25\)/u);

        // The first C guard is before the weight check. An unwielded Mjollnir
        // at STR19(25) still receives the wield message and remains carried.
        const loose = arena({ str: STR19(25) });
        markArtifactExisting(loose, ART_MJOLLNIR);
        const looseHammer = item(loose, WAR_HAMMER,
            { oartifact: ART_MJOLLNIR });
        carry(loose, looseHammer);
        aimEast(loose);
        loose._ttyToplines = '';
        assert.equal(await throw_obj(looseHammer, 0, loose), ECMD_OK);
        assert.match(
            loose._ttyToplines,
            /war hammer must be wielded before it can be thrown/u,
            'without discovery, C xname uses the artifact base type',
        );
        assert.equal(loose.invent, looseHammer,
            'the unwielded artifact stays in inventory');

        // STR19(25) is 125 in attrib.h; one point below it takes the heavy
        // branch after the wielded-item guard passes.
        const weak = arena({ str: STR19(25) - 1 });
        const weakHammer = item(weak, WAR_HAMMER,
            { oartifact: ART_MJOLLNIR, owornmask: W_WEP });
        carry(weak, weakHammer);
        weak.uwep = weakHammer;
        aimEast(weak);
        weak._ttyToplines = '';
        assert.equal(await throw_obj(weakHammer, 0, weak), ECMD_TIME);
        assert.match(weak._ttyToplines, /It's too heavy\./u);
        assert.equal(weak.invent, weakHammer,
            'the below-threshold hammer is not removed');

        // At the exact C threshold, the strength conjunct is false. A Wizard
        // is used so AutoReturn does not put Mjollnir back in the hand after
        // the ordinary throw path.
        const strong = arena({ role: PM_WIZARD, str: STR19(25) });
        markArtifactExisting(strong, ART_MJOLLNIR);
        const strongHammer = item(strong, WAR_HAMMER,
            { oartifact: ART_MJOLLNIR, owornmask: W_WEP });
        carry(strong, strongHammer);
        strong.uwep = strongHammer;
        aimEast(strong);
        strong._ttyToplines = '';
        assert.equal(await throw_obj(strongHammer, 0, strong), ECMD_TIME);
        assert.doesNotMatch(strong._ttyToplines, /too heavy/u);
        assert.equal(strongHammer.where, OBJ_FLOOR,
            'the threshold-strength hammer follows the throw path');
    });

test('throw_obj() preserves the corpse message before discarded instapetrify',
    async () => {
        // dothrow.c:139-143 gates this on no gloves, a petrifying corpse, and
        // no Stone_resistance. The C void instapetrify() call remains a named
        // gap after its message and killer-name setup.
        const state = arena();
        const corpse = item(state, CORPSE, { corpsenm: PM_COCKATRICE });
        carry(state, corpse);
        state.uquiver = corpse;
        aimEast(state);

        const sourceStart = DOTHROW_C.indexOf('\nthrow_obj(');
        const sourceEnd = DOTHROW_C.indexOf('\n/* common to dothrow()', sourceStart);
        const source = DOTHROW_C.slice(sourceStart, sourceEnd);
        const messageAt = source.indexOf('You("throw %s with your bare %s."');
        const killerAt = source.indexOf('Sprintf(svk.killer.name, "throwing %s bare-handed"');
        const helperAt = source.indexOf('instapetrify(svk.killer.name);');
        assert.ok(messageAt >= 0 && messageAt < killerAt && killerAt < helperAt,
            'C prints, sets svk.killer.name, then calls the void helper');
        assert.match(source,
            /corpse_xname\(obj, \(const char \*\) 0, CXN_PFX_THE\)/u);
        assert.match(source, /makeplural\(body_part\(HAND\)\)/u);

        const previousUnported = game.unported;
        game.unported = new Set();
        try {
            const result = await throw_obj(corpse, 0, state);
            // C has no later throw_obj branch before the void helper returns;
            // this gap test asserts the preceding effects without inventing
            // instapetrify's terminal side effects.
            assert.equal(result, ECMD_TIME);
            assert.match(state._ttyToplines,
                /You throw the cockatrice corpse with your bare hands\./u);
            assert.match(state.svk.killer.name,
                /^throwing .*cockatrice corpse bare-handed$/u);
            assert.equal(game.unported.has('trap.c instapetrify'), true);
            assert.equal(corpse.where, OBJ_FLOOR,
                'after the discarded helper boundary, throw_obj continues');
        } finally {
            game.unported = previousUnported;
        }
    });

// Source order has canletgo() before throw_obj()'s later welded() branch;
// canletgo() rejects the same wielded-and-cursed item, so weldmsg() is a C
// source branch but is not reachable from a valid throw_obj caller state.
test('throw_obj dries a wet towel before continuing the throw',
    async () => {
        const sourceStart = DOTHROW_C.indexOf('\nthrow_obj(');
        const sourceEnd = DOTHROW_C.indexOf('\n/* common to dothrow()', sourceStart);
        const source = DOTHROW_C.slice(sourceStart, sourceEnd);
        const canletgoAt = source.indexOf('canletgo(obj, "throw")');
        const weldedAt = source.indexOf('if (welded(obj))');
        const dryAt = source.indexOf('dry_a_towel(obj, -1, FALSE);');
        const multishotAt = source.indexOf('/* Multishot calculations');
        assert.ok(canletgoAt < weldedAt && weldedAt < dryAt && dryAt < multishotAt,
            'C tests the canletgo guard, then welded, then dries before multishot');
        assert.match(source, /weldmsg\(obj\);/u);

        const previousUnported = game.unported;
        game.unported = new Set();
        try {
            // A cursed wielded dagger exercises canletgo()'s welded guard;
            // that earlier guard returns before the later weldmsg() call.
            const stuck = arena();
            const dagger = item(stuck, DAGGER, {
                cursed: 1,
                bknown: 1,
                owornmask: W_WEP,
            });
            carry(stuck, dagger);
            stuck.uwep = dagger;
            aimEast(stuck);
            assert.equal(await throw_obj(dagger, 0, stuck), ECMD_OK);
            assert.equal(game.unported.has('wield.c weldmsg'), false,
                'the valid C caller cannot reach the later welded arm');
            assert.equal(stuck.invent, dagger);

            // is_wet_towel() reads positive spe as wetness; one is its minimal
            // wet value. C calls the void drying helper before the throw.
            const state = arena();
            const towel = item(state, TOWEL, { spe: 1 });
            carry(state, towel);
            state.uquiver = towel;
            aimEast(state);
            assert.equal(await throw_obj(towel, 0, state), ECMD_TIME);
            assert.equal(towel.spe, 0,
                'weapon.c dry_a_towel removes one unit of wetness');
            assert.equal(game.unported.has('weapon.c dry_a_towel'), false);
            assert.equal(towel.where, OBJ_FLOOR,
                'the source continues to throw after dry_a_towel');
        } finally {
            game.unported = previousUnported;
        }
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
                // The closed block sizes the volley at one. The downward
                // split missile now completes hitfloor(), including its
                // source breaktest draw, while the parent stays in inventory.
                await throw_obj(held, 0, impaired);
                assert.deepEqual(draws(), ['rnd(2)', 'rn2(100)'],
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
        await throw_obj(ready, 0, clear);
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

test('throw_obj adds a volley only for the hero\'s quest-artifact launcher',
    async () => {
        const source = DOTHROW_C.slice(
            DOTHROW_C.indexOf('\nthrow_obj('),
            DOTHROW_C.indexOf('\n/* common to dothrow'),
        );
        assert.match(source,
            /if \(uwep && is_quest_artifact\(uwep\)[\s\S]*?ammo_and_launcher\(obj, uwep\)\)\s*\+\+multishot;/u);

        // The ordinary Ranger receives its C role bonus, but has neither the
        // racial-arrow bonus (human, not elf) nor a quest-artifact launcher.
        // A five-arrow stack is enough to observe the source's volley bound.
        const ordinary = arena({ role: PM_RANGER, race: PM_HUMAN });
        const plainBow = item(ordinary, BOW, { owornmask: W_WEP });
        ordinary.uwep = plainBow;
        const arrows = item(ordinary, ARROW, { quan: 5 });
        carry(ordinary, plainBow, arrows);
        ordinary.uquiver = arrows;
        ordinary.urole.questarti = ART_LONGBOW_OF_DIANA;
        aimEast(ordinary);
        assert.equal(await throw_obj(arrows, 0, ordinary), ECMD_TIME);
        assert.equal(draws()[0], 'rnd(2)',
            'the Ranger bonus alone gives a two-shot roll');

        // roles.c assigns the Longbow of Diana to Rangers. Matching that
        // artifact ID and launcher type exercises C's own-quest-artifact
        // conjunct; the extra +1 changes only the source volley bound.
        const ranger = arena({ role: PM_RANGER, race: PM_HUMAN });
        const diana = item(ranger, BOW, {
            owornmask: W_WEP,
            oartifact: ART_LONGBOW_OF_DIANA,
        });
        ranger.uwep = diana;
        ranger.urole.questarti = ART_LONGBOW_OF_DIANA;
        const rangerArrows = item(ranger, ARROW, { quan: 5 });
        carry(ranger, diana, rangerArrows);
        ranger.uquiver = rangerArrows;
        aimEast(ranger);
        assert.equal(await throw_obj(rangerArrows, 0, ranger), ECMD_TIME);
        assert.equal(draws()[0], 'rnd(3)',
            'the quest-artifact launcher adds exactly one volley');

        // A Wizard carrying the same Ranger artifact fails is_quest_artifact:
        // roles.c gives Wizards the Eye of the Aethiopica, so the launcher
        // must not gain the Ranger-only bonus from artifact status alone.
        const otherRole = arena({ role: PM_WIZARD, race: PM_HUMAN });
        const foreignBow = item(otherRole, BOW, {
            owornmask: W_WEP,
            oartifact: ART_LONGBOW_OF_DIANA,
        });
        otherRole.uwep = foreignBow;
        otherRole.urole.questarti = ART_EYE_OF_THE_AETHIOPICA;
        const wizardArrows = item(otherRole, ARROW, { quan: 5 });
        carry(otherRole, foreignBow, wizardArrows);
        otherRole.uquiver = wizardArrows;
        aimEast(otherRole);
        assert.equal(await throw_obj(wizardArrows, 0, otherRole), ECMD_TIME);
        assert.equal(draws()[0], 'rnd(1)',
            'another role\'s artifact receives no quest-launcher volley');
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

test('throw_obj restores saved split context before the unsplitobj cleanup',
    async () => {
        // Split one item from this five-item DAGGER stack to model getobj's
        // counted selection; splitobj creates the parent/child context C saves.
        const state = arena();
        const stack = item(state, DAGGER, { quan: 5 });
        carry(state, stack);
        state.uquiver = null;
        const child = splitobj(stack, 1, { state });
        const savedSplit = { ...state.context.objsplit };
        assert.deepEqual(savedSplit,
            { parent_oid: stack.o_id, child_oid: child.o_id },
            'splitobj saves the parent and selected child IDs for cleanup');

        const sourceStart = DOTHROW_C.indexOf('\nthrow_obj(');
        const cleanupAt = DOTHROW_C.indexOf('unsplit_stack:', sourceStart);
        const restoreAt = DOTHROW_C.indexOf('svc.context.objsplit = save_osplit;', cleanupAt);
        const unsplitAt = DOTHROW_C.indexOf('(void) unsplitobj(obj);', cleanupAt);
        assert.ok(cleanupAt >= 0 && restoreAt > cleanupAt && unsplitAt > restoreAt,
            'C restores the saved context before discarding unsplitobj()');
        const finishAt = DOTHROW_JS.indexOf('function finishThrowObj(');
        const finishEnd = DOTHROW_JS.indexOf('\n}', finishAt) + 2;
        const finishSource = DOTHROW_JS.slice(finishAt, finishEnd);
        assert.ok(finishSource.indexOf('state.context.objsplit = save_osplit;')
            < finishSource.indexOf('unsplitobj(obj, { state });'));

        // KEY_ESC is the getdir cancellation key. C then follows unsplit_stack
        // with ECMD_CANCEL and merges the selected child into its parent.
        state.nhDisplay.clearInputQueue();
        state.nhDisplay.pushKey(KEY_ESC);
        assert.equal(await throw_obj(child, 0, state), ECMD_CANCEL);
        assert.equal(state.invent, stack);
        assert.equal(stack.quan, 5,
            'source cleanup reunites the child with its parent');
        assert.ok(child.where === OBJ_FREE || child.where === OBJ_DELETED);
        // mkobj.c:dealloc_obj() clears both IDs when it frees a just-merged
        // split half; restoring savedSplit first is what made this merge find
        // the parent and return the stack to its original quantity.
        assert.deepEqual(state.context.objsplit,
            { parent_oid: 0, child_oid: 0 });
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
        assert.equal(await dofire(ammo), ECMD_TIME);
        assert.equal(arrows.quan, 5);
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
        // and then doquiver_core(), which prompts for a missile.
        const empty = arena();
        empty._ttyToplines = '';
        assert.equal(await dofire(empty), ECMD_CANCEL);
        assert.match(empty._ttyToplines, /no ammunition readied/u);
        // A wielded polearm takes the first.
        const polearm = arena();
        const lance = item(polearm, LANCE, { owornmask: W_WEP });
        polearm.uwep = lance;
        carry(polearm, lance);
        assert.equal(await dofire(polearm), ECMD_FAIL);
        assert.match(polearm._ttyToplines, /Don't know what to hit/u);
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
        known.iflags.cbreak = true;
        known.nhDisplay.pushKey(ESCAPE_KEY.charCodeAt(0));
        known.nhDisplay.pushKey(ESCAPE_KEY.charCodeAt(0));
        assert.equal(await dofire(known), ECMD_CANCEL);
        assert.match(known._ttyToplines, /What do you want to fire/u);
        // :516-517, the bullwhip arm between the first and the third.
        const whip = arena();
        const bullwhip = item(whip, BULLWHIP, { owornmask: W_WEP });
        whip.uwep = bullwhip;
        carry(whip, bullwhip);
        aimEast(whip);
        assert.equal(await dofire(whip), ECMD_TIME);
        assert.match(whip._ttyToplines, /Snap!/u);
    });

test('dofire() refills the quiver through doquiver_core()', async () => {
    // dothrow.c:547-555. With autoquiver disabled, the #fire caller clears
    // in_doagain, refills with the shared helper, and then throws the selected
    // item. The first Escape dismisses the prior no-ammunition message; the
    // object letter and direction are the two source-owned prompt answers.
    const state = arena();
    const dagger = item(state, DAGGER);
    pack(state, dagger);
    state.iflags.cbreak = true;
    state.nhDisplay.pushKey(ESCAPE_KEY.charCodeAt(0));
    state.nhDisplay.pushKey(dagger.invlet.charCodeAt(0));
    state.nhDisplay.pushKey(ESCAPE_KEY.charCodeAt(0));
    state.nhDisplay.pushKey('l'.charCodeAt(0));
    for (let i = 0; i < 8; i++) state.nhDisplay.pushKey(' '.charCodeAt(0));

    assert.equal(await dofire(state), ECMD_TIME);
    assert.equal(state.uquiver, null);
    assert.equal(state.invent, null);
    assert.equal(state.in_doagain, 0);
    assert.deepEqual(pileAt(state, 9, 4), [dagger]);
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
    aimEast(ammo);
    assert.equal(await dofire(ammo), ECMD_TIME);
    assert.equal(arrows.quan, 4);
    // With fireassist off the whole search is skipped, so the arrows are
    // thrown by hand. dothrow.c:1640-1647 halves the range and continues;
    // it does not require a launcher for this ordinary ammo arm.
    const unassisted = arena();
    const shafts = item(unassisted, ARROW, { quan: 5 });
    const bow = item(unassisted, BOW, { owornmask: W_SWAPWEP });
    unassisted.uswapwep = bow;
    carry(unassisted, bow, shafts);
    unassisted.uquiver = shafts;
    unassisted.iflags.fireassist = false;
    aimEast(unassisted);
    assert.equal(await dofire(unassisted), ECMD_TIME);
    assert.equal(shafts.quan, 4);
    const landed = pileAt(unassisted, 5, 4);
    assert.equal(landed.length, 1);
    assert.equal(landed[0].otyp, ARROW);
    assert.equal(landed[0].quan, 1);
    assert.equal(landed[0].where, OBJ_FLOOR);
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
    // :571-578. A launcher that is neither wielded nor readied is wielded and
    // the fire command is queued behind it without spending a turn.
    const packed = arena();
    const loose = item(packed, ARROW, { quan: 5 });
    const spare = item(packed, BOW);
    carry(packed, spare, loose);
    packed.uquiver = loose;
    assert.equal(await dofire(packed), ECMD_OK);
    assert.equal(loose.quan, 5);
    assert.deepEqual(
        packed.command_queue[CQ_CANNED].map((node) => ({
            command: node.ec_entry?.ef_txt,
            key: node.key,
        })),
        [
            { command: 'wield', key: undefined },
            { command: undefined, key: spare.invlet },
            { command: 'fire', key: undefined },
        ],
    );
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
