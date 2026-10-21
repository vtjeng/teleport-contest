import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { findgd } from '../js/vault.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/vault.c/guard-deaf-name-response.session.json', import.meta.url,
), 'utf8'));

async function replay(moves) {
    let boundary;
    await runSegment({ ...recipe.segments[0], moves }, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    return game.nhDisplay?.toplines ?? '';
}

test('deaf hero sees guard fail to recognize their name', async () => {
    const moves = recipe.segments[0].moves;
    const topline = await replay(moves.slice(0, -1));
    assert.match(topline, /The guard doesn't appear to recognize you\./u);
});

test('deaf hero with no gold sees guard stomp and beckon', async () => {
    const topline = await replay(recipe.segments[0].moves);
    assert.match(topline, /The guard stomps and beckons\./u);
    const guard = findgd(game);
    assert.ok(guard, 'the guard remains to escort the hero');
    assert.equal(guard.mpeaceful, 1);
    assert.equal(guard.mextra.egd.fcend, 1, 'the guard opened its entrance');
});
