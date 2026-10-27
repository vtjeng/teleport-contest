// C refs: cmd.c getdir() redraw_cmd retry and display.c redraw_map().
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

for (const name of ['redraw-retry', 'redraw-control']) {
    test(`getdir C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/cmd.c/getdir-${name}.session.json`,
            import.meta.url), 'utf8'));
        const moves = recording.segments[0].moves;
        assert.equal(moves, name === 'redraw-retry' ? 'o\x12h.' : 'oh.');
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
