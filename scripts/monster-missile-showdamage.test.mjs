import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C mthrowu.c thitu routes missile damage through hack.c losehp/showdamage.
// Full replays also catch an HP message leaking from the planning clone.
for (const kind of ['hit', 'terse', 'off-control']) {
    test('monster missile showdamage ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/mthrowu.c/monster-missile-showdamage-' + kind + '.session.json', import.meta.url)));
            const screens = recording.segments[0].steps.map(step => step.screen);
            assert.ok(screens.some(screen => screen.includes('The goblin throws an orcish dagger!')));
            assert.ok(screens.some(screen => screen.includes(kind === 'terse'
                ? 'You are hit.' : 'You are hit by an orcish dagger.')));
            assert.equal(screens.some(screen => screen.includes('[HP -3, 13 left]')),
                kind !== 'off-control');
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
