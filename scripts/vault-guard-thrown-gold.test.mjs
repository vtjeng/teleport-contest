import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { money_cnt } from '../js/invent.js';
import { g_at } from '../js/obj.js';
import { findgd } from '../js/vault.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/vault.c/guard-thrown-corridor-gold.session.json', import.meta.url,
), 'utf8'));

test('guard collects gold thrown onto an unoccupied fake-corridor square', async () => {
    let boundary;
    await runSegment(recipe.segments[0], {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    const guard = findgd(game);
    assert.ok(guard, 'the guard remains on the level');
    assert.equal(money_cnt(guard.minvent), 100, 'the guard has the gold');
    assert.equal(g_at(73, 14, game), null, 'the thrown gold is off the corridor');
    assert.deepEqual([guard.mx, guard.my], [73, 13],
        'the guard returned to its original square');
    assert.equal(guard.mextra.egd.warncnt, 5, 'the escort warning resets');
    assert.match(game.nhDisplay?.toplines ?? '', /picks up the gold\./u);
});
