import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALTAR,
    FOUNTAIN,
    GRAVE,
    IS_FURNITURE,
    ROOM,
    SINK,
    STAIRS,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { cansee } from '../js/vision.js';
import {
    loadFurnitureEntryRecipe,
    RUN_NORTH,
    RUSH_NORTH,
} from './run-furniture-entry.mjs';

// The hero segments spend every key after their arrival on the search
// command, and the monster segments spend every key on it, so no segment can
// reach a second hero destination. The one exception is the room-source swap,
// which walks off the up-staircase before stepping back onto it.
const SEGMENT_KEYS = new Set(['h', 'k', 'l', 's', RUN_NORTH, RUSH_NORTH]);

function heroTerrain() {
    return game.level.at(game.u.ux, game.u.uy).typ;
}

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// Every monster standing on a furniture square, with the terrain type and
// whether the hero can see the square, which is what decides if the arrival
// shows up on a screen or only in the PRNG log.
function furnitureOccupants() {
    const occupants = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        const typ = game.level.at(monster.mx, monster.my)?.typ;
        if (!IS_FURNITURE(typ)) continue;
        occupants.push({
            typ,
            tame: Boolean(monster.mtame),
            seen: cansee(monster.mx, monster.my, game),
        });
    }
    return occupants;
}

test('furniture-entry matrix contains only source-selected inputs', () => {
    const recipe = loadFurnitureEntryRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 16);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment key is an arrival step or the search command',
        );
    }
    // Ctrl-K, the rush prefix cmd.c bind_keys():3467 installs over 'k'.
    assert.equal(RUSH_NORTH.charCodeAt(0), 11);
    // Shift-K, the run prefix installed at 3465-3466.
    assert.equal(RUN_NORTH, 'K');
});

test('every matrix segment replays to its last key', async () => {
    // The port emits one screen per consumed key plus the opening prompt, so a
    // segment that stops early emits fewer. Narrowing the destination
    // predicate its own seam reads stopped fifteen of these sixteen segments
    // short; the Ctrl-rush segment that stops in front of its fountain, and so
    // never enters one, is the exception.
    const { segments } = loadFurnitureEntryRecipe();
    for (const [index, segment] of segments.entries()) {
        const replay = await runSegment(segment);
        assert.equal(
            replay.getScreens().length,
            segment.moves.length + 1,
            `segment ${index} emits one screen per key plus the first prompt`,
        );
    }
});

test('each hero segment ends on the furniture square it walked to',
    async () => {
        const { segments } = loadFurnitureEntryRecipe();
        for (const [index, terrain, position] of [
            [0, FOUNTAIN, [9, 2]],
            [1, SINK, [43, 16]],
            [2, ALTAR, [12, 4]],
            [3, FOUNTAIN, [63, 5]],
            [4, FOUNTAIN, [26, 6]],
            // hack.c:4009-4019 splits lookaround()'s furniture arm on
            // svc.context.run: this Ctrl-rush stops one square south of the
            // fountain segment 4 runs onto with the same seed and direction.
            [5, ROOM, [26, 7]],
            [6, SINK, [43, 16]],
        ]) {
            await runSegment(segments[index]);
            assert.equal(heroTerrain(), terrain, `segment ${index} terrain`);
            assert.deepEqual(
                [game.u.ux, game.u.uy],
                position,
                `segment ${index} position`,
            );
        }
    });

test('the fountain the hero walks onto keeps its gold piece', async () => {
    // Segment 3 runs with autopickup off, so pickup.c pickup() takes its
    // `(autopickup && !flags.pickup)` arm into check_here() and invent.c
    // look_here() describes the square instead of emptying it.
    const segment = loadFurnitureEntryRecipe().segments[3];
    assert.match(segment.nethackrc, /!autopickup/u);
    await runSegment(segment);

    assert.equal(heroTerrain(), FOUNTAIN);
    const floor = game.level.objects[game.u.ux][game.u.uy];
    assert.ok(floor, 'the gold piece is still on the square');
    assert.equal(floor.nexthere, null, 'and it is the only object there');
});

// Each swap segment is replayed only to its arrival key: the two search turns
// the matrix appends afterwards give the pet turns of its own, so the square
// the hero came from does not stay occupied.
test('each swap segment leaves the hero on the furniture the pet held',
    async () => {
        const { segments } = loadFurnitureEntryRecipe();
        for (const [index, moves, terrain, position] of [
            [11, 'l', FOUNTAIN, [72, 17]],
            [12, 'ssssk', SINK, [18, 5]],
            [13, `ss${RUN_NORTH}`, FOUNTAIN, [52, 4]],
            [14, `ss${RUSH_NORTH}`, FOUNTAIN, [52, 4]],
            [15, 'hl', STAIRS, [35, 17]],
        ]) {
            await runSegment({ ...segments[index], moves });
            assert.equal(heroTerrain(), terrain, `segment ${index} terrain`);
            assert.deepEqual(
                [game.u.ux, game.u.uy],
                position,
                `segment ${index} position`,
            );
            assert.equal(
                topLine(),
                'You swap places with your little dog.',
                `segment ${index} message`,
            );
            // hack.c:2936-2941 ends the run on the square the hero swapped
            // into, for run == 1 and run == 3 alike. The two walking segments
            // never set svc.context.run at all, so zero is their whole story.
            assert.equal(game.context.run, 0, `segment ${index} run`);
        }
    });

test('each monster segment puts a monster on the furniture it reached',
    async () => {
        const { segments } = loadFurnitureEntryRecipe();
        // The turn each arrival happens, taken by replaying the port one key
        // at a time; the full segments run twenty turns, by which point some
        // of these monsters have moved on again.
        for (const [index, turns, expected] of [
            [7, 1, [{ typ: FOUNTAIN, tame: true, seen: true }]],
            [8, 8, [{ typ: GRAVE, tame: false, seen: true }]],
            [9, 2, [
                { typ: FOUNTAIN, tame: false, seen: false },
                { typ: ALTAR, tame: true, seen: true },
            ]],
            [10, 2, [{ typ: SINK, tame: false, seen: false }]],
        ]) {
            await runSegment({
                ...segments[index],
                moves: 's'.repeat(turns),
            });
            assert.deepEqual(
                furnitureOccupants().sort((a, b) => a.typ - b.typ),
                expected,
                `segment ${index} after ${turns} turns`,
            );
        }
    });
