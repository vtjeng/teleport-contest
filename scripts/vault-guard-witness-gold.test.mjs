import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { findgd } from '../js/vault.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/vault.c/guard-witness-eaten-gold.session.json', import.meta.url,
), 'utf8'));

test('guard witnesses the hero eating vault gold and turns hostile', async () => {
    let boundary;
    await runSegment(recipe.segments[0], {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    const guard = findgd(game);
    assert.ok(guard, 'the guard remains on the level');
    assert.equal(guard.mextra.egd.witness, 0, 'the guard consumed its witness flag');
    assert.equal(guard.mpeaceful, 0, 'the guard is hostile');
});
