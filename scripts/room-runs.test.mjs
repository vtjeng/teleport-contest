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

// Where each checked-in run stops and how many animation frames it writes, in
// recipe order. scripts/run-room-runs.mjs compares both against fresh C
// output, cursor by cursor and frame by frame, but `npm test` never runs that
// matrix. These literals are what carries the comparison into the suite: the
// square pins every stop site the run passes through, and the frame count pins
// runmode_delay_output()'s cadence, which a shape-only assertion such as
// "a multiple of five" cannot.
const RUN_OUTCOMES = [
    // 0: check_here()'s object stop twelve squares west. Under RUN_LEAP only
    // the turn where svm.moves reaches 7 delays, and it delays twice.
    { square: [45, 4], frames: 2 },
    // 1: test_move() fails against the east wall on the twelfth step.
    { square: [17, 17], frames: 2 },
    // 2: the same run under RUN_STEP, which delays on every turn.
    { square: [17, 17], frames: 22 },
    // 3: RUN_CRAWL, five nh_delay_output() calls per delay.
    { square: [28, 18], frames: 110 },
    // 4: RUN_TPORT suppresses every intermediate frame, and the run still
    // stops on the same object square as case 0.
    { square: [45, 4], frames: 0 },
    // 5: flags.time does not change the RUN_LEAP cadence.
    { square: [17, 17], frames: 2 },
    // 6: flags.time under RUN_STEP, nine turns.
    { square: [23, 15], frames: 16 },
    // 7: the doorway is the run's first square, so it ends after one step and
    // never reaches a delay.
    { square: [50, 3], frames: 0 },
    // 8: four squares west onto a doorway, still short of svm.moves 7.
    { square: [71, 18], frames: 0 },
    // 9: the two walks after the run are refused by the same wall, so the
    // hero finishes where case 1 does.
    { square: [17, 17], frames: 2 },
    // 10: a walk before the run reaches the same wall.
    { square: [17, 17], frames: 2 },
    // 11: two runs; the second advances one more square west.
    { square: [44, 4], frames: 2 },
    // 12: six squares south.
    { square: [7, 10], frames: 0 },
    // 13: six squares west, ending on the turn svm.moves reaches 7, which
    // delays once rather than twice because the run is over.
    { square: [14, 6], frames: 1 },
    // 14: flags.mention_walls on, same wall stop as case 1.
    { square: [17, 17], frames: 2 },
    // 15-17: lookaround() stops for a monster on the next square.
    { square: [14, 18], frames: 0 },
    { square: [15, 5], frames: 0 },
    { square: [22, 5], frames: 0 },
    // 18: the hero swaps with the pet and the run continues past it.
    { square: [59, 5], frames: 0 },
];

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
        const segments = loadRoomRunsRecipe().segments;
        assert.equal(segments.length, RUN_OUTCOMES.length);
        for (const [index, segment] of segments.entries()) {
            const expected = RUN_OUTCOMES[index];
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

            // Where the run stopped. Every stop site the segment relies on --
            // check_here()'s object stop, domove_core()'s door and furniture
            // arm, its failed test_move() arm, lookaround()'s monster arm --
            // moves the hero to a different square if it is removed.
            assert.deepEqual(
                [game.u.ux, game.u.uy],
                expected.square,
                `${segment.seed} ${JSON.stringify(segment.moves)} square`,
            );

            const runmode = runmodeOf(segment.nethackrc);
            const frames = replay.getAnimationFramesByStep()
                .reduce((sum, step) => sum + step.length, 0);
            assert.equal(
                frames,
                expected.frames,
                `${segment.seed} ${JSON.stringify(segment.moves)} frames`,
            );
            // The relations the counts above have to hold to, restated so a
            // wrong literal cannot quietly redefine the cadence: teleport mode
            // writes nothing, crawl mode writes five frames per delay, and
            // walk mode delays on every turn of a run that took several.
            if (runmode === RUN_TPORT) {
                assert.equal(frames, 0, `${segment.seed} frames`);
            } else if (runmode === RUN_CRAWL) {
                assert.ok(frames > 0 && frames % OUTPUTS_PER_CRAWL_DELAY === 0,
                    `${segment.seed} frames ${frames}`);
            } else if (runmode === RUN_STEP) {
                assert.ok(frames >= game.moves, `${segment.seed} frames`);
            }
        }
    });
