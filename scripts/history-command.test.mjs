import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

// Independently recorded C variants cover full paging and abbreviated
// extended-command selection with first-page cancellation. The canonical
// pager is also reached from the existing help-menu history tests.
for (const [name, screens, rng] of [
    // C seed17132011: all18 pages of dat/history, then the restored map.
    ['history-extended-independent', 30, 2730],
    // C seed17132012: #hist autocompletes history; Escape cancels page1.
    ['history-abbreviated-escape-variation', 10, 2334],
]) {
    test(`the extended history dispatcher runs ${name}`, async () => {
        const recipe = JSON.parse(readFileSync(
            new URL(`../recipes/cmd.c/${name}.session.json`, import.meta.url),
            'utf8',
        ));
        const boundaries = [];
        const replay = await runSegment(recipe.segments[0], {
            onBoundary(error) { boundaries.push(error); },
        });
        assert.deepEqual(boundaries, []);
        assert.equal(replay.getScreens().length, screens);
        assert.equal(replay.getCursors().length, screens);
        assert.equal(replay.getRngLog().length, rng);
        // pager.c:dohistory displays source dat/history and returns ECMD_OK.
        assert.ok(replay.getScreens().some(screen =>
            screen.includes('NetHack History file for release 5.0')));
        // Only the initial and final wait consume time, after initial move1.
        assert.equal(game.moves, 3);
    });
}
