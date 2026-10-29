// C refs: options.c doset(), optfn_suppress_alert(), feature_alert_opts().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const [name, message] of [
    ['valid-current', 'Feature change alerts disabled for NetHack 5.0.0 features and prior.'],
    ['future', "You can't disable new feature alerts for future versions."],
    ['empty', null],
    ['cancel', null],
    ['ordinary-control', null],
]) {
    test(`live suppress_alert C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/suppress-alert-live-${name}.session.json`,
            import.meta.url), 'utf8'));
        const screens = recording.segments[0].steps.map(({ screen }) => screen ?? '');
        if (message) assert.ok(screens.some((screen) => screen.startsWith(message)));
        if (name === 'valid-current') assert.ok(screens.some((screen) =>
            /suppress_alert[^\n]*\[5\.0\.0\]/u.test(screen)));
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
