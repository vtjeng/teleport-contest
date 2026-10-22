import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C mfndpos admits amorphous passage; postmov preserves the closed door.
for (const kind of ['locked', 'closed', 'open-control']) {
    test('amorphous doorway ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/monmove.c/amorphous-door-passage-' + kind + '.session.json', import.meta.url)));
            assert.ok(recording.segments[0].steps.some(step => step.screen.includes('A fog cloud appears next to you.')));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
