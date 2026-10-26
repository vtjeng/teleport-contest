// C refs: cmd.c getdir() retry label and help_dir().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    compareSessionOutputs,
    formatReport,
    runJsSession,
} from './diff-fresh.mjs';
import {
    createScoringWorkspace,
    removeScoringWorkspace,
} from './scoring-workspace.mjs';

for (const name of [
    'help-retry',
    'help-control',
    'invalid-control',
]) {
    test(`getdir C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/cmd.c/trial-getdir-${name}.session.json`,
            import.meta.url), 'utf8'));
        const segment = recording.segments[0];
        if (name === 'help-retry') {
            assert.equal(segment.moves, 'o? h.');
            assert.ok(segment.steps.some(({ screen }) =>
                screen?.includes('Valid direction keys are:')));
            assert.ok(segment.steps.some(({ screen }) =>
                screen?.includes('You see no door there.')));
        }

        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(
                recording,
                await runJsSession(recording, root),
            );
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
