// Intentionally red witness outside default CI; scoped to count input and echo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runJsSession, compareSessionOutputs, formatReport } from '../../../../scripts/diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from '../../../../scripts/scoring-workspace.mjs';
for (const label of ['control', 'witness']) test(`split-count input matches C: ${label}`, async () => {
    const recording = JSON.parse(readFileSync(new URL(`${label}.recording.json`, import.meta.url)));
    const expected = label === 'witness' ? '9007199254740992' : '9007199254740991';
    assert.equal(recording.segments[0].steps[19].screen.split('\n')[0], `Count: ${expected}`);
    const root = createScoringWorkspace(process.cwd(), []);
    try {
        const result = compareSessionOutputs(recording, await runJsSession(recording, root));
        assert.equal(result.passed, true, formatReport(result));
    } finally { removeScoringWorkspace(root); }
});
