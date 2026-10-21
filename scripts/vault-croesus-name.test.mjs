import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { findgd } from '../js/vault.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/vault.c/croesus-name-guard.session.json', import.meta.url,
), 'utf8'));

test('ordinary vault guard accepts Croesus and leaves the level', async () => {
    let boundary;
    await runSegment(recipe.segments[0], {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(findgd(game), null, 'the guard vanished after the answer');
});
