import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['paralysis', 'life-saving', 'stormbringer', 'stormbringer-terse',
    'free-action-control', 'single-weapon-control']) {
    test('second strike interruption ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/uhitm.c/second-strike-' + kind + '.session.json', import.meta.url)));
            const screens = recording.segments[0].steps.map(step => step.screen);
            if (kind === 'paralysis' || kind === 'single-weapon-control') {
                assert.ok(screens.some(screen => screen.includes("You are frozen by the floating eye's gaze!")));
                assert.ok(screens.some(screen => screen.includes('You can move again.')));
            }
            if (kind === 'life-saving')
                assert.ok(screens.some(screen => screen.includes('The medallion crumbles to dust!')));
            if (kind.startsWith('stormbringer')) {
                assert.ok(screens.some(screen => screen.includes(kind === 'stormbringer'
                    ? 'You miss the stone golem.' : 'You miss it.')));
                assert.equal(screens.some(screen => screen.includes('Your bloodthirsty blade attacks!')),
                    kind === 'stormbringer');
            }
            if (kind === 'free-action-control')
                assert.ok(screens.some(screen => screen.includes('You hit the floating eye.  You miss the floating eye.')));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
