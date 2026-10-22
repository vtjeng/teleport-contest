import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C teleport.c level_tele() uses You("%s.", escape_by_flying) for both
// surviving a fall and floating back down. Compare text and cursor boundaries
// against independent C recordings, including the preceding Cloud 9 dialogue.
for (const [name, message] of [
    ['fall', 'You find yourself back on the surface.'],
    ['levitate', 'You float gently down to earth.'],
]) {
    test('level-teleport ' + name + ' escape message matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/teleport.c/level-teleport-escape-' + name + '.session.json', import.meta.url)));
            assert.ok(recording.segments[0].steps.some(step => step.screen.includes(message)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
