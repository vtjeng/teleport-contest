import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { runSegment } from '../js/jsmain.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../challenges/cases/v67/v67-rogue-blind-probing-action7.recipe.session.json',
    import.meta.url,
), 'utf8')).segments[0];

test('blind probing of a Rogue secret door reports the draft', async () => {
    const game = await runSegment({ ...recipe, moves: recipe.moves.slice(0, 506) });
    const screens = game.getScreens();

    assert.equal(screens.length, 507);
    assert.match(screens.at(-1), /^You feel a draft\./u);
});
