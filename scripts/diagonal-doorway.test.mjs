import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DOOR,
    DO_MOVE,
    D_BROKEN,
    D_ISOPEN,
    D_NODOOR,
    ROOM,
    SDOOR,
    STONE,
} from '../js/const.js';
import { cant_squeeze_thru, test_move } from '../js/hack.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GARTER_SNAKE, PM_HORSE } from '../js/monsters.js';
import {
    loadDiagonalDoorwayEntryRecipe,
    loadDiagonalDoorwayExitRecipe,
    loadDoorlessDoorwayRecipe,
} from './run-diagonal-doorway.mjs';

// cmd.c's vi-key movement bindings, restricted to what these recipes press.
const DIRECTIONS = {
    h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
    y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};

function doorMask(location) {
    return location?.flags || location?.doormask || 0;
}

// hack.c doorless_door(), restated here so a mutation of the production
// predicate cannot also move the oracle.
function isDoorless(location) {
    return location?.typ === DOOR
        && (doorMask(location) & ~(D_NODOOR | D_BROKEN)) === 0;
}

function recipeHygiene(recipe, segments, label) {
    assert.equal(recipe.version, 5, label);
    assert.equal(recipe.segments.length, segments, label);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false, label);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            [...segment.moves].every((key) => Object.hasOwn(DIRECTIONS, key)),
            `${label} presses movement keys only`,
        );
    }
}

test('the diagonal doorway matrix contains only source-selected inputs', () => {
    recipeHygiene(loadDiagonalDoorwayEntryRecipe(), 6, 'entry');
    recipeHygiene(loadDiagonalDoorwayExitRecipe(), 6, 'exit');
    recipeHygiene(loadDoorlessDoorwayRecipe(), 2, 'doorless');
    // The rule reads dx and dy, so a matrix that pressed one diagonal would
    // pin nothing about the other three.
    const diagonals = new Set();
    for (const recipe of [
        loadDiagonalDoorwayEntryRecipe(),
        loadDiagonalDoorwayExitRecipe(),
        loadDoorlessDoorwayRecipe(),
    ]) {
        for (const segment of recipe.segments) {
            for (const key of segment.moves) {
                if (DIRECTIONS[key][0] && DIRECTIONS[key][1])
                    diagonals.add(key);
            }
        }
    }
    assert.deepEqual([...diagonals].sort(), ['b', 'n', 'u', 'y']);
});

// Each entry counts the keys in that segment that spend a turn. hack.c
// domove_core():2843-2849 answers a FALSE from test_move() with
// `svc.context.move = 0; nomul(0)`, so a refused diagonal costs nothing; the
// pull that opens a door costs nothing either, by hack.c:1111.
const TURNS_SPENT = {
    entry: [0, 0, 0, 0, 0, 0],
    exit: [1, 1, 1, 1, 1, 1],
    doorless: [2, 2],
};

test('every matrix segment replays to its last key', async () => {
    const recipes = {
        entry: loadDiagonalDoorwayEntryRecipe(),
        exit: loadDiagonalDoorwayExitRecipe(),
        doorless: loadDoorlessDoorwayRecipe(),
    };
    for (const [label, recipe] of Object.entries(recipes)) {
        for (const [index, segment] of recipe.segments.entries()) {
            const replay = await runSegment(segment);
            // The port emits one screen per consumed key plus the opening
            // prompt, so a segment that stopped early would emit fewer.
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `${label} segment ${index} replays every key`,
            );
            // game.moves starts at 1, so the elapsed turns are one less.
            assert.equal(
                game.moves - 1,
                TURNS_SPENT[label][index],
                `${label} segment ${index} spends its recorded turns`,
            );
        }
    }
});

test('the entry segments end beside the doorway they were refused', async () => {
    for (const segment of loadDiagonalDoorwayEntryRecipe().segments) {
        const replay = await runSegment(segment);
        const [dx, dy] = DIRECTIONS[segment.moves.at(-1)];
        const destination = game.level.at(game.u.ux + dx, game.u.uy + dy);
        assert.equal(destination.typ, DOOR, `seed ${segment.seed}`);
        assert.equal(
            isDoorless(destination),
            false,
            `seed ${segment.seed} was refused by a door, not by a doorway`,
        );
        assert.notEqual(game.level.at(game.u.ux, game.u.uy).typ, DOOR);
        void replay;
    }
});

test('the exit segments end on the doorway they were refused off', async () => {
    for (const segment of loadDiagonalDoorwayExitRecipe().segments) {
        await runSegment(segment);
        const here = game.level.at(game.u.ux, game.u.uy);
        assert.equal(here.typ, DOOR, `seed ${segment.seed}`);
        assert.equal(doorMask(here), D_ISOPEN, `seed ${segment.seed}`);
    }
});

test('the doorless segments walk the diagonals the rules leave open',
    async () => {
        // Replaying growing prefixes gives the square the hero stood on after
        // each key, which is what shows that a doorless doorway was both
        // entered and left rather than merely passed beside.
        for (const segment of loadDoorlessDoorwayRecipe().segments) {
            const squares = [];
            for (let keys = 0; keys <= segment.moves.length; ++keys) {
                await runSegment({
                    ...segment,
                    moves: segment.moves.slice(0, keys),
                });
                squares.push([game.u.ux, game.u.uy]);
            }
            for (let step = 1; step < squares.length; ++step) {
                assert.notDeepEqual(
                    squares[step],
                    squares[step - 1],
                    `seed ${segment.seed} moved on key ${step}`,
                );
            }
            // The last key is a diagonal and the hero took it, so its starting
            // square is a doorway that armed neither rule.
            const [ux, uy] = squares.at(-2);
            const [x, y] = squares.at(-1);
            assert.ok(x !== ux && y !== uy, `seed ${segment.seed} left diagonally`);
            const left = game.level.at(ux, uy);
            assert.equal(left.typ, DOOR, `seed ${segment.seed}`);
            assert.equal(doorMask(left), D_NODOOR, `seed ${segment.seed}`);
            assert.ok(isDoorless(left), `seed ${segment.seed}`);
        }
    });

// hack.c cant_squeeze_thru()'s four results, with the thresholds read from
// weight.h:22 (WT_TOOMUCH_DIAGONAL = 600) rather than from any recording.
test('cant_squeeze_thru answers for the hero and for a monster', async () => {
    await runSegment({
        seed: 9600003,
        datetime: '20310203040506',
        nethackrc: 'OPTIONS=name:Squeeze,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none',
        moves: '',
    });
    // An ordinary starting hero fits: no polyform, no Sokoban, and a starting
    // inventory far below the threshold.
    assert.equal(cant_squeeze_thru(game.youmonst), 0);

    // 600 is the boundary itself and C compares with `>`, so it still fits.
    game.invent = { otyp: 0, oclass: 0, owt: 600, quan: 1, nobj: null };
    assert.equal(cant_squeeze_thru(game.youmonst), 0);
    game.invent.owt = 601;
    assert.equal(cant_squeeze_thru(game.youmonst), 2);

    // Sokoban is tested after the weight, so it only shows with a light pack.
    game.invent.owt = 1;
    game.level.flags.sokoban_rules = true;
    assert.equal(cant_squeeze_thru(game.youmonst), 3);
    game.level.flags.sokoban_rules = false;

    // A bigmonst polyform is tested first and wins over both. A horse is
    // MZ_LARGE, the size bigmonst() starts at; the pony beside it in mons[] is
    // MZ_MEDIUM and would answer 2 here instead.
    const heroSpecies = game.youmonst.data;
    assert.ok(game.mons[PM_HORSE], 'the monster catalog is initialized');
    game.youmonst.data = game.mons[PM_HORSE];
    game.invent.owt = 601;
    assert.equal(cant_squeeze_thru(game.youmonst), 1);
    game.youmonst.data = heroSpecies;
    game.invent = null;

    // The monster branch reads curr_mon_load() and its own species, and is
    // never stopped by Sokoban. A garter snake is small, so only its load can
    // answer.
    const monster = {
        data: game.mons[PM_GARTER_SNAKE],
        minvent: { otyp: 0, owt: 601, nobj: null },
    };
    assert.equal(cant_squeeze_thru(monster, game), 2);
    monster.minvent.owt = 600;
    game.level.flags.sokoban_rules = true;
    assert.equal(cant_squeeze_thru(monster, game), 0);
    game.level.flags.sokoban_rules = false;
    monster.data = game.mons[PM_HORSE];
    assert.equal(cant_squeeze_thru(monster, game), 1);
});

// hack.c:1153-1171. The tight-diagonal switch's three refusals are deferred,
// so test_move() stops instead of squeezing a hero through in silence.
test('test_move stops a tight diagonal the hero cannot squeeze through',
    async () => {
        await runSegment({
            seed: 9600003,
            datetime: '20310203040506',
            nethackrc: 'OPTIONS=name:Tight,role:Valkyrie,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none',
            moves: '',
        });
        const { ux, uy } = game.u;
        // A corridor diagonal: both corner squares are rock, which is what
        // makes the diagonal tight.
        game.level.at(ux, uy).typ = ROOM;
        game.level.at(ux + 1, uy + 1).typ = ROOM;
        game.level.at(ux, uy + 1).typ = STONE;
        game.level.at(ux + 1, uy).typ = STONE;
        for (const column of game.level.monsters) column.fill(null);

        // An ordinary pack squeezes through, which is the live outcome.
        assert.equal(
            await test_move(ux, uy, 1, 1, DO_MOVE, game, { message: async () => {} }),
            true,
        );
        // 601 crosses WT_TOOMUCH_DIAGONAL, so C would print "You are carrying
        // too much to get through." and this port stops.
        game.invent = { otyp: 0, oclass: 0, owt: 601, quan: 1, nobj: null };
        await assert.rejects(
            test_move(ux, uy, 1, 1, DO_MOVE, game, { message: async () => {} }),
            /tight diagonal move/u,
        );
        game.invent = null;
    });

// hack.c:1011. The obstacle arm claims the destination before either diagonal
// rule sees it, so a hero on an intact doorway who steps diagonally at a
// secret door meets the terrain refusal rather than the exit rule's message.
// Getting that order wrong would print "You can't move diagonally out of an
// intact doorway." where C prints "It's a wall."
test('an obstructed destination outranks the diagonal doorway rules',
    async () => {
        await runSegment({
            seed: 9600003,
            datetime: '20310203040506',
            nethackrc: 'OPTIONS=name:Secret,role:Valkyrie,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none,mention_walls',
            moves: '',
        });
        const { ux, uy } = game.u;
        const here = game.level.at(ux, uy);
        here.typ = DOOR;
        here.flags = here.doormask = D_ISOPEN;
        for (const column of game.level.monsters) column.fill(null);

        // An ordinary destination takes the exit rule and its message.
        const lines = [];
        const env = { message: async (line) => { lines.push(line); } };
        game.level.at(ux + 1, uy + 1).typ = ROOM;
        assert.equal(await test_move(ux, uy, 1, 1, DO_MOVE, game, env), false);
        assert.deepEqual(
            lines,
            ["You can't move diagonally out of an intact doorway."],
        );

        // SDOOR is IS_OBSTRUCTED and this port does not own it, so the same
        // step stops at the terrain boundary instead.
        game.level.at(ux + 1, uy + 1).typ = SDOOR;
        await assert.rejects(
            test_move(ux, uy, 1, 1, DO_MOVE, game, env),
            /door or special terrain movement/u,
        );
    });

// hack.c:1172-1176. The port carries worm_cross()'s first two tests and stops
// where its wtails[] walk would decide.
test('test_move stops a diagonal between two segments of one monster',
    async () => {
        await runSegment({
            seed: 9600003,
            datetime: '20310203040506',
            nethackrc: 'OPTIONS=name:Worm,role:Valkyrie,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none',
            moves: '',
        });
        const { ux, uy } = game.u;
        for (const typ of [[0, 0], [1, 1], [0, 1], [1, 0]]) {
            game.level.at(ux + typ[0], uy + typ[1]).typ = ROOM;
        }
        for (const column of game.level.monsters) column.fill(null);
        const worm = { data: game.mons[PM_GARTER_SNAKE], mx: ux, my: uy + 1 };
        game.level.monsters[ux][uy + 1] = worm;
        // One corner alone is not enough: worm_cross() needs the same monster
        // on both.
        assert.equal(
            await test_move(ux, uy, 1, 1, DO_MOVE, game, { message: async () => {} }),
            true,
        );
        game.level.monsters[ux + 1][uy] = worm;
        await assert.rejects(
            test_move(ux, uy, 1, 1, DO_MOVE, game, { message: async () => {} }),
            /long worm body crossing/u,
        );
    });
