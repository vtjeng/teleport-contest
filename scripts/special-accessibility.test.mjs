import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['away', 'subset', 'home-control']) {
    test(`off-level special-monster accessibility ${kind} matches C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/dog.c/special-accessibility-${kind}.session.json`, import.meta.url)));
            const listing = recording.segments[0].steps.find(step =>
                step.screen.includes('All migrating monsters:'))?.screen;
            if (kind === 'home-control') {
                assert.equal(listing, undefined);
            } else {
                assert.ok(listing, 'C exposes exact-coordinate accessible migrants');
                assert.equal((listing.match(/peaceful shopkeeper to 2:5 at/g) ?? []).length,
                    kind === 'away' ? 5 : 1);
                assert.equal(listing.includes('peaceful priest to 2:5 at'), kind === 'away');
            }
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
