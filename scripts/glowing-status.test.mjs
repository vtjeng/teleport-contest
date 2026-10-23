import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { statusConditionActive } from '../js/display.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// C botl.c:1195 reads umconf; read.c adds charges, uhitm.c consumes them.
test('glowing hands condition follows remaining confusion charges', () => {
    const hero = { umconf: 0 };
    assert.equal(statusConditionActive('glowhands', hero), false);
    hero.umconf = 5;
    assert.equal(statusConditionActive('glowhands', hero), true);
    hero.umconf = 1;
    assert.equal(statusConditionActive('glowhands', hero), true);
    hero.umconf = 0;
    assert.equal(statusConditionActive('glowhands', hero), false);
});

for (const kind of ['glow', 'blessed', 'disabled', 'cursed']) {
    test('glowing hands status ' + kind + ' matches public C boundaries', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/botl.c/glowing-status-' + kind + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
