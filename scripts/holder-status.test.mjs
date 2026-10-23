import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { statusConditionActive } from '../js/display.js';
import { resetGame } from '../js/gstate.js';
import {
    monst_globals_init, PM_BARBED_DEVIL, PM_HUMAN, PM_KRAKEN, PM_PYTHON,
} from '../js/monsters.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// C botl.c:1164-1188: swallowed, sticky hero, and ordinary holder are
// mutually exclusive. Only the last branch consults enabled Grab for Held.
test('holder conditions preserve source precedence and configured fallback', () => {
    const state = resetGame();
    monst_globals_init(state);
    state.iflags = { status_conditions: {} };
    state.youmonst = { data: state.mons[PM_HUMAN] };
    state.u = { umonnum: PM_HUMAN, umonster: PM_HUMAN, ustuck: null, uswallow: 0 };
    const active = () => ['grab', 'held', 'holding']
        .filter(option => statusConditionActive(option, state.u));
    assert.deepEqual(active(), []);
    state.u.ustuck = { data: state.mons[PM_KRAKEN] };
    assert.deepEqual(active(), ['grab']);
    state.iflags.status_conditions.grab = false;
    assert.deepEqual(active(), ['held']);
    state.iflags.status_conditions.grab = true;
    state.u.ustuck.data = state.mons[PM_PYTHON];
    assert.deepEqual(active(), ['held']);
    state.u.umonnum = PM_BARBED_DEVIL;
    state.youmonst.data = state.mons[PM_BARBED_DEVIL];
    assert.deepEqual(active(), ['holding']);
    state.u.uswallow = 1;
    assert.deepEqual(active(), ['held'], 'swallowing precedes sticky form');
    state.u.uswallow = 0;
    state.u.umonnum = PM_HUMAN;
    assert.deepEqual(active(), ['held'], 'holding requires actual polymorph');
    state.u.ustuck = null;
    assert.deepEqual(active(), [], 'release clears the whole family');
});

for (const kind of ['grab', 'held', 'grab-disabled', 'holding', 'holding-disabled']) {
    test('holder status ' + kind + ' matches public C output', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/botl.c/holder-status-' + kind + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
