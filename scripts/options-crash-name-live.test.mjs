// C refs: options.c doset(), optfn_crash_name().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const [name, message] of [
    ['valid', '[Probe]'],
    ['empty', "Missing parameter for 'crash_name:'"],
    ['cancel', null],
    ['ordinary-control', null],
]) {
    test(`live crash_name C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/crash-name-live-${name}.session.json`,
            import.meta.url), 'utf8'));
        const screens = recording.segments[0].steps.map(({ screen }) => screen ?? '');
        if (message) assert.ok(screens.some((screen) => screen.includes(message)));
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
