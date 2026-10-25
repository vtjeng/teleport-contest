import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { runJsSession, compareSessionOutputs, formatReport } from './diff-fresh.mjs';

// C sounds.c domonnoise() uses mhis() in the full-moon were and hostile
// giant gem-boast arms. The other wererat recordings control those gates.
for (const name of [
    'were-pronoun-full-moon',
    'were-pronoun-before-control',
    'were-pronoun-not-full-moon',
    'giant-gem-pronoun',
]) {
    test(`monster chat ${name} matches independent C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/sounds.c/${name}.session.json`,
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
