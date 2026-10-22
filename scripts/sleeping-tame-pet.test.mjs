import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

// C monmove.c dochug calls disturb before pet movement: dogs wake without
// the one-in-seven draw, Stealth prevents waking, and other pets roll normally.
for (const kind of ['kitten', 'dog', 'newt', 'stealth', 'awake-control']) {
    test('sleeping tame pet ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/monmove.c/sleeping-tame-pet-' + kind + '.session.json', import.meta.url)));
            const woke = recording.segments[0].steps.some(step => step.screen.includes('wakes up.'));
            assert.equal(woke, kind === 'dog' || kind === 'newt');
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
            const {game} = await import(root + '/js/gstate.js');
            const pets = [];
            for (let mon = game.level.monlist; mon; mon = mon.nmon)
                if (mon.mtame) pets.push(mon);
            assert.equal(pets.length, 1);
            assert.equal(Boolean(pets[0].msleeping), kind === 'kitten' || kind === 'stealth');
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
