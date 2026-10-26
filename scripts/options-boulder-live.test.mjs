// C refs: options.c doset(), optfn_boulder(), cfgfiles.c config_erradd().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const [name, message] of [
    ['caret', null],
    ['warning-one', "Badoption - boulder symbol '1' would conflict with a warning symbol."],
    ['monster-O', "Badoption - boulder symbol 'O' would conflict with a monster symbol."],
    ['empty', "Missing parameter for 'boulder:'."],
    ['cancel', null],
    ['ordinary-control', null],
]) {
    test(`live boulder C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/boulder-live-${name}.session.json`,
            import.meta.url), 'utf8'));
        const screens = recording.segments[0].steps.map(({ screen }) => screen ?? '');
        if (name === 'caret') assert.ok(screens.some((screen) =>
            /boulder[^\n]*\[\^\]/u.test(screen)));
        if (message) assert.ok(screens.some((screen) => screen.startsWith(message)));
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
