import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['large', 'giant', 'small-control', 'engulfer']) {
    test(`holder migration ${kind} matches live C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/dog.c/holder-migration-${kind}.session.json`, import.meta.url)));
            const steps = recording.segments[0].steps;
            const releases = steps.flatMap(step => step.rng)
                .filter(call => call.includes('unstuck(mon.c:3465)'));
            if (kind === 'small-control') {
                assert.deepEqual(releases, []);
            } else {
                assert.ok(releases.length > 0, 'C reaches the source release cooldown');
            }
            if (kind === 'engulfer') {
                assert.ok(steps.some(step => step.screen.includes('The fog cloud engulfs you!')));
            } else {
                assert.ok(steps.some(step => step.screen.includes(
                    `is a ${kind === 'small-control' ? 'small' : kind} mimic!`)));
                assert.ok(steps.some(step => step.screen.includes(
                    '0 mons pending for current level, 1 for next level, 0 for others.')));
            }
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
