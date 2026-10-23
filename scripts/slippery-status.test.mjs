import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GLIB } from '../js/const.js';
import { statusConditionActive } from '../js/display.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// C youprop.h:112 defines Glib as intrinsic, without blocked/extrinsic terms.
test('slippery status follows intrinsic Glib through expiry', () => {
    const hero = { uprops: [] };
    assert.equal(statusConditionActive('slip', hero), false);
    hero.uprops[GLIB] = { intrinsic: 3, extrinsic: 0, blocked: 1 };
    assert.equal(statusConditionActive('slip', hero), true);
    hero.uprops[GLIB].intrinsic = 1;
    assert.equal(statusConditionActive('slip', hero), true);
    hero.uprops[GLIB].intrinsic = 0;
    hero.uprops[GLIB].extrinsic = 1;
    assert.equal(statusConditionActive('slip', hero), false);
});

for (const kind of ['slip', 'variant', 'disabled']) {
    test('slippery status ' + kind + ' matches public C boundaries', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/botl.c/slippery-status-' + kind + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
