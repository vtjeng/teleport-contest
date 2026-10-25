import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { KILLED_BY_AN } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, formatReport, runJsSession,
    validateCleanRecipe } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace }
    from './scoring-workspace.mjs';

for (const [name, blastDescription] of [
    ['fatal-unseen-gas-spore-explosion', 'the explosion'],
    ['fatal-hallucinated-gas-spore-explosion', "the baby yellow dragon's explosion"],
    ['fatal-visible-gas-spore-explosion-control', "the gas spore's explosion"],
]) {
    test(`${name} preserves the C killer across its complete replay`, async () => {
        const recipe = validateCleanRecipe(JSON.parse(readFileSync(new URL(
            `../recipes/explode.c/${name}.session.json`, import.meta.url))));
        const recorded = JSON.parse(readFileSync(new URL(
            `../recordings/explode.c/${name}.session.json`, import.meta.url)));
        const screens = recorded.segments[0].steps.map(step => step.screen);
        assert.ok(screens.some(screen => screen.includes(
            `You are caught in ${blastDescription}!`)));
        const tombstone = screens.at(-1);
        assert.ok(tombstone.includes('killed by a gas'));
        assert.ok(tombstone.includes("spore's"));
        assert.ok(tombstone.includes('explosion'));

        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const report = compareSessionOutputs(recorded,
                await runJsSession(recorded, root));
            assert.equal(report.passed, true, formatReport(report));
        } finally {
            removeScoringWorkspace(root);
        }

        await runSegment(recipe.segments[0]);
        assert.equal(game.killer.name, "gas spore's explosion");
        assert.equal(game.killer.format, KILLED_BY_AN);
    });
}
