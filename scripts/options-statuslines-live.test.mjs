// C refs: options.c doset(), optfn_statuslines(), cfgfiles.c config_erradd().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const [name, message] of [
    ['valid-three', null],
    ['invalid-one', "'statuslines:1' is invalid; must be 2 or 3."],
    ['empty', "'statuslines:' is invalid; must be 2 or 3."],
    ['cancel', null],
    ['ordinary-control', null],
]) {
    test(`live statuslines C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/statuslines-live-${name}.session.json`,
            import.meta.url), 'utf8'));
        const screens = recording.segments[0].steps.map(({ screen }) => screen ?? '');
        if (message) assert.ok(screens.some((screen) => screen.startsWith(message)));
        if (name === 'empty') assert.ok(screens.some((screen) => screen.startsWith(
            "Missing parameter for 'statuslines:'.")));
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
