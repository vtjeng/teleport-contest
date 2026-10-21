import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { money_cnt } from '../js/invent.js';
import { findgd } from '../js/vault.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/vault.c/guard-deaf-carried-gold.session.json', import.meta.url,
), 'utf8'));

test('deaf guard demands the hero’s picked-up vault gold', async () => {
    let boundary;
    await runSegment(recipe.segments[0], {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(money_cnt(game.invent), 1067, 'the hero still holds vault gold');
    const guard = findgd(game);
    assert.ok(guard, 'the guard remains to escort the hero');
    assert.equal(guard.mpeaceful, 1);
    assert.equal(guard.mextra.egd.dropgoldcnt, 1, 'the gold demand was recorded');
    assert.equal(guard.mextra.egd.fcend, 1, 'the guard opened its entrance');
    assert.match(game.nhDisplay?.toplines ?? '',
        /The guard holds out his palm and beckons with his other hand\./u);
});
