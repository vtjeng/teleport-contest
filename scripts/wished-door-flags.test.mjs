import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C objnam.c wizterrainwish updates rm.doormask, an alias of rm.flags.
// Leaving the doorway exposes stale flags in rendering and vision readers.
for (const kind of ['locked', 'closed', 'open', 'secret']) {
    test('wished ' + kind + ' door matches live C after leaving it', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/objnam.c/wished-door-flags-' + kind + '.session.json', import.meta.url)));
            const message = kind === 'secret' ? 'A locked secret door.'
                : kind === 'open' ? 'An open door.' : 'A ' + kind + ' door.';
            assert.ok(recording.segments[0].steps.some(step => step.screen.includes(message)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
