import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { botl_vital } from '../js/display.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

test('C vital fields cap presentation while retaining raw comparison values', () => {
    const source = readFileSync(new URL('../nethack-c/upstream/src/botl.c', import.meta.url), 'utf8');
    for (const [field, raw] of [['BL_HP', 'i'], ['BL_HPMAX', 'i'],
        ['BL_ENE', 'u.uen'], ['BL_ENEMAX', 'u.uenmax']]) {
        assert.ok(source.includes(`[${field}].rawval.a_int = ${raw};`));
        assert.ok(source.includes(`[${field}].a.a_int = min(${raw}, 9999);`));
    }
    for (const [raw, value] of [[-1, -1], [0, 0], [42, 42], [9998, 9998],
        [9999, 9999], [10000, 9999], [10001, 9999], [20000, 9999]]) {
        assert.deepEqual(botl_vital(raw), { value, compareValue: raw });
    }
});

for (const name of ['hp-cap', 'hp-cap-three-lines', 'hp-below-cap',
    'energy-cap', 'energy-cap-three-lines', 'energy-below-cap']) {
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
