import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { A_LAWFUL, HALLUC, HALLUC_RES } from '../js/const.js';
import { game } from '../js/gstate.js';
import { halu_gname } from '../js/pray.js';
import { enableRngLog, getRngLog, initRng, rn2_on_display_rng } from '../js/rng.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// Native ISAAC display seeds cover C's three pantheon arms, novelty table,
// Moloch, and repeated rejection of Priest's absent pantheon. The expected
// next draw pins consumption as well as the chosen name.
for (const [seed, expected, nextDraw] of [
    [1, 'Susanowo', 860], [2, 'Yawgmoth', 971],
    [3, 'Shan Lai Ching', 776], [6, 'Venus', 329],
    [9, 'Moloch', 189], [15, 'Hermes', 764],
]) {
    test('hallucinated deity uses the owned display stream, seed ' + seed, () => {
        initRng(seed);
        enableRngLog();
        const liveDisplay = structuredClone(game.displayCtx);
        const state = { u: { uprops: { [HALLUC]: { intrinsic: 8 } } },
            displayCtx: structuredClone(game.displayCtx) };
        assert.equal(halu_gname(A_LAWFUL, state), expected);
        assert.equal(rn2_on_display_rng(1000, state), nextDraw);
        assert.deepEqual(getRngLog(), []);
        assert.deepEqual(game.displayCtx, liveDisplay);
    });
}

for (const resistance of [null, { intrinsic: 1 }, { extrinsic: 1 }]) {
    test('ordinary or resisted deity naming spends no display draw: ' + JSON.stringify(resistance), () => {
        const state = { u: { uprops: { [HALLUC]: { intrinsic: resistance ? 8 : 0 },
            [HALLUC_RES]: resistance ?? {} } }, urole: { lgod: '_Athena' },
            get displayCtx() { assert.fail('ordinary name requested display RNG'); } };
        assert.equal(halu_gname(A_LAWFUL, state), 'Athena');
    });
}

for (const name of ['god', 'monochrome', 'ordinary-control']) {
    test('hallucinated deity ' + name + ' matches independent public C recording', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(readFileSync(new URL(
                '../recordings/pray.c/hallucinated-deity-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
