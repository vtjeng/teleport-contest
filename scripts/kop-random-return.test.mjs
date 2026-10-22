import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C mon.c mondead() case 2 constructs a replacement Kop at random
// coordinates. This public-input witness reaches it through a watchman's
// projectile, preserving the complete creation and monster-turn sequence.
test('a dead Kop can return at random coordinates like live C', async () => {
    const root = createScoringWorkspace(process.cwd(), []);
    try {
        const recording = JSON.parse(readFileSync(new URL(
            '../recordings/mon.c/kop-random-return.session.json', import.meta.url)));
        assert.ok(recording.segments[0].steps.some(step =>
            step.screen.includes('The Keystone Kop is killed!')));
        const result = compareSessionOutputs(recording, await runJsSession(recording, root));
        assert.equal(result.passed, true, formatReport(result));
        const {game} = await import(root + '/js/gstate.js');
        const {PM_KEYSTONE_KOP} = await import(root + '/js/monsters.js');
        assert.equal(game.svm.mvitals[PM_KEYSTONE_KOP].died, 1);
    } finally {
        removeScoringWorkspace(root);
    }
});
