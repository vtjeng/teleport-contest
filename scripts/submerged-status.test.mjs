import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { statusConditionActive } from '../js/display.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// C botl.c:1203 and youprop.h:279 read the hero's underwater state,
// independently of the terrain or whether the optional status is enabled.
test('submerged condition follows Underwater on entry and exit', () => {
    const hero = { uinwater: 0 };
    assert.equal(statusConditionActive('submerged', hero), false);
    hero.uinwater = 1;
    assert.equal(statusConditionActive('submerged', hero), true);
    hero.uinwater = 0;
    assert.equal(statusConditionActive('submerged', hero), false);
});

for (const kind of ['pool', 'variant', 'disabled', 'exit']) {
    test('submerged status ' + kind + ' matches public C boundaries', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/botl.c/submerged-status-' + kind + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
