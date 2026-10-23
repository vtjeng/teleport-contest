import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { botl_gold } from '../js/display.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

test('C BL_GOLD caps presentation while preserving raw highlight comparisons', () => {
    const source = readFileSync(new URL('../nethack-c/upstream/src/botl.c', import.meta.url), 'utf8');
    assert.match(source, /rawval\.a_long = money;/u);
    assert.match(source, /a\.a_long = min\(money, 999999L\);/u);
    for (const [money, raw, value] of [
        [-1, 0, 0], [0, 0, 0], [42, 42, 42],
        [999998, 999998, 999998], [999999, 999999, 999999],
        [1000000, 1000000, 999999], [1000001, 1000001, 999999],
    ]) assert.deepEqual(botl_gold(money), { value, compareValue: raw });
});

for (const name of ['gold-cap-million', 'gold-cap-three-lines', 'gold-cap-boundary-control']) {
    test(name + ' matches independent public C recording', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/botl.c/' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
