import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C mon.c admits giants through BUSTDOOR; monmove.c postmov smashes the door.
for (const kind of ['hill', 'stone', 'closed-control']) {
    test('giant doorway ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/monmove.c/giant-locked-door-' + kind + '.session.json', import.meta.url)));
            const message = kind === 'closed-control' ? 'opens a door.' : 'smashes down a door.';
            assert.ok(recording.segments[0].steps.some(step => step.screen.includes(message)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
