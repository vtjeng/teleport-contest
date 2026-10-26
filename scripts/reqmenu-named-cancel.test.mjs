// C refs: cmd.c do_reqmenu() and doextcmd() named-handler dispatch.
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

for (const name of ['named-cancel', 'key-control']) {
    test(`reqmenu C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/cmd.c/trial-reqmenu-${name}.session.json`,
            import.meta.url), 'utf8'));
        const segment = recording.segments[0];
        assert.equal(recording.segments.length, 1);
        assert.equal(segment.steps.length, name === 'named-cancel' ? 12 : 4);
        assert.equal(segment.steps.reduce((sum, step) => sum + step.rng.length, 0),
                     name === 'named-cancel' ? 2647 : 2545);
        assert.equal(segment.moves,
                     name === 'named-cancel' ? '.#reqmenu\n\u001b' : '.m\u001b');

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
