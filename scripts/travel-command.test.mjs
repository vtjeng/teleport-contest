import assert from 'node:assert/strict';
import test from 'node:test';

import { UnsupportedHeroMoveBoundaryError } from '../js/hack.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { stairway_at } from '../js/stairs.js';
import { loadTravelAdmissionRecipe } from './run-travel-admission.mjs';

test('ordinary travel selects downstairs and reaches findtravelpath boundary',
    async () => {
    const expected = [
        { rng: 2530, screens: 13, x: 68, y: 12 },
        { rng: 2783, screens: 18, x: 45, y: 7 },
    ];
    for (const [index, segment]
        of loadTravelAdmissionRecipe({ acceptTarget: true }).segments.entries()) {
        let boundary = null;
        const replay = await runSegment(segment, {
            onBoundary: (error) => { boundary = error; },
        });

        assert.ok(
            boundary instanceof UnsupportedHeroMoveBoundaryError,
            `${segment.seed} boundary type`,
        );
        assert.match(boundary.message, /findtravelpath/u);
        assert.equal(
            replay.getScreens().length,
            expected[index].screens,
            `${segment.seed} screens`,
        );
        assert.equal(
            replay.getCursors().length,
            expected[index].screens,
            `${segment.seed} cursors`,
        );
        assert.equal(
            replay.getRngLog().length,
            expected[index].rng,
            `${segment.seed} PRNG calls`,
        );

        assert.deepEqual(
            { x: game.u.tx, y: game.u.ty },
            { x: expected[index].x, y: expected[index].y },
        );
        assert.equal(
            stairway_at(game.u.tx, game.u.ty, game)?.up,
            false,
            `${segment.seed} selects downstairs`,
        );
        assert.deepEqual(game.u.tx, game.iflags.travelcc.x);
        assert.deepEqual(game.u.ty, game.iflags.travelcc.y);
        assert.notDeepEqual(
            { x: game.u.tx, y: game.u.ty },
            { x: game.u.ux, y: game.u.uy },
        );
        assert.equal(game.iflags.getloc_travelmode, false);
        assert.equal(game.context.travel, 1);
        assert.equal(game.context.travel1, 1);
        assert.equal(game.context.run, 8);
        assert.equal(game.context.nopick, 1);
        assert.equal(game.context.mv, 1);
        assert.equal(game.multi, 80);
    }
});
