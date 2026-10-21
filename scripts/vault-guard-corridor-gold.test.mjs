import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { money_cnt } from '../js/invent.js';
import { g_at } from '../js/obj.js';
import { findgd } from '../js/vault.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/vault.c/guard-corridor-gold.session.json', import.meta.url,
), 'utf8'));

test('vault guard collects gold dropped beneath the hero in its corridor', async () => {
    let boundary;
    await runSegment(recipe.segments[0], {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    const guard = findgd(game);
    assert.ok(guard, 'the guard remains on the level');
    assert.equal(money_cnt(guard.minvent), 100, 'gold belongs to the guard');
    assert.equal(g_at(game.u.ux, game.u.uy, game), null, 'the floor gold is gone');
    assert.equal(guard.mextra.egd.warncnt, 5, 'the escort warning resets');
    assert.match(game.nhDisplay?.toplines ?? '', /picks up the gold from beneath you/u);
});
