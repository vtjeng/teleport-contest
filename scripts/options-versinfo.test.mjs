// C refs: options.c optfn_versinfo() and handler_versinfo().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const name of [
    'versinfo-handler-menu',
    'versinfo-handler-game',
    'versinfo-handler-cancel',
    'versinfo-startup-control',
]) {
    test(`versinfo C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/${name}.session.json`, import.meta.url), 'utf8'));
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
