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

function topLine() {
    return game.nhDisplay.grid[0]
        .map(({ ch }) => ch).join('').trimEnd();
}

function stripUnbound(moves) {
    return [...moves].filter((key) => !UNBOUND_BYTES.has(key)).join('');
}

test('no-time-command matrix contains only source-selected inputs', () => {
    const recipe = loadNoTimeCommandsRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 3);
    assert.deepEqual(
        recipe.segments.map(({ moves }) => moves.length),
        [11, 10, 7],
    );
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            [...segment.moves].some((key) => UNBOUND_BYTES.has(key)),
            'every segment exercises at least one unbound byte',
        );
    }
});

test('unbound bytes leave the game where dropping them would', async () => {
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

        const strippedMoves = stripUnbound(segment.moves);
        assert.notEqual(
            strippedMoves.length,
            segment.moves.length,
            `segment ${index} carries unbound bytes to strip`,
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
            `segment ${index} spent no turn and no randomness on an `
                + 'unbound byte',
        );
    }
});

test('each unbound byte answers with its own visctrl name', async () => {
    const { segments } = loadNoTimeCommandsRecipe();

    for (const [index, segment] of segments.entries()) {
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
