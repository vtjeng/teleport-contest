import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['highlighted', 'unhighlighted', 'baby-control']) {
    test(`worm loss-of-tameness redraw ${kind} matches live C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/dog.c/worm-redraw-${kind}.session.json`, import.meta.url)));
            const steps = recording.segments[0].steps;
            assert.ok(steps.some(step => step.screen.includes('The neighborhood is friendlier.')));
            if (kind !== 'baby-control') {
                assert.equal(steps.filter(step => step.screen.startsWith(
                    "The long worm doesn't budge.")).length, 5,
                'five knock hits reach zero tameness in the C witness');
            }
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
