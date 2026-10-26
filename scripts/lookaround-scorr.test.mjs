// C ref: cmd.c dolookaround() falls through to lookaround_known_room() on SCORR.
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

for (const name of ['scorr-witness', 'room-control']) {
    test(`lookaround C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/cmd.c/trial-lookaround-${name}.session.json`,
            import.meta.url), 'utf8'));
        const segment = recording.segments[0];
        assert.equal(recording.segments.length, 1);
        assert.equal(segment.steps.length, name === 'scorr-witness' ? 34 : 13);
        assert.equal(segment.steps.reduce((sum, step) => sum + step.rng.length, 0),
                     name === 'scorr-witness' ? 2599 : 2574);
        assert.match(segment.moves, /#lookaround/u);
        if (name === 'scorr-witness') {
            assert.ok(segment.steps.some(({ screen }) =>
                screen?.includes("You can't guess the size of this area.")));
            assert.ok(segment.steps.some(({ screen }) =>
                screen?.includes('(east): newt.')));
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
