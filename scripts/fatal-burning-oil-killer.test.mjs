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

test('fatal burning oil attributes its own blast through the C tombstone', async () => {
    const recipe = validateCleanRecipe(JSON.parse(readFileSync(new URL(
        '../recipes/explode.c/fatal-burning-oil-self-blast.session.json',
        import.meta.url))));
    const recorded = JSON.parse(readFileSync(new URL(
        '../recordings/explode.c/fatal-burning-oil-self-blast.session.json',
        import.meta.url)));
    const tombstone = recorded.segments[0].steps.at(-1).screen;
    assert.ok(tombstone.includes('caught himself'));
    assert.ok(tombstone.includes('in his own'));
    assert.ok(tombstone.includes('burning oil'));

    const root = createScoringWorkspace(process.cwd(), []);
    try {
        const report = compareSessionOutputs(recorded,
            await runJsSession(recorded, root));
        assert.equal(report.passed, true, formatReport(report));
    } finally {
        removeScoringWorkspace(root);
    }

    await runSegment(recipe.segments[0]);
    assert.equal(game.killer.name, 'caught himself in his own burning oil');
    assert.equal(game.killer.format, NO_KILLER_PREFIX);
});

test('nonfatal lit-oil blast retains its complete C replay', async () => {
    const recorded = JSON.parse(readFileSync(new URL(
        '../recordings/explode.c/lit-oil-potionhit-monster-target-b67-samurai-hit.session.json',
        import.meta.url)));
    const root = createScoringWorkspace(process.cwd(), []);
    try {
        const report = compareSessionOutputs(recorded,
            await runJsSession(recorded, root));
        assert.equal(report.passed, true, formatReport(report));
    } finally {
        removeScoringWorkspace(root);
    }
});
