import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { runJsSession, compareSessionOutputs, formatReport } from './diff-fresh.mjs';

// hack.c:move_out_of_bounds reports the blocked direction only when
// mention_walls is enabled. The diagonal case still reports south because
// its proposed x coordinate remains on the map.
for (const name of [
    'offedge-before-south-control',
    'offedge-silent-south-control',
    'offedge-mention-walls-south',
    'offedge-mention-walls-diagonal-control',
]) {
    test(`${name} matches its public-input C recording`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/hack.c/${name}.session.json`, import.meta.url,
            )));
            const result = compareSessionOutputs(
                recording, await runJsSession(recording, root),
            );
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
