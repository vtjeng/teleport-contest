import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { findgd } from '../js/vault.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/vault.c/guard-warning-hostile.session.json', import.meta.url,
), 'utf8'));

test('vault guard turns hostile after the final gold warning', async () => {
    let boundary;
    await runSegment(recipe.segments[0], {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    const guard = findgd(game);
    assert.ok(guard, 'the guard remains on the level');
    assert.equal(guard.mpeaceful, 0, 'the guard turns hostile');
    assert.equal(guard.mextra.egd.warncnt, 7, 'the final warning has fired');
});
