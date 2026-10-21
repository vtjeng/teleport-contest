import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { findgd } from '../js/vault.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/vault.c/guard-carried-corridor-gold.session.json', import.meta.url,
), 'utf8'));

async function replay(moves) {
    let boundary;
    await runSegment({ ...recipe.segments[0], moves }, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    const guard = findgd(game);
    assert.ok(guard, 'the escort guard remains on the level');
    return guard;
}

test('guard demands newly carried gold while escorting hero', async () => {
    const moves = recipe.segments[0].moves;
    const guard = await replay(moves.slice(0, -1));
    assert.equal(guard.mextra.egd.warncnt, 6, 'the guard marks the demand');
    assert.equal(guard.mpeaceful, 1, 'the initial demand is peaceful');
    assert.match(game.nhDisplay?.toplines ?? '', /Drop all your gold, scoundrel!/u);
});

test('guard turns hostile when hero keeps carried gold', async () => {
    const guard = await replay(recipe.segments[0].moves);
    assert.equal(guard.mextra.egd.warncnt, 6, 'warning count stays at six');
    assert.equal(guard.mpeaceful, 0, 'the guard turns hostile');
    assert.match(game.nhDisplay?.toplines ?? '', /So be it, rogue!/u);
});
