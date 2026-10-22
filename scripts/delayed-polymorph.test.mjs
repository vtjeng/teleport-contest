import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['system-shock-and-form', 'unchanging-control']) {
    test('delayed polymorph ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/allmain.c/delayed-polymorph-' + kind + '.session.json', import.meta.url)));
            const screens = recording.segments[0].steps.map(step => step.screen);
            assert.ok(screens.some(screen => screen.includes('Burdened')));
            if (kind === 'system-shock-and-form') {
                assert.ok(screens.some(screen => screen.includes('You shudder for a moment.')));
                assert.ok(screens.some(screen => screen.includes("OK, so you don't die.")));
                assert.ok(screens.some(screen => screen.includes('You turn into a gnome mummy!')));
                assert.ok(screens.some(screen => screen.includes('You shrink out of your cloak!')));
            } else {
                assert.ok(screens.some(screen => screen.includes('an octagonal amulet (being worn)')));
                assert.ok(screens.every(screen => !screen.includes('You shudder for a moment.')
                    && !screen.includes('You turn into')));
            }
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
