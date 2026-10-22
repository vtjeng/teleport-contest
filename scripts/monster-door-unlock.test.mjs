import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C mfndpos admits UNLOCKDOOR; postmov consumes the captured can_unlock.
for (const kind of ['rider', 'famine', 'closed']) {
    test('monster door unlocking ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/monmove.c/monster-door-unlock-' + kind + '.session.json', import.meta.url)));
            const message = kind === 'closed' ? 'opens a door.' : 'unlocks and opens a door.';
            assert.ok(recording.segments[0].steps.some(step => step.screen.includes(message)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
