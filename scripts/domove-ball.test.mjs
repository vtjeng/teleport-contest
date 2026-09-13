import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

function holdoutPrefix(lastStep) {
    const session = JSON.parse(readFileSync(new URL(
        '../sessions/holdout/seed4500-knight-coverage.session.json',
        import.meta.url,
    ), 'utf8'));
    const segment = session.segments[0];
    return {
        ...segment,
        moves: segment.steps.slice(1, lastStep + 1)
            .map(({ key }) => key ?? '')
            .join(''),
    };
}

test('domove_core moves the chain before drawing the hero', async () => {
    // hack.c:2860-2864 calls drag_ball() before the tentative hero move, and
    // hack.c:2976-2987 calls move_bc() before spoteffects(). The opened
    // holdout's step 513 is the chain-only distance-4 case: its source screen
    // is `0_@`, with the ball at x=38, chain at x=39 and hero at x=40.
    const replay = await runSegment(holdoutPrefix(513));

    assert.deepEqual(
        [game.uball.ox, game.uball.oy],
        [38, 13],
    );
    assert.deepEqual(
        [game.uchain.ox, game.uchain.oy],
        [39, 13],
    );
    assert.deepEqual([game.u.ux, game.u.uy], [40, 13]);
    assert.equal(
        [...game.nhDisplay.grid[14]].slice(36, 41).map(({ ch }) => ch).join(''),
        '·0_@·',
    );
    assert.deepEqual(replay.getCursors().at(-1), [39, 14, 1]);
});
