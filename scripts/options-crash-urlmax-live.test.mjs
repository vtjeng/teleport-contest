// C refs: options.c doset(), optfn_crash_urlmax().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const [name, message] of [
    ['valid-75', '[75]'],
    ['invalid-74', 'Invalid value 74 for crash_urlmax.  Minimum value is 75.'],
    ['empty', "Missing parameter for 'crash_urlmax:'"],
    ['cancel', null],
    ['ordinary-control', null],
]) {
    test(`live crash_urlmax C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/crash-urlmax-live-${name}.session.json`,
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
