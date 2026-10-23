import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const name of ['normal', 'horizontal', 'before-control']) {
    test('mind blast target chain ' + name + ' matches independent public C recording', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/monmove.c/mind-blast-target-chain-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
