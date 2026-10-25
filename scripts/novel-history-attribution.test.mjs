import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { runJsSession, compareSessionOutputs, formatReport } from './diff-fresh.mjs';

// C files.c read_tribute() records a numbered attribution after novel text.
// ^P exposes that history line; the before-control ends before history review.
for (const name of ['normal', 'before-control', 'monochrome']) {
    test(`novel history ${name} matches independent C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/files.c/novel-history-${name}.session.json`,
                import.meta.url,
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
