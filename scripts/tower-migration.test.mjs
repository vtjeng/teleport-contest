import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['bottom', 'middle', 'ordinary-control']) {
    test(`Wizard Tower migration ${kind} matches live C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/dog.c/tower-migration-${kind}.session.json`, import.meta.url)));
            const steps = recording.segments[0].steps;
            const depth = { bottom: 38, middle: 37, 'ordinary-control': 1 }[kind];
            assert.ok(steps.at(-1).screen.includes(`Dlvl:${depth} `));
            assert.ok(steps.some(step => step.screen.includes(
                'How many random monsters to migrate to next level? [0] -1')));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
