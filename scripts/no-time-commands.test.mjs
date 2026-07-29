import assert from 'node:assert/strict';
import test from 'node:test';

import { flush_screen } from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadNoTimeCommandsRecipe } from './run-no-time-commands.mjs';

// The bytes each checked-in segment relies on having no binding. cmd.c
// rhack() answers each with `Unknown command '<key>'.` and returns without
// setting context.move, which is the property the assertions below measure.
const UNBOUND_BYTES = new Set([...' %\'~]M}{']);

// invent.c dolook()'s and ddoinv()'s default bindings, and the Escape that
// dismisses a menu.
const LOOK_KEY = ':';
const INVENTORY_KEY = 'i';
const SPELL_KEY = '+';
const ESCAPE_KEY = '\u001b';

function topLine() {
    return game.nhDisplay.grid[0]
        .map(({ ch }) => ch).join('').trimEnd();
}

function noTimeKey(key) {
    return UNBOUND_BYTES.has(key) || key === LOOK_KEY
        || key === INVENTORY_KEY || key === ESCAPE_KEY
        || key === SPELL_KEY;
}

function stripNoTime(moves) {
    return [...moves].filter((key) => !noTimeKey(key)).join('');
}

test('no-time-command matrix contains only source-selected inputs', () => {
    const recipe = loadNoTimeCommandsRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 13);
    assert.deepEqual(
        recipe.segments.map(({ moves }) => moves.length),
        [11, 10, 7, 5, 4, 3, 2, 3, 3, 5, 3, 3, 3],
    );
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            [...segment.moves].some(noTimeKey),
            'every segment exercises a command that takes no game time',
        );
    }
    // Three segments own the unbound byte at a command prompt; the rest own
    // the look and inventory commands. All three classes must stay
    // represented as the matrix grows. A Space inside a menu segment
    // dismisses the menu rather than reaching rhack(), so those are excluded.
    assert.equal(
        recipe.segments.filter(
            ({ moves }) => !moves.includes(INVENTORY_KEY)
                && [...moves].some((key) => UNBOUND_BYTES.has(key)),
        ).length,
        3,
    );
    assert.equal(
        recipe.segments.filter(({ moves }) => moves.includes(LOOK_KEY)).length,
        5,
    );
    assert.equal(
        recipe.segments.filter(
            ({ moves }) => moves.includes(INVENTORY_KEY),
        ).length,
        5,
    );
});

test('the look command reports the square and takes no game time', async () => {
    const { segments } = loadNoTimeCommandsRecipe();
    // Each expectation is the line C printed in the recording that admitted
    // the segment: a staircase, a bare floor, a doorway, and one object.
    for (const [index, prefix, expected] of [
        [3, 3, 'There is a staircase up out of the dungeon here.'],
        [4, 2, 'You see no objects here.'],
        [5, 2, 'There is a doorway here.'],
        [6, 2, 'You see here 2 gold pieces.'],
    ]) {
        const segment = segments[index];
        assert.equal(segment.moves[prefix - 1], LOOK_KEY);
        const before = await runSegment({
            ...segment,
            moves: segment.moves.slice(0, prefix - 1),
        });
        const { moves, ux, uy } = { ...game.u, moves: game.moves };
        const rng = before.getRngLog().length;

        const after = await runSegment({
            ...segment,
            moves: segment.moves.slice(0, prefix),
        });
        await flush_screen(1);
        assert.equal(topLine(), expected, `segment ${index}`);
        assert.deepEqual(
            [game.moves, game.u.ux, game.u.uy, after.getRngLog().length],
            [moves, ux, uy, rng],
            `segment ${index} spent no turn and no randomness`,
        );
    }
});

test('no-time commands leave the game where dropping them would',
    async () => {
    const { segments } = loadNoTimeCommandsRecipe();

    for (const [index, segment] of segments.entries()) {
        const full = await runSegment(segment);
        const afterFull = {
            moves: game.moves,
            ux: game.u.ux,
            uy: game.u.uy,
            rng: full.getRngLog().length,
        };
        assert.equal(
            full.getScreens().length,
            segment.moves.length + 1,
            `segment ${index} emits one screen per key plus the first prompt`,
        );

        const strippedMoves = stripNoTime(segment.moves);
        assert.notEqual(
            strippedMoves.length,
            segment.moves.length,
            `segment ${index} carries a no-time command to strip`,
        );
        const stripped = await runSegment({
            ...segment,
            moves: strippedMoves,
        });
        assert.deepEqual(
            {
                moves: game.moves,
                ux: game.u.ux,
                uy: game.u.uy,
                rng: stripped.getRngLog().length,
            },
            afterFull,
            `segment ${index} spent no turn and no randomness on a `
                + 'no-time command',
        );
    }
});

test('each unbound byte answers with its own visctrl name', async () => {
    const { segments } = loadNoTimeCommandsRecipe();

    for (const [index, segment] of segments.entries()) {
        // A Space in a menu segment is the menu's dismissal, not a command.
        if (segment.moves.includes(INVENTORY_KEY)) continue;
        for (const [position, key] of [...segment.moves].entries()) {
            if (!UNBOUND_BYTES.has(key)) continue;
            await runSegment({
                ...segment,
                moves: segment.moves.slice(0, position + 1),
            });
            // The recorded screen for this key is captured at the next input
            // boundary, so paint the pending line the way the next loop
            // iteration would.
            await flush_screen(1);
            assert.equal(
                topLine(),
                `Unknown command '${key}'.`,
                `segment ${index} key ${position}`,
            );
        }
    }
});
