import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C mon.c mfndpos permits ALLOW_DIG on SCORR; monmove.c postmov calls
// dig.c mdig_tunnel, exposing the corridor and printing a draft unconditionally.
for (const kind of ['normal', 'quiet', 'ordinary-control']) {
    test('monster secret corridor ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/monmove.c/monster-secret-corridor-' + kind + '.session.json', import.meta.url)));
            const draft = recording.segments[0].steps.some(step => step.screen.includes('You feel a draft.'));
            assert.equal(draft, kind !== 'ordinary-control');
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
            const {game} = await import(root + '/js/gstate.js');
            const {CORR} = await import(root + '/js/const.js');
            assert.equal(game.level.at(22, 7).typ, CORR);
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
