import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { money_cnt } from '../js/invent.js';
import { g_at } from '../js/obj.js';
import { findgd } from '../js/vault.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/vault.c/guard-distant-corridor-gold.session.json', import.meta.url,
), 'utf8'));

test('distant guard approaches then collects corridor gold beneath the hero', async () => {
    let boundary;
    await runSegment(recipe.segments[0], {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    const guard = findgd(game);
    assert.ok(guard, 'the guard remains on the level');
    assert.equal(money_cnt(guard.minvent), 100, 'the guard has the gold');
    assert.equal(g_at(game.u.ux, game.u.uy, game), null, 'the floor gold is gone');
    assert.deepEqual([guard.mx, guard.my], [73, 13],
        'the guard returned to its original corridor square');
    assert.equal(guard.mextra.egd.warncnt, 5, 'the escort warning resets');
    assert.match(game.nhDisplay?.toplines ?? '', /picks up the gold from beneath you/u);
});
