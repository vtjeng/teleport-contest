import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { stairway_at } from '../js/stairs.js';
import { loadTravelAdmissionRecipe } from './run-travel-admission.mjs';

test('ordinary travel selects downstairs and follows the shortest path',
    async () => {
    const expected = [
        { rng: 2539, screens: 14, x: 68, y: 12 },
        { rng: 2788, screens: 19, x: 45, y: 7 },
    ];
    for (const [index, segment]
        of loadTravelAdmissionRecipe({ acceptTarget: true }).segments.entries()) {
        const replay = await runSegment(segment);
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
        assert.equal(game.iflags.getloc_travelmode, false);
        assert.deepEqual(
            { x: game.u.ux, y: game.u.uy },
            { x: expected[index].x, y: expected[index].y },
        );
        assert.deepEqual(game.iflags.travelcc, { x: 0, y: 0 });
        assert.equal(game.context.travel, 0);
        assert.equal(game.context.travel1, 0);
        assert.equal(game.context.run, 0);
        assert.equal(game.multi, 0);
        assert.equal(game.travelmap, null);
    }
});
