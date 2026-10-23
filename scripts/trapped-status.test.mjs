import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resetGame } from '../js/gstate.js';
import { TT_LAVA, TT_BURIEDBALL, TT_PIT } from '../js/const.js';
import { statusConditionActive } from '../js/display.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// C botl.c:1154-1163 clears stale trap types and selects enabled specifics.
test('trapped conditions select lava, tethered, and generic fallback', () => {
    const state = resetGame();
    state.iflags = { status_conditions: {} };
    state.u = { utrap: 0, utraptype: TT_LAVA };
    const active = () => ['lava', 'tethered', 'trap']
        .filter(option => statusConditionActive(option, state.u));
    assert.deepEqual(active(), []);
    state.u.utrap = 1;
    assert.deepEqual(active(), ['lava']);
    state.iflags.status_conditions.lava = false;
    assert.deepEqual(active(), ['trap']);
    state.u.utraptype = TT_BURIEDBALL;
    assert.deepEqual(active(), ['trap']);
    state.iflags.status_conditions.tethered = true;
    assert.deepEqual(active(), ['tethered']);
    state.u.utraptype = TT_PIT;
    assert.deepEqual(active(), ['trap']);
    state.u.utrap = 0;
    assert.deepEqual(active(), []);
});

for (const kind of ['tether', 'tether-fallback', 'tether-disabled', 'pit', 'lava-fallback', 'lava-control']) {
    test('trapped status ' + kind + ' matches public C boundaries', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/botl.c/trapped-status-' + kind + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
