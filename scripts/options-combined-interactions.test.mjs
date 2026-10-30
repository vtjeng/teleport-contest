// Public-input C recordings: live setters followed by separate option editors.
// The same game, menu parser and persistent option state are used throughout.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

const cases = [
    ['invert-versinfo', ['Set menuinvertmode to what? 2', "'versinfo' changed to 3."]],
    ['statuslines-conditions', ['Set statuslines to what? 3', 'Choose status conditions to toggle']],
    ['packorder-exceptions', ['Set packorder to what? ?!', 'What new autopickup exception pattern? >.*wand']],
    ['crash-message-rule', ['Set crash_name to what? Option Test', 'What new message pattern? foo']],
];
for (const [name, reached] of cases) {
    test(`combined live setter/editor C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/combined-${name}.session.json`, import.meta.url), 'utf8'));
        const screens = recording.segments[0].steps.map(({ screen }) => screen ?? '').join('\n');
        for (const text of reached) assert.ok(screens.includes(text), `C did not reach ${text}`);
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
