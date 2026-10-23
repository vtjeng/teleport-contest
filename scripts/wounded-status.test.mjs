import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WOUNDED_LEGS } from '../js/const.js';
import { statusConditionActive } from '../js/display.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// C youprop.h:138 reads both intrinsic timeout and extrinsic leg-side bits.
test('wounded-leg status follows timeout and side bits through healing', () => {
    const hero = { uprops: [] };
    assert.equal(statusConditionActive('woundedlegs', hero), false);
    hero.uprops[WOUNDED_LEGS] = { intrinsic: 10, extrinsic: 0, blocked: 1 };
    assert.equal(statusConditionActive('woundedlegs', hero), true);
    hero.uprops[WOUNDED_LEGS].intrinsic = 0;
    hero.uprops[WOUNDED_LEGS].extrinsic = 1;
    assert.equal(statusConditionActive('woundedlegs', hero), true);
    hero.usteed = {};
    assert.equal(statusConditionActive('woundedlegs', hero), true);
    hero.uprops[WOUNDED_LEGS].extrinsic = 0;
    assert.equal(statusConditionActive('woundedlegs', hero), false);
});

for (const kind of ['bear', 'variant', 'disabled']) {
    test('wounded-leg status ' + kind + ' matches public C boundaries', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/botl.c/wounded-status-' + kind + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
