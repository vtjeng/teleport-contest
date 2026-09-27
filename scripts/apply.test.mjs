// apply.c beautiful(): charisma thresholds and polymorphed gender determine
// the same adjective returned to use_mirror() and do_mgivenname().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    A_CHA,
    FEMALE,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
} from '../js/const.js';
import { beautiful, touchstone_ok } from '../js/apply.js';
import { c_obj_colors } from '../js/do_name.js';
import { resetGame } from '../js/gstate.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';
import { M1_HUMANOID, NON_PM } from '../js/monsters.js';
import {
    COIN_CLASS,
    GEM_CLASS,
    RING_CLASS,
    objects_globals_init,
    RUBY,
} from '../js/objects.js';

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

test('touchstone_ok follows apply.c target ranks and identification flags', () => {
    const state = {};
    objects_globals_init(state);
    const ruby = { oclass: GEM_CLASS, otyp: RUBY, dknown: 1 };

    // apply.c:2658-2675. The callback is pure: NULL is excluded, coins and
    // unidentified gems are suggested, and ordinary identified objects are
    // accepted only as downplayed selections.
    assert.equal(touchstone_ok(null, state), GETOBJ_EXCLUDE);
    assert.equal(touchstone_ok({ oclass: COIN_CLASS }, state), GETOBJ_SUGGEST);
    assert.equal(touchstone_ok(ruby, state), GETOBJ_SUGGEST);

    state.objects[RUBY].oc_name_known = 1;
    assert.equal(touchstone_ok(ruby, state), GETOBJ_DOWNPLAY);
    ruby.dknown = 0;
    assert.equal(touchstone_ok(ruby, state), GETOBJ_SUGGEST);
    assert.equal(touchstone_ok({ oclass: RING_CLASS }, state), GETOBJ_DOWNPLAY);
});

test('c_obj_colors preserves decl.c streak names', () => {
    // decl.c:20-37. These exact names are also used by apply.c:use_stone().
    assert.deepEqual(c_obj_colors, [
        'black', 'red', 'green', 'brown', 'blue', 'magenta', 'cyan', 'gray',
        'transparent', 'orange', 'bright green', 'yellow', 'bright blue',
        'bright magenta', 'bright cyan', 'white',
    ]);
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

test('apply.c dorub reaches use_stone through the independent #rub recording',
    async () => {
        const recording = JSON.parse(readFileSync(
            new URL('../recordings/apply.c/touchstone-rub-independent.session.json',
                import.meta.url),
            'utf8',
        ));
        const js = await runJsSession(recording, process.cwd());
        const result = compareSessionOutputs(recording, js);
        assert.equal(result.passed, true, JSON.stringify(result));
    });
