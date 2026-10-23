import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// Each recording came from an independent C process. Reuse the JS module
// graph, as hosts may do for separate games, while each replay has fresh storage.
for (const kind of ['crowded', 'variant', 'control']) {
    test(`elemental clog ${kind} matches C across independent games`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/mon.c/elemental-clog-${kind}.session.json`, import.meta.url)));
            for (let run = 0; run < 2; run++) {
                const result = compareSessionOutputs(recording, await runJsSession(recording, root));
                assert.equal(result.passed, true, `game ${run + 1}: ${formatReport(result)}`);
            }
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
