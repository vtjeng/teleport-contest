import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { runJsSession, compareSessionOutputs, formatReport } from './diff-fresh.mjs';

// C sounds.c:domonnoise uses integer division for both wounded-health gates.
// The recorded hobbit starts at 5 HP; one kick leaves 2 HP, two leave 1 HP.
// The healthy chat controls the ordinary speech path without either kick.
for (const name of [
    'humanoid-health-healthy-control',
    'humanoid-health-half-boundary',
    'humanoid-health-quarter-boundary',
]) {
    test(`${name} matches independent C chat replay`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/sounds.c/${name}.session.json`, import.meta.url,
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
