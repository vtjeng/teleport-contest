import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['ranger-pit', 'archeologist', 'light-control']) {
    test('automatic search ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/allmain.c/burdened-automatic-search-' + kind + '.session.json', import.meta.url)));
            const screens = recording.segments[0].steps.map(step => step.screen);
            if (kind === 'ranger-pit') {
                assert.ok(screens.some(screen => screen.includes('Burdened')));
                assert.ok(screens.some(screen => screen.includes('You find a pit.')));
            } else if (kind === 'archeologist') {
                assert.ok(screens.some(screen => screen.includes('Stressed')));
            } else {
                assert.ok(screens.every(screen => !screen.includes('Burdened')
                    && !screen.includes('Stressed')));
            }
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
