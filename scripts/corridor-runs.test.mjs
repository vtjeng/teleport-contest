import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORR,
    DOOR,
    RUN_CRAWL,
    RUN_LEAP,
    RUN_STEP,
    RUN_TPORT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadCorridorRunsRecipe } from './run-corridor-runs.mjs';

// cmd.c binds the shift-direction keys to the run* commands, which
// set_move_cmd() gives svc.context.run == 1.
const RUN_KEYS = new Set([...'HJKL']);

function runmodeOf(nethackrc) {
    if (nethackrc.includes('runmode:teleport')) return RUN_TPORT;
    if (nethackrc.includes('runmode:walk')) return RUN_STEP;
    if (nethackrc.includes('runmode:crawl')) return RUN_CRAWL;
    return RUN_LEAP;
}

// The keystrokes before the first shift key, which walk the hero to the square
// the run starts from.
function prefixBeforeFirstRun(moves) {
    const index = [...moves].findIndex((key) => RUN_KEYS.has(key));
    assert.notEqual(index, -1);
    return moves.slice(0, index);
}

test('the corridor-run recipe contains only replay inputs', () => {
    const recipe = loadCorridorRunsRecipe();
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.length >= 20);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.moves, /^ [hjklyubnHJKL]+$/u);
        // Every segment's first keystroke dismisses the welcome message, so
        // the run is never the segment's opening byte.
        assert.ok([...segment.moves.slice(1)].some((key) => RUN_KEYS.has(key)));
        assert.ok(Number.isInteger(segment.seed));
    }
});

test('every checked-in run mode is exercised', () => {
    const modes = new Set(
        loadCorridorRunsRecipe().segments.map(
            (segment) => runmodeOf(segment.nethackrc),
        ),
    );
    assert.deepEqual(
        [...modes].sort((a, b) => a - b),
        [RUN_TPORT, RUN_LEAP, RUN_STEP, RUN_CRAWL].sort((a, b) => a - b),
    );
});

// The direction cmd.c gives each shift key.
const RUN_DIRECTION = new Map([
    ['H', [-1, 0]], ['J', [0, 1]], ['K', [0, -1]], ['L', [1, 0]],
]);

test('each checked-in run starts off a room square and turns corners',
    async () => {
        // hack.c lookaround() reaches its bcorr label, and therefore every
        // corridor arm and the corner turn, only while
        // levl[u.ux][u.uy].typ != ROOM. Replaying the keys ahead of the first
        // shift key pins that this matrix puts the hero there, which is the
        // whole difference between it and scripts/run-room-runs.mjs.
        //
        // Every key from that point on names the same direction, so any
        // displacement across it must come from a corner turn.
        let turned = 0;
        for (const segment of loadCorridorRunsRecipe().segments) {
            const prefix = prefixBeforeFirstRun(segment.moves);
            await runSegment({ ...segment, moves: prefix });
            const typ = game.level.at(game.u.ux, game.u.uy).typ;
            assert.ok(
                typ === DOOR || typ === CORR,
                `${segment.seed} starts its run on terrain ${typ}`,
            );
            const startX = game.u.ux;
            const startY = game.u.uy;

            let boundary = null;
            const replay = await runSegment(
                segment,
                { onBoundary: (error) => { boundary = error; } },
            );
            assert.equal(
                boundary,
                null,
                `${segment.seed} stopped at ${boundary?.message}`,
            );
            // nomul(0) ends every stop hack.c can reach here, so neither the
            // run nor its multi sentinel survives the keystroke.
            assert.equal(game.context.run, 0, `${segment.seed} run`);
            assert.equal(game.multi, 0, `${segment.seed} multi`);
            assert.ok(game.moves > 1, `${segment.seed} moves`);
            // One keystroke drives the whole run, so the recorded boundary
            // count equals the keystroke count plus the opening prompt.
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `${segment.seed} screens`,
            );

            const [dx] = RUN_DIRECTION.get(segment.moves[prefix.length]);
            const across = dx
                ? game.u.uy - startY
                : game.u.ux - startX;
            if (across !== 0) turned += 1;
        }
        assert.ok(turned >= 15, `${turned} of the runs turned a corner`);
    });
