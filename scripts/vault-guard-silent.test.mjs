import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { is_silent } from '../js/mondata.js';
import { findgd } from '../js/vault.js';

// vault.c invault(): the silent-form branch precedes the name prompt and
// corridor setup. These public-input routes are also retained as C recordings.
for (const hearing of ['deaf', 'hearing']) {
    test(`vault guard leaves a ${hearing} silent hero without asking their name`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/vault.c/guard-silent-${hearing}.session.json`, import.meta.url,
        ), 'utf8'));
        let boundary;
        await runSegment({ ...recipe.segments[0], moves: recipe.segments[0].moves.slice(0, -1) }, {
            onBoundary: error => { boundary = error; },
        });
        assert.equal(boundary, undefined);
        assert.ok(is_silent(game.youmonst.data), 'the actual polymorphed hero cannot speak');
        assert.equal(findgd(game), null, 'mongone removes the summoned guard');
        assert.match(game.nhDisplay.toplines, hearing === 'deaf'
            ? /The guard huffs and turns to leave\./u
            : /I'll be back when you're ready to speak to me!/u);
    });
}
