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

test('menu-prefixed keyboard travel restores its filter after Escape',
    async () => {
    // This independent wizard seed gives #wizmap visible targets so m_ opens
    // the interesting-location picker before Escape cancels it.
    const segment = {
        seed: 91273,
        datetime: '20861015143100',
        nethackrc: [
            'OPTIONS=name:TravelMenuTest,role:Wizard,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,!autopickup,!debug_mongen,acoustics',
            '',
        ].join('\n'),
        // #wizmap exposes locations; m_ requests menu travel; Escape cancels.
        moves: '#wizmap\nm_\u001b',
    };
    const replay = await runSegment(segment);

    assert.ok(replay.getScreens().some(
        screen => screen.includes('Pick an interesting thing in view for travel destination'),
    ));
    assert.equal(game.iflags.getloc_filter, 0);
    assert.equal(game.iflags.getloc_travelmode, false);
    assert.equal(game.iflags.menu_requested, false);
    assert.deepEqual(game.iflags.travelcc, { x: 0, y: 0 });
});
