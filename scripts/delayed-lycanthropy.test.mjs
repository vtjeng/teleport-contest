import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['natural', 'controlled-decline', 'unchanging-control']) {
    test('delayed lycanthropy ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/allmain.c/delayed-lycanthropy-' + kind + '.session.json', import.meta.url)));
            const screens = recording.segments[0].steps.map(step => step.screen);
            assert.ok(screens.some(screen => screen.includes('Burdened')));
            assert.equal(screens.some(screen => screen.includes('You turn into a wererat!')),
                kind === 'natural');
            assert.equal(screens.some(screen => screen.includes('Do you want to change into a rat?')),
                kind === 'controlled-decline');
            if (kind === 'unchanging-control')
                assert.ok(screens.some(screen => screen.includes('an octagonal amulet (being worn)')));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
