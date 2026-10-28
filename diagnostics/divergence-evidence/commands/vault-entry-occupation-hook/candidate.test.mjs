// Deliberately failing witness kept outside the default scripts/ test suite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from '../../../../scripts/diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from '../../../../scripts/scoring-workspace.mjs';
for (const label of ['control', 'witness']) test(`vault entry occupation boundary: ${label}`, async () => {
    const recording = JSON.parse(gunzipSync(readFileSync(new URL(`${label}.recording.json.gz`, import.meta.url))));
    const steps = recording.segments[0].steps;
    if (label === 'witness') assert.match(steps[63].screen, /You stop searching\./u);
    assert.match(steps.at(-1).screen, /Hello stranger, who are you/u);
    const root = createScoringWorkspace(process.cwd(), []);
    try {
        const result = compareSessionOutputs(recording, await runJsSession(recording, root));
        assert.equal(result.passed, true, formatReport(result));
    } finally { removeScoringWorkspace(root); }
});
