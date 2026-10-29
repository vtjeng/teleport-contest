// C refs: cmd.c handler_rebind_keys_add(), cmdbind_add(), bind_key().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const [name, expected] of [
    ['bind-existing-key-live', 'What do you want to use or apply?'],
    ['bind-new-key-live', 'Bound key'],
    ['unbind-key-live', 'Changed key'],
    ['bind-key-menu-cancel', 'Do what?'],
]) {
    test(`live key-binding C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/cmd.c/${name}.session.json`, import.meta.url), 'utf8'));
        assert.ok(recording.segments[0].steps.some(({ screen }) =>
            screen?.includes(expected)), `${name} must reach its C witness`);
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
