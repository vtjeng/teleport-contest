import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALTAR,
    CORR,
    DOOR,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    ECMD_OK,
    ECMD_TIME,
    FOUNTAIN,
    GRAVE,
    LAVAPOOL,
    MENU_TRADITIONAL,
    MOAT,
    PIT,
    POOL,
    ROOM,
    SINK,
    STAIRS,
    THRONE,
} from '../js/const.js';
import { UnsupportedHeroCommandBoundaryError } from '../js/cmd.js';
import { game } from '../js/gstate.js';
import { dopickup, pickup_checks } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj_at } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { ELVEN_DAGGER } from '../js/objects.js';
import { UnsupportedPickupError } from '../js/pickup.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    PICKUP_CASES,
    loadPickupCommandRecipe,
    verifyPickupCommandSegment,
} from './run-pickup-command.mjs';
import {
    PICKUP_ONE_OBJECT_CASES,
    loadPickupOneObjectRecipe,
    verifyPickupOneObjectSegment,
} from './run-pickup-one-object.mjs';

// The one recipe is the only record of which C branches were recorded, so a
// silent re-recording that lost one has to fail here.
test('the pickup matrix keeps replay inputs only', () => {
    const recipe = loadPickupCommandRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    assert.equal(recipe.segments.length, PICKUP_CASES.length);
});

test('the one-object pickup matrix keeps replay inputs only', () => {
    const recipe = loadPickupOneObjectRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    assert.equal(recipe.segments.length, PICKUP_ONE_OBJECT_CASES.length);
});

// The port half of the matrix: each recorded case replayed here, so the
// message, the emptied square, the inventory letter and the spent turn are
// checked by `npm test` even though the C recording needs the recorder.
test('every one-object pickup case lifts what its message names', async () => {
    for (const segment of loadPickupOneObjectRecipe().segments)
        await verifyPickupOneObjectSegment(segment);
});

// The same replay for the empty-square matrix, which the recorder exercised
// but `npm test` did not: without it the nine recorded terrain cases only ran
// when someone re-recorded them against C.
test('every empty-square pickup case answers its terrain', async () => {
    for (const segment of loadPickupCommandRecipe().segments)
        await verifyPickupCommandSegment(segment);
});

// A Valkyrie standing on ordinary room floor with nothing on the square.
// The seed, datetime and character fix a level; nothing below depends on
// which one, because each test writes the terrain it means.
async function heroOnAnEmptySquare() {
    await runSegment({
        seed: 7712001,
        datetime: '20310203040506',
        nethackrc: 'OPTIONS=name:Picker,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!acoustics,!autopickup',
        moves: '',
    });
    const state = game;
    state.multi = 0;
    state.commandCount = 0;
    state.context.run = 0;
    state.context.nopick = 0;
    state.level.objects[state.u.ux][state.u.uy] = null;
    state.level.traps.length = 0;
    quiet(state);
    return squareUnderHero(state, ROOM);
}

// Drop the pending message so the next pline() starts a fresh top line rather
// than asking for a --More-- that no keystroke is left to answer.
function quiet(state) {
    clearTtyMessageWindow(state);
    state._ttyToplines = '';
}

// rm.h:213-218 aliases doormask, altarmask and looted onto one field, which
// js/game.js splits into `flags` and `doormask`; hack.c pickup_checks() reads
// it as doormask, so every caller here writes the mask through `flags`, the
// field js/hack.js doorMask() prefers.
function squareUnderHero(state, typ, flags = 0) {
    const location = state.level.at(state.u.ux, state.u.uy);
    location.typ = typ;
    location.flags = flags;
    location.doormask = 0;
    return state;
}

function carried(state, object) {
    for (let item = state.invent; item; item = item.nobj)
        if (item === object) return true;
    return false;
}

function objectUnderHero(state) {
    return mksobj_at(
        ELVEN_DAGGER,
        state.u.ux,
        state.u.uy,
        true,
        false,
        objectGenerationEnv({ state }),
    );
}

// gt.toplines, which pline.c writes whether or not the row was repainted.
function toplines(state) {
    return state._ttyToplines ?? '';
}

// hack.c pickup_checks():3826-3843. Every arm of the terrain switch, in the
// order the source tests them, with the message each pline() composes.
const TERRAIN_ARMS = [
    // A throne C has not seen looted, and one it has. rm.h:218 puts `looted`
    // on the same field the door mask uses, and hack.c:3828 tests the whole
    // field rather than T_LOOTED, so any nonzero mask selects " almost".
    [THRONE, 0, 'It must weigh a ton!'],
    [THRONE, 1, 'It must weigh almost a ton!'],
    [SINK, 0, 'The plumbing connects it to the floor.'],
    [GRAVE, 0, "You don't need a gravestone.  Yet."],
    // hliquid("water") answers "water" for a hero who is not hallucinating.
    [FOUNTAIN, 0, 'You could drink the water...'],
    [DOOR, D_ISOPEN, "It won't come off the hinges."],
    // The other three door masks reach the fall-through, because hack.c:3836
    // tests D_ISOPEN alone. D_LOCKED and D_CLOSED cannot hold under a hero,
    // but D_NODOOR and D_BROKEN are the two doorways she walks onto.
    [DOOR, D_NODOOR, 'There is nothing here to pick up.'],
    [DOOR, D_BROKEN, 'There is nothing here to pick up.'],
    [DOOR, D_CLOSED, 'There is nothing here to pick up.'],
    [DOOR, D_LOCKED, 'There is nothing here to pick up.'],
    // A_NEUTRAL is 2, the value of D_ISOPEN, so an altar is what separates
    // hack.c:3836's two conjuncts: without IS_DOOR() it would claim hinges.
    [ALTAR, 2, 'Moving the altar would be a very bad idea.'],
    [STAIRS, 0, 'The stairs are solidly affixed.'],
    [ROOM, 0, 'There is nothing here to pick up.'],
    [CORR, 0, 'There is nothing here to pick up.'],
];

test('pickup_checks answers an empty square from its terrain switch',
    async () => {
        for (const [typ, flags, message] of TERRAIN_ARMS) {
            const state = await heroOnAnEmptySquare();
            squareUnderHero(state, typ, flags);
            const label = `typ ${typ}, mask ${flags}`;
            assert.equal(await pickup_checks(state), 0, label);
            assert.equal(toplines(state), message, label);
        }
    });

test('pickup_checks sends a square with something on it to a normal pickup',
    async () => {
        const state = await heroOnAnEmptySquare();
        objectUnderHero(state);
        // -1 is C's "can do normal pickup", and the switch above prints
        // nothing on the way there.
        assert.equal(await pickup_checks(state), -1);
        assert.equal(toplines(state), '');
    });

test('pickup_checks refuses the squares this port cannot answer for',
    async () => {
        // The swallowed arm reads u.ustuck->minvent and ends in loot_mon().
        const swallowed = await heroOnAnEmptySquare();
        swallowed.u.uswallow = 1;
        swallowed.u.ustuck = { data: swallowed.youmonst.data };
        await assert.rejects(
            () => pickup_checks(swallowed),
            (error) => error instanceof UnsupportedPickupError
                && /inside a monster/u.test(error.message),
        );
        swallowed.u.uswallow = 0;
        swallowed.u.ustuck = null;

        // POOL and MOAT are both IS_POOL; LAVAPOOL is IS_LAVA. Each arm turns
        // on properties the ported hero cannot vary, and each falls through
        // when none of them holds, so the terrain alone refuses.
        for (const [typ, pattern] of [
            [POOL, /over water/u],
            [MOAT, /over water/u],
            [LAVAPOOL, /over lava/u],
        ]) {
            const state = await heroOnAnEmptySquare();
            squareUnderHero(state, typ);
            await assert.rejects(
                () => pickup_checks(state),
                (error) => error instanceof UnsupportedPickupError
                    && pattern.test(error.message),
                `typ ${typ}`,
            );
        }

        // can_reach_floor() needs uteetering_at_seen_pit(),
        // rider_cant_reach() and surface() before it can report why. The arm
        // sits past the empty-square return, so the square needs an object
        // before a seen pit can reach it.
        const teetering = await heroOnAnEmptySquare();
        objectUnderHero(teetering);
        teetering.level.traps.push({
            tx: teetering.u.ux, ty: teetering.u.uy, ttyp: PIT, tseen: 1,
        });
        await assert.rejects(
            () => pickup_checks(teetering),
            (error) => error instanceof UnsupportedPickupError
                && /cannot reach the floor/u.test(error.message),
        );
    });

test('dopickup spends no turn on a square with nothing to take', async () => {
    const state = await heroOnAnEmptySquare();
    squareUnderHero(state, STAIRS);
    // C's `gm.multi = 0; /* always reset */` at hack.c:3880. A nonzero value
    // here would otherwise survive the command.
    state.multi = 4;
    assert.equal(await dopickup(state), ECMD_OK);
    assert.equal(state.multi, 0);
    assert.equal(toplines(state), 'The stairs are solidly affixed.');
});

test('dopickup returns on pickup_checks answering 0, without calling pickup',
    async () => {
        // hack.c:3884 is `if ((ret = pickup_checks()) >= 0)`, and the test
        // above cannot tell `>=` from `>`: on an empty square pickup() also
        // answers 0, so both spellings return ECMD_OK. MENU_TRADITIONAL makes
        // the two answers differ, because pickup() refuses that setting at
        // pickup.c:793 while pickup_checks() never consults it. A `>` here
        // would reach that refusal instead of returning.
        const state = await heroOnAnEmptySquare();
        squareUnderHero(state, STAIRS);
        state.flags.menu_style = MENU_TRADITIONAL;
        assert.equal(await dopickup(state), ECMD_OK);
        assert.equal(toplines(state), 'The stairs are solidly affixed.');
    });

test('dopickup hands a square with something on it to pickup()', async () => {
    const state = await heroOnAnEmptySquare();
    const object = objectUnderHero(state);
    // pickup(-count) is pickup(0) here. query_objlist() counts one allowed
    // object and returns it through the AUTOSELECT_SINGLE shortcut, so
    // pickup() answers 1 and hack.c:3890 turns that into ECMD_TIME.
    assert.equal(await dopickup(state), ECMD_TIME);
    assert.ok(carried(state, object));
    assert.equal(state.level.objects[state.u.ux][state.u.uy], null);
    assert.equal(toplines(state), `${object.invlet} - an elven dagger.`);
});

test('dopickup takes the whole stack the square holds', async () => {
    const state = await heroOnAnEmptySquare();
    const object = objectUnderHero(state);
    // query_objlist():1075 hands pickup_object() `last->quan`, so
    // pickup.c:1876's `obj->quan != count` is false and no splitobj() runs.
    object.quan = 4;
    assert.equal(await dopickup(state), ECMD_TIME);
    assert.ok(carried(state, object));
    assert.equal(object.quan, 4);
    assert.equal(toplines(state), `${object.invlet} - 4 elven daggers.`);
});

test('the interactive arm stops before a second object on the square',
    async () => {
        const state = await heroOnAnEmptySquare();
        const first = objectUnderHero(state);
        const second = objectUnderHero(state);
        // Two allowed objects fall past query_objlist():1072 into sortloot()
        // and the menu, which this port refuses. The refusal has to land
        // before reset_justpicked(), so nothing on either chain moves.
        first.pickup_prev = true;
        await assert.rejects(
            () => dopickup(state),
            (error) => error instanceof UnsupportedPickupError
                && /query_objlist\(\) menu/u.test(error.message),
        );
        assert.equal(state.level.objects[state.u.ux][state.u.uy], second);
        assert.equal(second.nexthere, first);
        assert.equal(first.pickup_prev, true);
        assert.equal(toplines(state), '');
    });

test('the interactive arm refuses the settings it cannot answer for',
    async () => {
        // flags.menu_style == MENU_TRADITIONAL without the reqmenu prefix is
        // pickup.c:793's old-style interface. Startup menustyle parsing can
        // now reach it; this test keeps its separate fail-closed boundary.
        const traditional = await heroOnAnEmptySquare();
        objectUnderHero(traditional);
        traditional.flags.menu_style = MENU_TRADITIONAL;
        await assert.rejects(
            () => dopickup(traditional),
            (error) => error instanceof UnsupportedPickupError
                && /traditional interface/u.test(error.message),
        );
        // pickup.c:759's second disjunct: `m,` reaches the menu arm whatever
        // menustyle says, and a single object still takes the shortcut.
        traditional.iflags.menu_requested = true;
        assert.equal(await dopickup(traditional), ECMD_TIME);

    });

// The seed and datetime of run-pickup-command.mjs's fountain case, whose
// upstairs start square is the shortest route to the command.
const SEGMENT = {
    seed: 7710047,
    datetime: '20310203040506',
    nethackrc: 'OPTIONS=name:Pick,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen\n'
        + 'OPTIONS=pettype:none,!acoustics,!autopickup\n',
};

async function play(moves) {
    let boundary = null;
    const replay = await runSegment(
        { ...SEGMENT, moves },
        { onBoundary: (error) => { boundary = error; } },
    );
    return { boundary, replay };
}

test('the , command reaches dopickup and takes no time', async () => {
    // The startup line alone, so the screen count and turn are the ones the
    // command is measured against.
    const { replay: before } = await play(' ');
    const screens = before.getScreens().length;
    const moves = game.moves;

    const { boundary, replay } = await play(' ,');
    assert.equal(boundary, null);
    assert.equal(toplines(game), 'The stairs are solidly affixed.');
    // ECMD_OK leaves svc.context.move at 0, so allmain.c spends no turn.
    assert.equal(game.context.move, 0);
    assert.equal(game.moves, moves);
    // The refusal redraws the top row, which is one more screen.
    assert.equal(replay.getScreens().length, screens + 1);
    assert.deepEqual(replay.getRngSlices().at(-1), []);
});

test('#pickup reaches the same handler as the , key', async () => {
    // rhack() dispatches the bound key itself, so doextcmd()'s "dopickup"
    // row is reached only by naming the command at the '#' prompt.
    const { boundary } = await play(' #pickup\n');
    assert.equal(boundary, null);
    assert.equal(toplines(game), 'The stairs are solidly affixed.');
    assert.equal(game.context.move, 0);
});

test('the , command lifts the one object on the square', async () => {
    // `d` then `a` drops the Valkyrie's wielded spear onto the upstairs, so
    // the next `,` is the OBJ_AT side of hack.c:3825 without a walk.
    const { boundary: dropped } = await play(' da');
    const moves = game.moves;
    assert.equal(dropped, null);

    const { boundary } = await play(' da,');
    assert.equal(boundary, null);
    assert.equal(toplines(game), 'a - a +1 spear.');
    assert.equal(game.level.objects[game.u.ux][game.u.uy], null);
    // pickup() answered 1, so hack.c:3890 returned ECMD_TIME and the move
    // counter advanced where slice one's refusals left it alone.
    assert.equal(game.moves, moves + 1);
});

test('the , command stops on a square holding two objects', async () => {
    // A second drop onto the same square is the first case past this slice:
    // query_objlist() falls through to sortloot() and the menu.
    const { boundary, replay } = await play(' dadb,');
    assert.ok(boundary instanceof UnsupportedHeroCommandBoundaryError);
    assert.match(boundary.message, /query_objlist\(\) menu/u);
    // The second drop's own line is the last thing drawn, and the screen it
    // drew is the last frame: the boundary stops before pickup() prints,
    // lifts anything or spends the turn.
    assert.equal(toplines(game), 'You drop a +0 dagger.');
    const screens = replay.getScreens();
    assert.deepEqual(screens.at(-1), screens.at(-2));
    assert.equal(game.context.move, 0);
});
