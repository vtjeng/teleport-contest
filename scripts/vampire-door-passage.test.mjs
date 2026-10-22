import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C mfndpos admits can_fog; postmov changes form before doorway passage.
for (const kind of ['vampire', 'closed', 'lord', 'open']) {
    test('vampire doorway ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/monmove.c/vampire-door-passage-' + kind + '.session.json', import.meta.url)));
            // C's newly created vampire is initially in bat form; its cham
            // identity still permits the later door-triggered fog change.
            assert.ok(recording.segments[0].steps.some(step => step.screen.includes('A vampire bat appears next to you.')));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
