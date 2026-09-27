// apply.c beautiful(): charisma thresholds and polymorphed gender determine
// the same adjective returned to use_mirror() and do_mgivenname().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { A_CHA, FEMALE } from '../js/const.js';
import { beautiful } from '../js/apply.js';
import { resetGame } from '../js/gstate.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';
import { M1_HUMANOID, NON_PM } from '../js/monsters.js';

function stateAtCharisma(charisma, female = false) {
    const state = resetGame();
    state.u = { acurr: { a: [10, 10, 10, 10, 10, charisma] } };
    state.youmonst = {
        data: { pmidx: NON_PM, mflags1: M1_HUMANOID, mflags2: 0 },
    };
    state.flags = { female };
    assert.equal(A_CHA, 5);
    return state;
}

test('beautiful() follows each apply.c charisma threshold', () => {
    const cases = [
        [3, 'hideous'],
        [4, 'ugly'],
        [6, 'homely'],
        [9, 'plain'],
        [11, 'cute'],
        [14, 'amiable'],
        [16, 'handsome'],
        [19, 'splendorous'],
        [25, 'sublime'],
    ];
    for (const [charisma, expected] of cases)
        assert.equal(beautiful(stateAtCharisma(charisma)), expected);
});

test('beautiful() uses poly_gender only in the two gendered ranges', () => {
    assert.equal(beautiful(stateAtCharisma(14, true)), 'winsome');
    assert.equal(beautiful(stateAtCharisma(16, true)), 'beautiful');
    assert.equal(beautiful(stateAtCharisma(19, true)), 'splendorous');
    assert.equal(FEMALE, 1);
});

test('apply.c use_mirror matches the admitted v8 monster-reflection case', async () => {
    const recording = JSON.parse(readFileSync(
        new URL('../challenges/cases/v8/mirror-monster-reflection.session.json', import.meta.url),
        'utf8',
    ));
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
