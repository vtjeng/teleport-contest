// C ref: options.c handler_whatis_coord().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const name of [
    'whatis-coord-handler-menu',
    'whatis-coord-handler-map',
    'whatis-coord-handler-cancel',
    'whatis-coord-handler-nonverbose',
    'whatis-coord-startup-control',
]) {
    test(`whatis_coord C replay: ${name}`, async () => {
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
