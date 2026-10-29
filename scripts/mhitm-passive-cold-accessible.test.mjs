import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodeScreen } from '../frozen/screen-decode.mjs';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// PR #65: native passive-cold combat, with accessiblemsg on and off. C's
// pline_mon includes the attacker location only in the first recording.
for (const which of ['target', 'control']) {
    test(`passive cold ${which} matches the recorded C output`, async () => {
        const c = JSON.parse(readFileSync(new URL(
            `./fixtures/passive-cold-accessible/${which}.session.json`,
            import.meta.url,
        )));
        const row = decodeScreen(c.segments[0].steps[66].screen)[0]
            .map(cell => cell.ch).join('').trim();
        assert.equal(row, `${which === 'target' ? '(west): ' : ''}`
            + 'The red dragon is suddenly very cold!--More--');
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, JSON.stringify(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
