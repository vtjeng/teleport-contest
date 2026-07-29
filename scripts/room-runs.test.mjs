import assert from 'node:assert/strict';
import test from 'node:test';

import {
    RUN_CRAWL,
    RUN_LEAP,
    RUN_STEP,
    RUN_TPORT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadRoomRunsRecipe } from './run-room-runs.mjs';

// cmd.c binds the shift-direction keys to the run* commands, which
// set_move_cmd() gives svc.context.run == 1.
const RUN_KEYS = new Set([...'HJKL']);

function runmodeOf(nethackrc) {
    if (nethackrc.includes('runmode:teleport')) return RUN_TPORT;
    if (nethackrc.includes('runmode:walk')) return RUN_STEP;
    if (nethackrc.includes('runmode:crawl')) return RUN_CRAWL;
    return RUN_LEAP;
}

// hack.c runmode_delay_output() calls nh_delay_output() once per delay and
// four more times under RUN_CRAWL. The recorder writes one animation frame
// per call.
const OUTPUTS_PER_CRAWL_DELAY = 5;

test('the room-run recipe contains only replay inputs', () => {
    const recipe = loadRoomRunsRecipe();
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.length >= 15);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.moves, /^ [hjklHJKL]+$/u);
        // Every segment's first keystroke dismisses the welcome message, so
        // the run is never the segment's opening byte.
        assert.ok([...segment.moves.slice(1)].some((key) => RUN_KEYS.has(key)));
        assert.ok(Number.isInteger(segment.seed));
    }
});

test('every checked-in run mode is exercised', () => {
    const modes = new Set(
        loadRoomRunsRecipe().segments.map(
            (segment) => runmodeOf(segment.nethackrc),
        ),
    );
    assert.deepEqual(
        [...modes].sort((a, b) => a - b),
        [RUN_TPORT, RUN_LEAP, RUN_STEP, RUN_CRAWL].sort((a, b) => a - b),
    );
});

test('each checked-in run ends inside a room and clears its run state',
    async () => {
        for (const segment of loadRoomRunsRecipe().segments) {
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
            // The run consumed at least one turn beyond the welcome dismissal.
            assert.ok(game.moves > 1, `${segment.seed} moves`);
            // One keystroke drives the whole run, so the recorded boundary
            // count equals the keystroke count plus the opening prompt.
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `${segment.seed} screens`,
            );

            const runmode = runmodeOf(segment.nethackrc);
            const frames = replay.getAnimationFramesByStep()
                .reduce((sum, step) => sum + step.length, 0);
            // Each delay writes one frame, or five under RUN_CRAWL. How many
            // delays a run performs depends on where it stops, so only the
            // per-delay shape is asserted here; the recorded matrix compares
            // every frame cell by cell.
            if (runmode === RUN_TPORT) {
                assert.equal(frames, 0, `${segment.seed} frames`);
            } else if (runmode === RUN_CRAWL) {
                assert.ok(frames > 0 && frames % OUTPUTS_PER_CRAWL_DELAY === 0,
                    `${segment.seed} frames ${frames}`);
            } else if (runmode === RUN_STEP) {
                // RUN_STEP delays on every turn, so a run of any length shows.
                assert.ok(frames > 0, `${segment.seed} frames`);
            }
        }
    });
