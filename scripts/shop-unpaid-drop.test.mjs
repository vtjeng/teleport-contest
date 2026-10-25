import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { OBJ_FLOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { shop_keeper } from '../js/shk.js';
import { compareSessionOutputs, formatReport, runJsSession,
    validateCleanRecipe } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace }
    from './scoring-workspace.mjs';

for (const name of ['unpaid-stock-return', 'owned-item-shop-drop-control']) {
    test(`${name} matches the complete C shop drop recording`, async () => {
        const recipe = validateCleanRecipe(JSON.parse(readFileSync(new URL(
            `../recipes/do.c/${name}.session.json`, import.meta.url))));
        const recorded = JSON.parse(readFileSync(new URL(
            `../recordings/do.c/${name}.session.json`, import.meta.url)));
        assert.ok(recorded.segments[0].steps.some(step =>
            step.screen.includes('You drop')));

        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const report = compareSessionOutputs(recorded,
                await runJsSession(recorded, root));
            assert.equal(report.passed, true, formatReport(report));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}

test('returning the unpaid scroll clears its bill and floor ownership', async () => {
    const recipe = JSON.parse(readFileSync(new URL(
        '../recipes/do.c/unpaid-stock-return.session.json', import.meta.url)));
    await runSegment(recipe.segments[0]);
    const keeper = shop_keeper(game.u.ushops[0], game);
    assert.ok(keeper);
    assert.equal(keeper.mextra.eshk.billct, 0);
    const floor = game.level.objects[game.u.ux][game.u.uy];
    assert.ok(floor);
    assert.equal(floor.where, OBJ_FLOOR);
    assert.equal(Boolean(floor.unpaid), false);
});
