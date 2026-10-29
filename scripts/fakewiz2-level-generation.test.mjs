// C refs: dat/fakewiz2.lua and mklev.c special-level dispatch.
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

for (const name of ['levelport', 'minetn-control']) {
    test(`fakewiz2 C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/mklev.c/trial-fakewiz2-${name}.session.json`,
            import.meta.url), 'utf8'));
        const segment = recording.segments[0];
        assert.equal(recording.segments.length, 1);
        assert.equal(segment.steps.length, 7);
        assert.equal(segment.steps.reduce((sum, step) => sum + step.rng.length, 0),
                     name === 'levelport' ? 5759 : 3692);
        if (name === 'levelport') {
            assert.equal(segment.moves, ' \u0016?\n>u');
        } else {
            assert.equal(segment.moves, ' \u0016?\n>w');
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
