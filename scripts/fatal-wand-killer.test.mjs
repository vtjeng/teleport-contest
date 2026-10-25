import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { NO_KILLER_PREFIX } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, formatReport, runJsSession,
    validateCleanRecipe } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace }
    from './scoring-workspace.mjs';

for (const [name, text, reflexive, possessive] of [
    ['fatal-wand-killer-male', 'caught himself in his own magical blast',
        'caught himself', 'in his own'],
    ['fatal-wand-killer-female', 'caught herself in her own magical blast',
        'caught herself', 'in her own'],
]) {
    test(`${name} matches C through the tombstone`, async () => {
        const recipe = validateCleanRecipe(JSON.parse(readFileSync(new URL(
            `../recipes/explode.c/${name}.session.json`, import.meta.url))));
        const recorded = JSON.parse(readFileSync(new URL(
            `../recordings/explode.c/${name}.session.json`, import.meta.url)));
        const tombstone = recorded.segments[0].steps.at(-1).screen;
        for (const phrase of [reflexive, possessive, 'magical blast'])
            assert.ok(tombstone.includes(phrase));

        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const report = compareSessionOutputs(recorded,
                await runJsSession(recorded, root));
            assert.equal(report.passed, true, formatReport(report));
        } finally {
            removeScoringWorkspace(root);
        }

        await runSegment(recipe.segments[0]);
        assert.equal(game.killer.name, text);
        assert.equal(game.killer.format, NO_KILLER_PREFIX);
    });
}

test('nonfatal wand break retains its complete C replay', async () => {
    const recorded = JSON.parse(readFileSync(new URL(
        '../recordings/explode.c/wand-strike-wizard.session.json', import.meta.url)));
    const root = createScoringWorkspace(process.cwd(), []);
    try {
        const report = compareSessionOutputs(recorded,
            await runJsSession(recorded, root));
        assert.equal(report.passed, true, formatReport(report));
    } finally {
        removeScoringWorkspace(root);
    }
});
