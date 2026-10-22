import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C monmove.c postmov() skips opening for can_tunnel, then delegates to
// dig.c mdig_tunnel(). A natural Minetown dwarf reaches that closed door
// while the hero dresses. Replay the complete public-input C witness.
test('monster movement admits closed-door tunneling and matches live C', async () => {
    const root = createScoringWorkspace(process.cwd(), []);
    try {
        const recording = JSON.parse(readFileSync(new URL(
            '../recordings/monmove.c/monster-door-tunneling.session.json', import.meta.url)));
        const result = compareSessionOutputs(recording, await runJsSession(recording, root));
        assert.equal(result.passed, true, formatReport(result));
        const {game} = await import(root + '/js/gstate.js');
        const {D_BROKEN} = await import(root + '/js/const.js');
        assert.equal(game.level.at(52, 6).doormask, D_BROKEN);
    } finally {
        removeScoringWorkspace(root);
    }
});
