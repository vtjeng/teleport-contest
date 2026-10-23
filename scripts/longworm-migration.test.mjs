import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['tail', 'variation', 'baby-control']) {
    test(`long-worm migration and arrival ${kind} match live C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/dog.c/longworm-migration-${kind}.session.json`, import.meta.url)));
            const steps = recording.segments[0].steps;
            assert.ok(steps.some(step => step.screen.includes(
                '0 mons pending for current level, 1 for next level, 0 for others.')));
            assert.ok(steps.at(-1).screen.includes('Dlvl:2'));
            const tailRolls = steps.flatMap(step => step.rng)
                .filter(call => call.includes('makemon.c:1406'));
            assert.deepEqual(tailRolls, kind === 'baby-control' ? []
                : [`rn2(5)=${kind === 'tail' ? 1 : 4} @ makemon(makemon.c:1406)`]);
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
