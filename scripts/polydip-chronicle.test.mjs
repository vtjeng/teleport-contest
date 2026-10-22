import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['female', 'male', 'unpolymorphable']) {
    test('potion polymorph Chronicle ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/potion.c/polydip-chronicle-' + kind + '.session.json', import.meta.url)));
            const screens = recording.segments[0].steps.map(step => step.screen);
            assert.ok(screens.some(screen => screen.includes('Logged events:')));
            const phrase = `polymorphed ${kind === 'female' ? 'her' : 'his'} first item`;
            assert.equal(Math.max(...screens.map(screen => screen.split(phrase).length - 1)),
                kind === 'unpolymorphable' ? 0 : 1);
            if (kind === 'female') {
                assert.ok(screens.some(screen => screen.includes('a - an axe (weapon in right hand).')));
                assert.ok(screens.some(screen => screen.includes('a - a long sword (weapon in right hand).')));
            }
            if (kind === 'unpolymorphable')
                assert.ok(screens.some(screen => screen.includes('Nothing happens.')));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
