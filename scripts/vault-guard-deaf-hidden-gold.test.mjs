import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { money_cnt } from '../js/invent.js';
import { findgd, hidden_gold } from '../js/vault.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/vault.c/guard-deaf-hidden-gold.session.json', import.meta.url,
), 'utf8'));

async function replay(moves) {
    let boundary;
    await runSegment({ ...recipe.segments[0], moves }, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(money_cnt(game.invent), 0, 'the hero has no loose gold');
    assert.equal(hidden_gold(true, game), 1067, 'the gold remains in the sack');
    return game.nhDisplay?.toplines ?? '';
}

test('deaf guard glares at the hero’s sack of hidden gold', async () => {
    const moves = recipe.segments[0].moves;
    const topline = await replay(moves.slice(0, -1));
    assert.match(topline, /The guard glares at your stuff\./u);
});

test('deaf guard silently demands the hidden gold', async () => {
    const topline = await replay(recipe.segments[0].moves);
    assert.match(topline,
        /The guard holds out his palm and beckons with his other hand\./u);
    const guard = findgd(game);
    assert.ok(guard);
    assert.equal(guard.mpeaceful, 1);
    assert.equal(guard.mextra.egd.dropgoldcnt, 1);
    assert.equal(guard.mextra.egd.fcend, 1);
});
