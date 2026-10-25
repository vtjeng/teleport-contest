import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, formatReport, runJsSession,
    validateCleanRecipe } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace }
    from './scoring-workspace.mjs';

for (const [name, fatal] of [
    ['fatal-medusa-respond-boundary', true],
    ['blind-medusa-respond-control', false],
]) {
    test(`${name} follows the complete C monster-response replay`, async () => {
        const recipe = validateCleanRecipe(JSON.parse(readFileSync(new URL(
            `../recipes/monmove.c/${name}.session.json`, import.meta.url))));
        const recorded = JSON.parse(readFileSync(new URL(
            `../recordings/monmove.c/${name}.session.json`, import.meta.url)));
        const screens = recorded.segments[0].steps.map(step => step.screen);
        assert.ok(screens.some(screen => screen.includes('force Medusa?')));
        if (fatal) {
            assert.ok(screens.some(screen => screen.includes(
                "You meet Medusa's gaze.  You turn to stone...")));
            assert.ok(screens.some(screen => screen.includes('petrified by')
                && screen.includes('Medusa')));
        } else {
            assert.ok(screens.some(screen => screen.includes(
                "You are now wearing a blindfold.  You can't see any more.")));
            assert.ok(!screens.some(screen => screen.includes('petrified by')));
        }

        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const report = compareSessionOutputs(recorded,
                await runJsSession(recorded, root));
            assert.equal(report.passed, true, formatReport(report));
        } finally {
            removeScoringWorkspace(root);
        }

        await runSegment(recipe.segments[0]);
        assert.equal(Boolean(game.program_state?.gameover), fatal);
    });
}
