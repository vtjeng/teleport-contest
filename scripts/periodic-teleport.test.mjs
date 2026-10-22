import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['same-square', 'relocate', 'cancel', 'nonzero-control']) {
    test('periodic teleport ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/allmain.c/periodic-teleport-' + kind + '.session.json', import.meta.url)));
            const screens = recording.segments[0].steps.map(step => step.screen);
            assert.equal(screens.some(screen => screen.includes('Where do you want to be teleported?')),
                kind !== 'nonzero-control');
            assert.equal(screens.some(screen => screen.includes('You materialize in the same location!')),
                kind === 'same-square');
            assert.equal(screens.some(screen => screen.includes('You materialize in a different location!')),
                kind === 'relocate');
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
