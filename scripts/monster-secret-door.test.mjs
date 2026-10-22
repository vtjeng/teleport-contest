import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C mon.c mfndpos admits a rock mole's ALLOW_DIG destination. postmov then
// calls dig.c mdig_tunnel, which converts SDOOR before breaking the door.
// The hero retreats into the corridor so the mole crosses the wished doorway.
for (const kind of ['locked', 'closed', 'ordinary-control']) {
    test('monster secret doorway ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/monmove.c/monster-secret-door-' + kind + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
            const {game} = await import(root + '/js/gstate.js');
            const {DOOR, D_BROKEN} = await import(root + '/js/const.js');
            assert.equal(game.level.at(23, 7).typ, DOOR);
            assert.equal(game.level.at(23, 7).doormask, D_BROKEN);
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
