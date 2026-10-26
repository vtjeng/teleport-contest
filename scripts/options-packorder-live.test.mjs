// C refs: options.c doset(), optfn_packorder(), change_inv_order(), and
// cfgfiles.c config_erradd(). These are live public-input editor replays.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const [name, expected] of [
    ['valid', '?$"'],
    ['invalid', "Not an object class 'x'."],
    ['duplicate', "Duplicate object class '?'."],
    ['empty', '$"'],
    ['cancel', null],
    ['ordinary-control', null],
]) {
    test(`live packorder C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/packorder-live-${name}.session.json`,
            import.meta.url), 'utf8'));
        const screens = recording.segments[0].steps.map(({ screen }) => screen ?? '');
        if (name === 'valid' || name === 'empty') {
            assert.match(screens.at(-1),
                new RegExp(`packorder[^\\n]*\\[${expected.replace(/[$]/gu, '\\$')}.*\\]`));
        } else if (expected !== null) {
            assert.ok(screens.some((screen) => screen.startsWith(expected)));
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
