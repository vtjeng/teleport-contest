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

for (const [name, fatal] of [
    ['fatal-trap-blast-killer', true],
    ['trap-blast-magic-resistant-control', false],
]) {
    test(`${name} matches its complete independent C replay`, async () => {
        const recipe = validateCleanRecipe(JSON.parse(readFileSync(new URL(
            `../recipes/explode.c/${name}.session.json`, import.meta.url))));
        const recorded = JSON.parse(readFileSync(new URL(
            `../recordings/explode.c/${name}.session.json`, import.meta.url)));
        const screens = recorded.segments[0].steps.map(step => step.screen);
        assert.ok(screens.some(screen => screen.includes(
            'Boom!  You are caught in the magical blast!')));
        if (fatal) assert.ok(screens.some(screen => screen.includes(
            'caught herself') && screen.includes('in a magical')));

        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const report = compareSessionOutputs(recorded,
                await runJsSession(recorded, root));
            assert.equal(report.passed, true, formatReport(report));
        } finally {
            removeScoringWorkspace(root);
        }

        if (fatal) {
            await runSegment(recipe.segments[0]);
            assert.equal(game.killer.name, 'caught herself in a magical blast');
            assert.equal(game.killer.format, NO_KILLER_PREFIX);
        }
    });
}
