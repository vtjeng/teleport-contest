import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {GameMap} from '../js/game.js';
import {COULD_SEE, IN_SIGHT} from '../js/const.js';
import {makeVisionBuffers, vision_reset, cansee, couldsee} from '../js/vision.js';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

test('level reset removes sight from both buffers before deferred recalculation', () => {
    const source = readFileSync('nethack-c/upstream/src/vision.c', 'utf8');
    const body = source.slice(source.indexOf('\nvision_reset(void)'));
    assert.match(body, /gv\.viz_array = cs_rows0;/);
    assert.match(body, /memset\(\(genericptr_t\) could_see, 0, sizeof\(could_see\)\)/);
    const buffers = makeVisionBuffers();
    buffers.rows[0][5][10] = COULD_SEE | IN_SIGHT;
    buffers.rows[1][5][10] = COULD_SEE | IN_SIGHT;
    const state = {level: new GameMap(), _visionBuffers: buffers,
        active_buf: 1, viz_array: buffers.rows[1]};
    assert.equal(cansee(10, 5, state), true);
    vision_reset(state);
    assert.equal(cansee(10, 5, state), false);
    assert.equal(couldsee(10, 5, state), false);
    assert.equal(state.viz_array, buffers.rows[0]);
    assert.equal(buffers.rows[1][5][10], 0);
    assert.equal(state.vision_full_recalc, 1);
});

for (const kind of ['knox', 'hidden', 'control']) {
    test(`level reset ${kind} matches recorded C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/vision.c/level-reset-${kind}.session.json`, import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
