import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['healer', 'valkyrie', 'middle-control']) {
    test(`Wizard Tower departure ${kind} matches live C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/dog.c/tower-keepdogs-${kind}.session.json`, import.meta.url)));
            const steps = recording.segments[0].steps;
            assert.ok(steps.at(-1).screen.includes('Dlvl:1 '));
            if (kind === 'middle-control') {
                assert.ok(steps.some(step => step.screen.includes(
                    'No monsters currently migrating.')));
            } else {
                const position = kind === 'healer' ? '<41,12>' : '<41,10>';
                assert.ok(steps.some(step => step.screen.includes(
                    `Wizard of Yendor to 1:11 at ${position}`)),
                'C keeps the sleeping tower Wizard accessible at his original position');
            }
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
