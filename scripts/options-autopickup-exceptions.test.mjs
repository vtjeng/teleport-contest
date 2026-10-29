// C refs: options.c optfn_o_autopickup_exceptions() and handler_autopickup_exception().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const name of [
    'menu', 'add', 'list', 'remove', 'exit', 'control', 'cancel',
]) {
    test(`autopickup exceptions C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/autopickup-exceptions-handler-${name}.session.json`,
            import.meta.url), 'utf8'));
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
