import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORR,
    DOOR,
    D_CLOSED,
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

// ── hack.c domove_fight_empty(), the arms that stop ──

test('a force-fight this port cannot answer stops by name', async () => {
    // hack.c:2318-2319. Anything neither solid nor a boulder is thin air.
    const air = await heroInARoom();
    targetTerrain(air, ROOM);
    await refusedWest(air, /thin air/u);

    // hack.c:2302-2305's else. Terrain that is neither remembered nor rock
    // nor a secret door is "an unknown obstacle".
    const unseen = await heroInARoom();
    targetTerrain(unseen, POOL, { seenv: 0 });
    await refusedWest(unseen, /no remembered appearance/u);

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

    // hack.c:2266-2273. dig.c use_pick_axe2() digs instead of swinging, and
    // dig_typ()'s own first test is is_pick() or is_axe().
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

// ── uhitm.c attack_checks(), the arm just outside this slice ──

// Seed 8800009's D:1 puts a hostile monster immediately west of the hero's
// start. It was found by generating the level with the port and reading the
// squares around the start; no recorded session was read.
const MONSTER_SEED = 8800009;
const MONSTER_RC = 'OPTIONS=name:Forcer,role:Valkyrie,race:human,'
    + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
    + '!acoustics,!autopickup';

// The random-number log and the screen list belong to the running game, not
// to the object runSegment() returns, so each measurement is read before the
// next segment starts.
async function monsterSeedSegment(moves) {
    const replay = await runSegment({
        seed: MONSTER_SEED,
        datetime: '20310203040506',
        nethackrc: MONSTER_RC,
        moves,
    }, { onBoundary: () => {} });
    return {
        rng: replay.getRngLog().length,
        screens: replay.getScreens().length,
    };
}

test('a force-fight at a monster refuses before anything happens',
    async () => {
        // uhitm.c:203-215 returns FALSE for svc.context.forcefight, sending
        // the hero on to strike a monster she may not be able to see. That is
        // the next slice. The stop has to come before the frame, the
        // random-number call and the state change an attack would make, so
        // pressing the direction key after `F` must leave the segment exactly
        // where `F` alone left it.
        const prefixOnly = await monsterSeedSegment('F');
        const refused = await monsterSeedSegment('Fh');
        assert.equal(refused.rng, prefixOnly.rng);
        assert.equal(refused.screens, prefixOnly.screens);

        // The same keystroke without the prefix does attack, so the equality
        // above is a property of the refusal rather than of the square.
        const attacked = await monsterSeedSegment('h');
        assert.ok(attacked.rng > prefixOnly.rng);
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
