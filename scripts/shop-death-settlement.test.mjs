import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, formatReport, runJsSession,
    validateCleanRecipe } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace }
    from './scoring-workspace.mjs';

// Public C shop-death paths: enough gold to settle the stolen bill, no gold
// so the keeper takes the pack, a shop visit with no unpaid goods, and a
// peaceful death inside that shop where the keeper inherits the pack, and
// Minetown death with three resident keepers processed in priority order.
for (const [name, message] of [
    ['unpaid-death-money-settlement', 'takes the 38 zorkmids you owed her'],
    ['unpaid-death-inventory-settlement', 'takes all your possessions'],
    ['unpaid-death-no-bill-control', null],
    ['peaceful-inshop-bequest', 'gratefully inherits all your possessions'],
    ['multi-shopkeeper-death', 'gratefully inherits all your possessions'],
]) {
    test(`${name} matches the complete C death recording`, async () => {
        const recipe = validateCleanRecipe(JSON.parse(readFileSync(new URL(
            `../recipes/shk.c/${name}.session.json`, import.meta.url))));
        assert.equal(recipe.segments.length, 1);
        const recorded = JSON.parse(readFileSync(new URL(
            `../recordings/shk.c/${name}.session.json`, import.meta.url)));
        const screens = recorded.segments[0].steps.map(step => step.screen ?? '');
        if (message) assert.ok(screens.some(screen => screen.includes(message)));
        else assert.ok(screens.every(screen => !screen.includes('takes all your possessions')
            && !screen.includes('zorkmids you owed')));

        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const report = compareSessionOutputs(recorded, await runJsSession(recorded, root));
            assert.equal(report.passed, true, formatReport(report));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
