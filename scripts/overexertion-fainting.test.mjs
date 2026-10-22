import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['movement', 'combat', 'healthy-control']) {
    test('overexertion fainting ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/hack.c/overexertion-fainting-' + kind + '.session.json', import.meta.url)));
            const screens = recording.segments[0].steps.map(step => step.screen);
            const faints = kind !== 'healthy-control';
            assert.ok(screens.some(screen => screen.includes('Strained')));
            assert.equal(screens.some(screen => screen.includes('You pass out from exertion!')), faints);
            assert.equal(screens.some(screen => screen.includes('You can move again.')), faints);
            if (!faints) assert.ok(screens.some(screen => screen.includes('HP:2(3)')));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
