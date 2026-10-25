import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { runJsSession, compareSessionOutputs, formatReport } from './diff-fresh.mjs';

// C context.h gives novel.pasg 30 slots. The 31-quote Death title exercises
// reservoir sampling, then chooses from all 30 retained slots.
for (const name of [
    'normal', 'before-control', 'monochrome', 'seed-variation',
]) {
    test(`Death quote ${name} matches independent C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/files.c/death-quote-${name}.session.json`,
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
