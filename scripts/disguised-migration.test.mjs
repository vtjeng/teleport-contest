import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['small', 'large', 'ordinary']) {
    test(`existing-monster migration ${kind} matches live C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/dog.c/disguised-migration-${kind}.session.json`, import.meta.url)));
            const screens = recording.segments[0].steps.map(step => step.screen);
            assert.ok(screens.some(screen => screen.includes(
                '0 mons pending for current level, 1 for next level, 0 for others.')));
            const appearance = { small: 'A gold ring', large: 'A staircase down',
                ordinary: 'A kitten' }[kind];
            assert.ok(screens.some(screen => screen.includes(`${appearance} appears next to you.`)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
