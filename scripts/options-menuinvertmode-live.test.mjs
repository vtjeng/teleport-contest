// C refs: options.c doset(), optfn_menuinvertmode() and cfgfiles.c config_erradd().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const name of ['valid-two', 'invalid-three', 'empty', 'cancel', 'ordinary-control']) {
    test(`live menuinvertmode C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/menuinvertmode-live-${name}.session.json`,
            import.meta.url), 'utf8'));
        const screens = recording.segments[0].steps.map(({ screen }) => screen ?? '');
        if (name === 'valid-two') {
            assert.ok(screens.at(-1).includes('menuinvertmode'));
            assert.match(screens.at(-1), /menuinvertmode[^\n]*\[2\]/u);
        } else if (name === 'invalid-three') {
            assert.ok(screens.some((screen) => screen.startsWith(
                "Illegal menuinvertmode parameter '3'.")));
            assert.match(screens.at(-1), /menuinvertmode[^\n]*\[1\]/u);
        }
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
