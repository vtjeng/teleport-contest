import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C dochug lets disturb decide whether a sleeping bee wakes, then tests for
// royal jelly before ordinary movement/attacks. Stealth skips the wakeup roll.
for (const kind of ['visible', 'stealth', 'awake-control']) {
    test('sleeping killer bee ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/monmove.c/sleeping-killer-bee-' + kind + '.session.json', import.meta.url)));
            const woke = recording.segments[0].steps.some(step => step.screen.includes('The killer bee wakes up!'));
            assert.equal(woke, kind === 'visible');
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
            const {game} = await import(root + '/js/gstate.js');
            const {PM_KILLER_BEE} = await import(root + '/js/monsters.js');
            const bees = [];
            for (let mon = game.level.monlist; mon; mon = mon.nmon)
                if (mon.data.pmidx === PM_KILLER_BEE) bees.push(mon);
            assert.equal(bees.length, 1);
            assert.equal(Boolean(bees[0].msleeping), kind === 'stealth');
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
