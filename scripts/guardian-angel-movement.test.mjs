import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C gain_guardian_angel creates a tame minion without edog only after pet
// conduct has been broken. dog_move handles that guardian separately from
// ordinary feeding/fetching pets; petless conduct keeps the Angel untamed.
for (const kind of ['dog', 'cat', 'petless-control']) {
    test('guardian Angel movement ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/monmove.c/guardian-angel-movement-' + kind + '.session.json', import.meta.url)));
            assert.ok(recording.segments[0].steps.some(step => step.screen.includes('An angel appears near you.')));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
            const {game} = await import(root + '/js/gstate.js');
            const {PM_ANGEL} = await import(root + '/js/monsters.js');
            const guardians = [];
            for (let mon = game.level.monlist; mon; mon = mon.nmon)
                if (mon.mtame && mon.isminion && mon.data.pmidx === PM_ANGEL) guardians.push(mon);
            assert.equal(guardians.length, kind === 'petless-control' ? 0 : 1);
            for (const guardian of guardians) assert.equal(Boolean(guardian.mextra?.edog), false);
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
