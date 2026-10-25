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

test('fatal tower of flame matches its complete C death replay', async () => {
    const recipe = validateCleanRecipe(JSON.parse(readFileSync(new URL(
        '../recipes/read.c/fatal-fire-scroll-tower-killer.session.json',
        import.meta.url))));
    const recorded = JSON.parse(readFileSync(new URL(
        '../recordings/read.c/fatal-fire-scroll-tower-killer.session.json',
        import.meta.url)));
    assert.ok(recorded.segments[0].steps.at(-1).screen.includes(
        'burned by a'));
    assert.ok(recorded.segments[0].steps.at(-1).screen.includes(
        'tower of flame'));

    const root = createScoringWorkspace(process.cwd(), []);
    try {
        const report = compareSessionOutputs(recorded,
            await runJsSession(recorded, root));
        assert.equal(report.passed, true, formatReport(report));
    } finally {
        removeScoringWorkspace(root);
    }

    await runSegment(recipe.segments[0]);
    assert.equal(game.killer.name, 'tower of flame');
    assert.equal(game.killer.format, KILLED_BY_AN);
});

test('nonfatal centered fire scroll retains its full C replay', async () => {
    const recorded = JSON.parse(readFileSync(new URL(
        '../recordings/read.c/read-fire-blessed-highlight.session.json',
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
