import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { runJsSession, compareSessionOutputs, formatReport } from './diff-fresh.mjs';

// C ref: sounds.c domonnoise() reuses the single rn2(4) gnomeplan draw.
// The second chat reaches its odd result; the controls keep the first even
// result and ordinary non-hallucinated gnome speech covered.
for (const name of ['normal', 'monochrome', 'before-control', 'ordinary-control']) {
    test(`gnome hallucination plan ${name} matches independent C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/sounds.c/gnome-hallu-plan-${name}.session.json`,
                import.meta.url,
            )));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
