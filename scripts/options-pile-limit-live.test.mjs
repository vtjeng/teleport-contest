// C refs: options.c doset(), parseoptions(), and optfn_pile_limit().
// Each recording is a public-input replay of the live editor, not a direct
// call to the startup option parser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const [name, displayedValue] of [
    ['set-two', '2'],
    ['negative', '5'],
    ['empty', '5'],
    ['cancel', null],
    ['ordinary-control', null],
]) {
    test(`live pile_limit C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/pile-limit-live-${name}.session.json`,
            import.meta.url), 'utf8'));
        if (displayedValue !== null) {
            assert.match(recording.segments[0].steps.at(-1).screen,
                new RegExp(`pile_limit[^\\n]*\\[${displayedValue}\\]`));
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
