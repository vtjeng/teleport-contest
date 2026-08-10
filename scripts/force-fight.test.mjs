import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORR,
    DOOR,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_NODOOR,
    ECMD_CANCEL,
    ECMD_OK,
    FOUNTAIN,
    ICE,
    IRONBARS,
    POOL,
    ROOM,
    SCORR,
    SDOOR,
    STONE,
    VWALL,
    WEB,
} from '../js/const.js';
import { do_fight, UnsupportedHeroCommandBoundaryError } from '../js/cmd.js';
import {
    glyph_to_cmap,
    map_background,
    terrain_glyph,
    unmap_object,
    UnsupportedMapMemoryError,
} from '../js/display.js';
import { game } from '../js/gstate.js';
import {
    domove,
    preflightDomoveDestination,
    UnsupportedHeroMoveBoundaryError,
} from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { PM_YELLOW_LIGHT } from '../js/monsters.js';
import { mksobj, mksobj_at } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { AXE, BOULDER, PICK_AXE, STATUE } from '../js/objects.js';
import { S_stone } from '../js/symbols.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    FORCE_FIGHT_CASES,
    loadForceFightRecipe,
    verifyForceFightSegment,
} from './run-force-fight.mjs';

// The recipe is the only record of which C branches were recorded, so a silent
// re-recording that lost one has to fail here.
test('the force-fight matrix keeps replay inputs only', () => {
    const recipe = loadForceFightRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    assert.equal(recipe.segments.length, FORCE_FIGHT_CASES.length);
});

// The port half of the matrix: each recorded case replayed here, so the
// message, the untouched hero and the spent turn are checked by `npm test`
// even though the C recording needs the recorder.
test('every force-fight case answers its terrain and spends its turn',
    async () => {
        for (const segment of loadForceFightRecipe().segments)
            await verifyForceFightSegment(segment);
    });

// A Valkyrie on ordinary room floor with a long sword in hand. The seed,
// datetime and character fix a level; nothing below depends on which one,
// because each test writes the terrain it means.
async function heroInARoom() {
    await runSegment({
        seed: 8802001,
        datetime: '20310203040506',
        nethackrc: 'OPTIONS=name:Forcer,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!acoustics,!autopickup',
        moves: '',
    });
    const state = game;
    state.multi = 0;
    state.commandCount = 0;
    state.context.run = 0;
    state.context.nopick = 0;
    state.level.traps.length = 0;
    quiet(state);
    return state;
}

// Drop the pending message so the next pline() starts a fresh top line rather
// than asking for a --More-- that no keystroke is left to answer.
function quiet(state) {
    clearTtyMessageWindow(state);
    state._ttyToplines = '';
}

// gt.toplines, which pline.c writes whether or not the row was repainted.
function toplines(state) {
    return state._ttyToplines ?? '';
}

// The square one step west, which every domove() test below swings at. West
// keeps the direction orthogonal, so no diagonal rule can reach the step even
// when a test makes domove_fight_empty() decline it.
const WEST = [-1, 0];

function target(state) {
    return state.level.at(state.u.ux + WEST[0], state.u.uy + WEST[1]);
}

// rm.h:213-218 aliases doormask, altarmask and looted onto one field, which
// js/game.js splits into `flags` and `doormask`.
function targetTerrain(state, typ, { flags = 0, seenv = 1 } = {}) {
    const location = target(state);
    location.typ = typ;
    location.flags = flags;
    location.doormask = 0;
    location.seenv = seenv;
    return location;
}

// What cmd.c leaves behind before domove() runs: do_fight()'s forcefight, and
// set_move_cmd()'s direction and moveloop_core()'s optimistic context.move.
function aimedWest(state) {
    state.u.dx = WEST[0];
    state.u.dy = WEST[1];
    state.u.dz = 0;
    state.context.forcefight = 1;
    state.context.move = 1;
    state.domoveAttempting = 1; /* DOMOVE_WALK */
    quiet(state);
    return state;
}

async function forceFightWest(state) {
    await domove(aimedWest(state));
}

function refusedWest(state, pattern) {
    return assert.rejects(
        () => forceFightWest(state),
        (error) => error instanceof UnsupportedHeroMoveBoundaryError
            && pattern.test(error.message),
    );
}

// ── cmd.c do_fight() ──

test('do_fight commits a walk and cancels on a second press', async () => {
    const state = await heroInARoom();
    state.context.forcefight = 0;
    state.domoveAttempting = 0;

    assert.equal(await do_fight(state), ECMD_OK);
    assert.equal(state.context.forcefight, 1);
    // DOMOVE_WALK, so that rhack() takes the walk arm whatever run value the
    // direction command carries.
    assert.equal(state.domoveAttempting, 1);
    assert.equal(toplines(state), '');

    assert.equal(await do_fight(state), ECMD_CANCEL);
    assert.equal(state.context.forcefight, 0);
    assert.equal(state.domoveAttempting, 0);
    assert.equal(toplines(state), 'Double fight prefix, canceled.');
});

test('the movement prefix is cleared once the prefixed step has run',
    async () => {
        // cmd.c rhack():3789. `Fml` sets iflags.menu_requested through
        // do_reqmenu() and svc.context.forcefight through do_fight(); the walk
        // arm clears both after domove() returns.
        await runSegment({
            seed: 8800004,
            datetime: '20310203040506',
            nethackrc: 'OPTIONS=name:Forcer,role:Valkyrie,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none,!acoustics,!autopickup',
            moves: 'Fml',
        });
        assert.equal(game._ttyToplines, 'You harmlessly attack the wall.');
        assert.equal(game.iflags.menu_requested, false);
        assert.equal(game.context.forcefight, 0);
    });

// ── hack.c domove_fight_empty(), the solid arm ──

// hack.c:2305-2308 names the terrain with
// the(defsyms[glyph_to_cmap(back_to_glyph(x, y))].explanation). Every entry
// here is that composition read off defsym.h and drawing.c for one terrain.
const SOLID_TERRAIN = [
    // defsyms[S_vwall].explanation, and the ten other wall indices share it.
    { typ: VWALL, message: 'You harmlessly attack the wall.' },
    // A secret door looks exactly like the wall it is hidden in.
    { typ: SDOOR, message: 'You harmlessly attack the wall.' },
    // back_to_glyph() answers wall_angle() only for a wall the hero has seen;
    // an unseen one is drawn, and named, as the rock around it. C's comment at
    // 2302-2304 says that is deliberate, so that a wall outside a room reads
    // the same as the stone it is buried in.
    { typ: VWALL, seenv: 0, message: 'You harmlessly attack the stone.' },
    // defsyms[S_stone].explanation. STONE is why C tests IS_STWALL() beside
    // seenv: unmapped rock is named anyway.
    { typ: STONE, seenv: 0, message: 'You harmlessly attack the stone.' },
    // A secret corridor is drawn as stone and named as stone, and it is the
    // one terrain in that list which IS_STWALL() does not already cover.
    { typ: SCORR, seenv: 0, message: 'You harmlessly attack the stone.' },
    // ACCESSIBLE() is true for a door; monmove.c accessible() is false for
    // this one only because closed_door() is true.
    {
        typ: DOOR,
        flags: D_CLOSED,
        message: 'You harmlessly attack the closed door.',
    },
    // IS_FURNITURE(), the other half of `solid`.
    { typ: FOUNTAIN, message: 'You harmlessly attack the fountain.' },
    // defsyms[S_pool].explanation. A pool is inaccessible without being rock.
    { typ: POOL, message: 'You harmlessly attack the water.' },
];

test('a force-fight names the solid terrain it lands on', async () => {
    for (const { typ, flags = 0, seenv = 1, message } of SOLID_TERRAIN) {
        const state = await heroInARoom();
        targetTerrain(state, typ, { flags, seenv });
        const label = `typ ${typ}, seenv ${seenv}`;
        const before = game.moves;
        await forceFightWest(state);
        assert.equal(toplines(state), message, label);
        // The step is over: the hero has not moved and the turn is spent,
        // which is what domove_fight_empty()'s `return TRUE` buys.
        assert.equal(state.context.move, 1, label);
        assert.equal(game.moves, before, label);
        // hack.c domove() clears gd.domove_attempting once domove_core()
        // returns, so the next command starts from no committed intent.
        assert.equal(state.domoveAttempting, 0, label);
    }
});

test('a force-fight ends a multi-turn action', async () => {
    // hack.c:2326 nomul(0).
    const state = await heroInARoom();
    targetTerrain(state, VWALL);
    state.multi = 7;
    await forceFightWest(state);
    assert.equal(state.multi, 0);
});

test('a force-fight puts the terrain back into map memory', async () => {
    // hack.c:2288-2290 unmap_object() then newsym(). The square is about to
    // become known empty, so whatever the map was showing there goes.
    const state = await heroInARoom();
    const location = targetTerrain(state, VWALL);
    location.remembered_glyph = { ch: 'X', color: 1, decgfx: false };
    await forceFightWest(state);
    const wall = terrain_glyph(location, state.u.ux - 1, state.u.uy, state);
    assert.equal(location.remembered_glyph.ch, wall.ch);
});

// ── hack.c domove_fight_empty(), the thin-air arm ──

// hack.c:2318-2319 is the else that names nothing at all, and it is the only
// arm whose adverb at 2321-2322 is empty. Every terrain here is ACCESSIBLE()
// and not IS_FURNITURE(), which is all `solid` asks.
const THIN_AIR_TERRAIN = [
    // Ordinary room floor, the square an 'F' is likeliest to land on.
    { typ: ROOM },
    // A corridor. engrave.h spot_shows_engravings() names CORR, ICE and ROOM,
    // so these two and ROOM are also the squares unmap_object() can refuse.
    { typ: CORR },
    { typ: ICE },
    // The three door states closed_door() answers FALSE for, which is what
    // separates these from SOLID_TERRAIN's D_CLOSED entry on the same terrain.
    { typ: DOOR, flags: D_NODOOR },
    { typ: DOOR, flags: D_ISOPEN },
    { typ: DOOR, flags: D_BROKEN },
];

test('a force-fight at an empty square attacks thin air', async () => {
    for (const { typ, flags = 0 } of THIN_AIR_TERRAIN) {
        const state = await heroInARoom();
        targetTerrain(state, typ, { flags });
        const label = `typ ${typ}, doormask ${flags}`;
        const before = game.moves;
        await forceFightWest(state);
        // No "harmlessly ": that is C's !(boulder || solid) arm.
        assert.equal(toplines(state), 'You attack thin air.', label);
        assert.equal(state.context.move, 1, label);
        assert.equal(game.moves, before, label);
        assert.equal(state.domoveAttempting, 0, label);
    }
});

test('a force-fight at an engraved square stops in unmap_object', async () => {
    // display.c:422-426, which only ever runs for a square this arm calls thin
    // air, so the whole force-fight route to it opened with the arm. The stop
    // is display.c's rather than hack.c's, and js/cmd.js lists it, so the
    // segment ends there instead of the error escaping.
    const state = await heroInARoom();
    targetTerrain(state, ROOM);
    engraveAt(state, state.u.ux + WEST[0], state.u.uy + WEST[1]);
    // The class alone does not pin where unmap_object() sits. C calls it at
    // 2280-2285, ahead of every message arm, so the stop must land before any
    // line is written or any cell repainted; moving it below the arms would
    // print first and still throw this class.
    const before = toplines(state);
    const painted = target(state).remembered_glyph;
    await assert.rejects(
        () => forceFightWest(state),
        (error) => error instanceof UnsupportedMapMemoryError,
    );
    assert.equal(toplines(state), before);
    assert.equal(target(state).remembered_glyph, painted);
});

test('an unseen empty square is thin air, not an unknown obstacle', async () => {
    // C tests seenv at 2302 inside the solid arm, so an unremembered square
    // reaches "an unknown obstacle" only when it is solid as well. A dark room
    // square the hero has never seen is the ordinary way to be neither.
    const state = await heroInARoom();
    targetTerrain(state, ROOM, { seenv: 0 });
    await forceFightWest(state);
    assert.equal(toplines(state), 'You attack thin air.');
});

// ── hack.c domove_fight_empty(), the arms that stop ──

test('a force-fight this port cannot answer stops by name', async () => {
    // hack.c:2302-2305's else. Terrain that is neither remembered nor rock
    // nor a secret door is "an unknown obstacle".
    const unseen = await heroInARoom();
    targetTerrain(unseen, POOL, { seenv: 0 });
    // C reaches its "an unknown obstacle" arm after unmap_object() and
    // newsym() have run. The port refuses instead, so the test has to run
    // first: a refusal placed where C puts the test would fire with map memory
    // and the display buffer already rewritten, ending the segment on a screen
    // the port had diverged from. Assert the square is untouched.
    const painted = target(unseen).remembered_glyph;
    await refusedWest(unseen, /no remembered appearance/u);
    assert.equal(target(unseen).remembered_glyph, painted);
    assert.equal(toplines(unseen), '');

    // hack.c:2255-2260 and 2314. objnam.c ansimpleoname() names the boulder
    // or the statue, and has no port.
    for (const otyp of [BOULDER, STATUE]) {
        const state = await heroInARoom();
        targetTerrain(state, FOUNTAIN);
        mksobj_at(
            otyp,
            state.u.ux + WEST[0],
            state.u.uy + WEST[1],
            true,
            false,
            objectGenerationEnv({ state }),
        );
        await refusedWest(state, /boulder or statue/u);
    }

    // hack.c:2266-2273. dig.c use_pick_axe2() digs instead of swinging, but
    // only when dig_typ() answers something other than DIGTYP_UNDIGGABLE. At
    // a VWALL it answers UNDIGGABLE for an axe (dig.c:176-179 gives an axe
    // only a closed door or a tree), so C swings here and the port refuses.
    // This row pins the port's refusal, not C's behavior; the divergence is
    // recorded as dig-tool-guard-refuses-where-dig_typ-answers-undiggable.
    for (const otyp of [PICK_AXE, AXE]) {
        const state = await heroInARoom();
        targetTerrain(state, VWALL);
        state.uwep = mksobj(
            otyp, true, false, objectGenerationEnv({ state }),
        );
        await refusedWest(state, /digging tool/u);
    }

    // hack.c domove_fight_ironbars() (1993-2016), which runs first.
    const bars = await heroInARoom();
    targetTerrain(bars, IRONBARS);
    await refusedWest(bars, /iron bars/u);

    // hack.c domove_fight_web() (2018-2113), which runs second. Only a seen
    // web selects it.
    const web = await heroInARoom();
    targetTerrain(web, ROOM);
    web.level.traps.push({
        tx: web.u.ux + WEST[0], ty: web.u.uy + WEST[1], ttyp: WEB, tseen: 1,
    });
    await refusedWest(web, /spider web/u);

    // hack.c:2245 and 2327-2333. A polymorphed hero with an AT_EXPL attack
    // explodes at the square instead of swinging at it.
    const exploder = await heroInARoom();
    targetTerrain(exploder, VWALL);
    // A yellow light's one attack is ATTK(AT_EXPL, AD_BLND, 10, 20); a gas
    // spore's is AT_BOOM, which is a different number and a different arm.
    exploder.u.umonnum = PM_YELLOW_LIGHT;
    exploder.youmonst.data = exploder.mons[PM_YELLOW_LIGHT];
    await refusedWest(exploder, /exploding form/u);

    // The arm needs both halves. An unpolymorphed hero carrying the same
    // species record swings as usual, which is what Upolyd() decides.
    const notPolymorphed = await heroInARoom();
    targetTerrain(notPolymorphed, VWALL);
    notPolymorphed.youmonst.data = notPolymorphed.mons[PM_YELLOW_LIGHT];
    await forceFightWest(notPolymorphed);
    assert.equal(
        toplines(notPolymorphed), 'You harmlessly attack the wall.',
    );

    // hack.c:2253 and 2306-2312. Underwater skips the boulder and digging
    // tests and names an air bubble or nothing at all.
    const underwater = await heroInARoom();
    targetTerrain(underwater, VWALL);
    underwater.u.uinwater = 1;
    await refusedWest(underwater, /underwater/u);
});

test('an unseen web leaves the square to domove_fight_empty', async () => {
    // domove_fight_web()'s trap->tseen conjunct. Without it the web would
    // claim a square C hands on to the empty-square arm.
    const state = await heroInARoom();
    targetTerrain(state, VWALL);
    state.level.traps.push({
        tx: state.u.ux + WEST[0], ty: state.u.uy + WEST[1],
        ttyp: WEB, tseen: 0,
    });
    await forceFightWest(state);
    assert.equal(toplines(state), 'You harmlessly attack the wall.');
});

test('a bare-handed hero swings at iron bars rather than digging', async () => {
    // domove_fight_ironbars()'s `uwep` conjunct. With no weapon the bars are
    // just inaccessible terrain, which the empty-square arm names.
    const state = await heroInARoom();
    targetTerrain(state, IRONBARS);
    state.uwep = null;
    await forceFightWest(state);
    assert.equal(toplines(state), 'You harmlessly attack the iron bars.');
});

test('an ordinary step is not a force-fight', async () => {
    // The entry condition. Without svc.context.forcefight the wall is
    // test_move()'s business, which refuses the step in silence and spends no
    // turn.
    const state = await heroInARoom();
    targetTerrain(state, VWALL);
    aimedWest(state);
    state.context.forcefight = 0;
    await domove(state);
    assert.equal(toplines(state), '');
    assert.equal(state.context.move, 0);
});

test('the admission seam lets a force-fight past the terrain rules',
    async () => {
        // hack.c domove_core():2805-2810 puts the three fight functions above
        // test_move(), so a force-fight never reaches the terrain rules this
        // seam stands in for. A pool is where that shows: an ordinary step
        // into one stops at the seam, and the force-fight has to get through
        // to domove_fight_empty(), which names the water.
        const state = await heroInARoom();
        targetTerrain(state, POOL);
        const x = state.u.ux + WEST[0];
        const y = state.u.uy + WEST[1];

        state.context.forcefight = 0;
        assert.throws(
            () => preflightDomoveDestination(x, y, state, 0),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError,
        );

        state.context.forcefight = 1;
        assert.doesNotThrow(
            () => preflightDomoveDestination(x, y, state, 0),
        );
    });

// ── uhitm.c attack_checks(), the arm that sends `F` at a monster ──

// Seed 8800009's D:1 puts a hostile monster immediately west of the hero's
// start. It was found by generating the level with the port and reading the
// squares around the start; no recorded session was read.
const MONSTER_SEED = 8800009;
const MONSTER_RC = 'OPTIONS=name:Forcer,role:Valkyrie,race:human,'
    + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
    + '!acoustics,!autopickup';

// The random-number log, the screen list and gt.toplines belong to the running
// game, not to the object runSegment() returns, so each measurement is read
// before the next segment starts.
async function monsterSeedSegment(moves) {
    let boundary = null;
    const replay = await runSegment({
        seed: MONSTER_SEED,
        datetime: '20310203040506',
        nethackrc: MONSTER_RC,
        moves,
    }, { onBoundary: (error) => { boundary = error; } });
    return {
        rng: replay.getRngLog(),
        screens: replay.getScreens().length,
        boundary,
        toplines: game._ttyToplines ?? '',
    };
}

test('a force-fight at a monster strikes it', async () => {
    // uhitm.c:201-214 returns FALSE for svc.context.forcefight, so the swing
    // lands exactly as an unprefixed step into the same square would. The
    // prefix's other consumers along this path cannot separate the two: the
    // is_safemon() gate at 462 and hack.c:2791's nomul(0) already take the
    // hostile arm without it, mon.c wakeup()'s arm at 4344 needs an
    // undetected target, and the atk_done tail at 577-580 needs one the hero
    // cannot spot. So `Fh` has to draw the same numbers in the same order as
    // `h` and print the same line.
    const prefixed = await monsterSeedSegment('Fh');
    const plain = await monsterSeedSegment('h');
    assert.equal(prefixed.boundary, null);
    assert.deepEqual(prefixed.rng, plain.rng);
    assert.equal(prefixed.toplines, 'You kill the fox!');
    assert.equal(plain.toplines, prefixed.toplines);

    // The prefix on its own draws nothing and spends no turn, so the equality
    // above is the attack's doing rather than the square's.
    const prefixOnly = await monsterSeedSegment('F');
    assert.ok(prefixOnly.rng.length < prefixed.rng.length);
    // One more screen than `h`, because `F` waits for the direction key, and
    // one more than `F`, because the swing repaints. Both counts move if the
    // step stops early.
    assert.equal(prefixed.screens, plain.screens + 1);
    assert.equal(prefixed.screens, prefixOnly.screens + 1);
});

// ── display.c unmap_object() and map_background() ──

async function heroWithATargetSquare(typ, options) {
    const state = await heroInARoom();
    targetTerrain(state, typ, options);
    return state;
}

function unmapTarget(state) {
    unmap_object(state.u.ux + WEST[0], state.u.uy + WEST[1], state);
    return target(state);
}

test('unmap_object puts the terrain back over a forgotten layer', async () => {
    const state = await heroWithATargetSquare(FOUNTAIN);
    const location = target(state);
    location.remembered_glyph = { ch: 'X', color: 1, decgfx: false };
    const fountain = terrain_glyph(
        location, state.u.ux + WEST[0], state.u.uy + WEST[1], state,
    );
    assert.equal(unmapTarget(state).remembered_glyph.ch, fountain.ch);
});

test('unmap_object keeps an unseen trap out of map memory', async () => {
    // display.c:417. Only a trap the hero has seen replaces the terrain; an
    // unseen one leaves map_background() to answer.
    const state = await heroWithATargetSquare(FOUNTAIN);
    const x = state.u.ux + WEST[0];
    const y = state.u.uy + WEST[1];
    state.level.traps.push({ tx: x, ty: y, ttyp: WEB, tseen: 0 });
    const fountain = terrain_glyph(target(state), x, y, state);
    assert.equal(unmapTarget(state).remembered_glyph.ch, fountain.ch);

    state.level.traps[0].tseen = 1;
    const remembered = unmapTarget(state).remembered_glyph;
    assert.equal(remembered.trapType, WEB);
});

test('unmap_object rewrites memory without painting the square', async () => {
    // display.c:418 and :428 both pass show = 0. The caller, hack.c
    // domove_fight_empty(), paints with newsym() straight afterwards, and
    // painting here would put a layer on screen that newsym() then replaces.
    for (const tseen of [0, 1]) {
        const state = await heroWithATargetSquare(FOUNTAIN);
        const x = state.u.ux + WEST[0];
        const y = state.u.uy + WEST[1];
        state.level.traps.push({ tx: x, ty: y, ttyp: WEB, tseen });
        target(state).disp_ch = null;
        unmapTarget(state);
        assert.equal(target(state).disp_ch, null, `tseen ${tseen}`);
    }
});

test('unmap_object writes stone over a square never seen', async () => {
    // display.c:435-437, the else that has no terrain to put back.
    const state = await heroWithATargetSquare(FOUNTAIN, { seenv: 0 });
    const location = target(state);
    location.remembered_glyph = { ch: 'X', color: 1, decgfx: false };
    const stone = map_background_probe(state);
    assert.equal(unmapTarget(state).remembered_glyph.ch, stone);
});

function map_background_probe(state) {
    const location = { typ: STONE, seenv: 0 };
    return terrain_glyph(location, state.u.ux, state.u.uy, state).ch;
}

test('unmap_object darkens an unlit room square it just repainted',
    async () => {
        // display.c:431-434. back_to_glyph() has just written S_room, and an
        // unlit remembered room square is drawn as stone instead.
        const dark = await heroWithATargetSquare(ROOM);
        target(dark).waslit = false;
        assert.equal(
            unmapTarget(dark).remembered_glyph.ch,
            map_background_probe(dark),
        );

        const lit = await heroWithATargetSquare(ROOM);
        target(lit).waslit = true;
        const room = terrain_glyph(
            target(lit), lit.u.ux + WEST[0], lit.u.uy + WEST[1], lit,
        );
        assert.equal(unmapTarget(lit).remembered_glyph.ch, room.ch);
        assert.notEqual(room.ch, map_background_probe(lit));

        // The negative case for the conjunct the port substituted for C's
        // `lev->glyph == cmap_to_glyph(S_room)` compare. Varying waslit alone
        // cannot show that `typ === ROOM` is doing any work: an unlit CORR
        // must keep its own terrain, not go dark.
        for (const typ of [CORR, FOUNTAIN]) {
            const other = await heroWithATargetSquare(typ);
            target(other).waslit = false;
            const own = terrain_glyph(
                target(other), other.u.ux + WEST[0], other.u.uy + WEST[1],
                other,
            );
            assert.equal(
                unmapTarget(other).remembered_glyph.ch, own.ch, `typ ${typ}`,
            );
            assert.notEqual(own.ch, map_background_probe(other), `typ ${typ}`);
        }
    });

test('unmap_object stops on a square that shows an engraving', async () => {
    // display.c:422-426 needs engraving_to_glyph(), whose presentation lives
    // inside newsym(). engrave.h spot_shows_engravings() names the three
    // terrain types that can reach it.
    for (const typ of [CORR, ICE, ROOM]) {
        const state = await heroWithATargetSquare(typ);
        const x = state.u.ux + WEST[0];
        const y = state.u.uy + WEST[1];
        engraveAt(state, x, y);
        assert.throws(
            () => unmap_object(x, y, state),
            (error) => error instanceof UnsupportedMapMemoryError,
            `typ ${typ}`,
        );
    }

    // A wall shows no engraving, so the same engraving is ignored there.
    const wall = await heroWithATargetSquare(VWALL);
    const x = wall.u.ux + WEST[0];
    const y = wall.u.uy + WEST[1];
    engraveAt(wall, x, y);
    const stone = terrain_glyph(target(wall), x, y, wall);
    assert.equal(unmapTarget(wall).remembered_glyph.ch, stone.ch);
});

test('unmap_object leaves a level with no hero memory alone', async () => {
    // display.c:414-415. The square has never been seen, so the arm that
    // would answer is display.c:436's bare assignment, the one place
    // unmap_object() writes memory without map_background()'s own
    // hero_memory test in front of it.
    const state = await heroWithATargetSquare(FOUNTAIN, { seenv: 0 });
    const location = target(state);
    location.remembered_glyph = { ch: 'X', color: 1, decgfx: false };
    state.level.flags.hero_memory = false;
    assert.equal(unmapTarget(state).remembered_glyph.ch, 'X');
});

test('map_background paints only when asked to show', async () => {
    // display.c:278-287. unmap_object() always passes show = 0.
    const state = await heroWithATargetSquare(FOUNTAIN);
    const x = state.u.ux + WEST[0];
    const y = state.u.uy + WEST[1];
    target(state).disp_ch = null;
    map_background(x, y, 0, state);
    assert.equal(target(state).disp_ch, null);
    map_background(x, y, 1, state);
    assert.equal(
        target(state).disp_ch,
        terrain_glyph(target(state), x, y, state).ch,
    );
});

// engrave.c engr_at() walks gl.head_engr, so an engraving is one link in that
// list. Only its coordinates matter to unmap_object().
function engraveAt(state, x, y) {
    state.head_engr = {
        nxt_engr: state.head_engr ?? null,
        engr_x: x,
        engr_y: y,
        engr_txt: ['Elbereth', 'Elbereth', 'Elbereth'],
        engr_time: 0,
        engr_type: 1,
        erevealed: 1,
    };
    return state.head_engr;
}

// ── display.h glyph_to_cmap() ──

test('glyph_to_cmap reads the index a terrain presentation was drawn from',
    async () => {
        const state = await heroInARoom();
        const location = targetTerrain(state, STONE);
        assert.equal(
            glyph_to_cmap(terrain_glyph(
                location, state.u.ux + WEST[0], state.u.uy + WEST[1], state,
            )),
            S_stone,
        );
        assert.throws(
            () => glyph_to_cmap({ ch: '.', color: 0, dec: false }),
            TypeError,
        );
    });

// ── cmd.c rhack(), the prefix that follows a prefix ──

test('the prefix check runs before the command it refuses', async () => {
    // cmd.c rhack():3693 is an else-if over the arm that runs the command, so
    // a refused prefix means the command never runs at all. `q` is bound to
    // potion.c dodrink(), which this port does not dispatch: reaching it would
    // end the segment on UnsupportedHeroCommandBoundaryError instead of
    // printing the prefix line and carrying on.
    let boundary = null;
    await runSegment({
        seed: 8800004,
        datetime: '20310203040506',
        nethackrc: 'OPTIONS=name:Forcer,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!acoustics,!autopickup',
        moves: 'Fq',
    }, { onBoundary: (error) => { boundary = error; } });
    assert.equal(boundary, null);
    assert.equal(
        game._ttyToplines,
        "The 'F' prefix should be followed by a movement command.",
    );
    // reset_cmd_vars(TRUE) after ECMD_FAIL.
    assert.equal(game.context.forcefight, 0);
    assert.equal(game.domoveAttempting, 0);
});

test('the same key without the prefix still reaches its own refusal',
    async () => {
        // The other side of the test above: `q` alone is what
        // UnsupportedHeroCommandBoundaryError looks like here.
        let boundary = null;
        await runSegment({
            seed: 8800004,
            datetime: '20310203040506',
            nethackrc: 'OPTIONS=name:Forcer,role:Valkyrie,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none,!acoustics,!autopickup',
            moves: 'q',
        }, { onBoundary: (error) => { boundary = error; } });
        assert.ok(boundary instanceof UnsupportedHeroCommandBoundaryError);
    });

// cmd.c rhack():3766 is `prefix_seen = tlist`, an assignment rather than a
// first-wins latch, so the second prefix of a pair is the one its refusal
// line names. `Fmi` and `mFi` differ only in that order and name different
// prefixes, which is what pins the assignment. `i` has a handler, so it takes
// cmd.c:3714's "does not accept" line rather than :3703's.
const PREFIX_PAIR_ROWS = [
    // `i` is dodroptypes/inventory, which carries neither prefix flag, so the
    // refusal fires and names whichever prefix was seen last.
    ['Fmi', "The inventory command does not accept 'm' prefix."],
    ['mFi', "The inventory command does not accept 'F' prefix."],
];

test('the second prefix of a pair is the one the refusal names', async () => {
    for (const [moves, message] of PREFIX_PAIR_ROWS) {
        let boundary = null;
        await runSegment({
            seed: 8800004,
            datetime: '20310203040506',
            nethackrc: 'OPTIONS=name:Forcer,role:Valkyrie,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none,!acoustics,!autopickup',
            moves,
        }, { onBoundary: (error) => { boundary = error; } });
        assert.equal(boundary, null, moves);
        assert.equal(game._ttyToplines, message, moves);
    }
});

// The route a prefixed `G` takes. Only a command's first byte passes
// readSimpleCommand()'s ADMITTED_COMMANDS gate, so `FG` reads `G`, finds its
// row, and passes the PREFIXCMD exemption exactly as it does in C; the arm
// that refuses it is the bound-command-without-a-handler one, because
// MOVEMENT_INTENTS has no `run` row. Removing that arm would turn this into an
// unknown-command message or worse.
test('a run command after a prefix is refused at the movement seam',
    async () => {
        let boundary = null;
        await runSegment({
            seed: 8800004,
            datetime: '20310203040506',
            nethackrc: 'OPTIONS=name:Forcer,role:Valkyrie,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none,!acoustics,!autopickup',
            moves: 'FG',
        }, { onBoundary: (error) => { boundary = error; } });
        assert.ok(boundary instanceof UnsupportedHeroCommandBoundaryError);
        assert.equal(boundary.key, 'G'.charCodeAt(0));
        // Refused before anything was drawn or any turn spent: the welcome
        // line the segment opened with is still the last thing written, so
        // neither a prefix refusal nor an unknown-command line went out.
        assert.match(game._ttyToplines, /welcome to NetHack!/u);
        assert.equal(game.context.move, 0);
    });

// uhitm.c:462 splits do_attack() on `is_safemon(mtmp) && !svc.context
// .forcefight`, so `F` aimed at the starting pet takes the attack arm, where
// attack_checks() stops it, rather than the displacement arm that swaps places
// with it. Nothing end to end can tell the two apart yet, because both arms
// refuse, so the seam is pinned directly: the same pet, the same square, and
// only the flag differing.
test('force-fight sends the starting pet down the attack arm', async () => {
    // A segment with a pet, unlike heroInARoom()'s pettype:none hero, and
    // safe_pet on so is_safemon() can answer TRUE.
    await runSegment({
        seed: 8802001,
        datetime: '20310203040506',
        nethackrc: 'OPTIONS=name:Forcer,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,!acoustics,!autopickup',
        moves: '',
    });
    const state = game;
    let pet = state.level.monlist;
    while (pet && pet.m_id !== state.context.startingpet_mid) pet = pet.nmon;
    assert.ok(pet, 'the segment generated no starting pet');
    assert.equal(state.flags.safe_dog, true);

    // Untame it while leaving it peaceful, so is_safemon() still answers TRUE
    // and only the two arms differ in what they accept: the displacement arm
    // refuses anything but an ordinary starting pet, while the melee arm takes
    // a peaceful target the same way it takes a hostile one. Without that, both
    // arms accept this monster and the seam is invisible.
    pet.mtame = 0;

    // Without the flag: the displacement arm, which no longer recognizes it.
    state.context.forcefight = 0;
    assert.throws(
        () => preflightDomoveDestination(pet.mx, pet.my, state),
        (error) => error instanceof UnsupportedHeroMoveBoundaryError,
    );

    // With it: the melee arm, which accepts it and raises nothing.
    state.context.forcefight = 1;
    preflightDomoveDestination(pet.mx, pet.my, state);
});

// cmd.c:3791 clears svc.context.forcefight in the DOMOVE_WALK arm, and rhack()
// picks that arm from gd.domove_attempting, which do_fight() set, not from the
// direction command's own run value. `L` carries run 3, so the two sources
// disagree only here: reading the run value would take the rush arm, leave the
// flag set, and turn the next unprefixed key into a second force-fight.
test('a prefixed capital direction still clears the fight prefix',
    async () => {
        await runSegment({
            seed: 8802001,
            datetime: '20310203040506',
            nethackrc: 'OPTIONS=name:Forcer,role:Valkyrie,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none,!acoustics,!autopickup',
            moves: 'mFL',
        });
        assert.equal(game.context.forcefight, 0);
        assert.equal(game.iflags.menu_requested, false);
    });
