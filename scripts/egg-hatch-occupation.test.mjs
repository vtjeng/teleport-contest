// C refs: timeout.c hatch_egg(), makemon.c dochugw(), allmain.c stop_occupation().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const name of [
    'egg-hatch-occupied',
    'egg-hatch-burdened-occupied',
    'egg-hatch-unoccupied',
]) {
    test(`egg hatching matches C during ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/timeout.c/${name}.session.json`, import.meta.url,
        ), 'utf8'));
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(
                recording, await runJsSession(recording, root),
            );
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
