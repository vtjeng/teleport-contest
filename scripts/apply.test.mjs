// apply.c beautiful(): charisma thresholds and polymorphed gender determine
// the same adjective returned to use_mirror() and do_mgivenname().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    A_CHA,
    BLINDED,
    ECMD_TIME,
    FEMALE,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    GLIB,
    TIMEOUT,
} from '../js/const.js';
import { beautiful, touchstone_ok, use_towel } from '../js/apply.js';
import { c_obj_colors } from '../js/do_name.js';
import { game, resetGame } from '../js/gstate.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';
import { M1_HUMANOID, NON_PM } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import {
    COIN_CLASS,
    GEM_CLASS,
    RING_CLASS,
    TOWEL,
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

test('apply.c use_towel matches the selected v8 caller replay', async () => {
    const recording = JSON.parse(readFileSync(
        new URL('../challenges/cases/v8/towel-clean-face.session.json',
            import.meta.url),
        'utf8',
    ));
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('apply.c use_towel preserves cursed glib RNG and timeout order', async () => {
    await runSegment({
        seed: 83015137,
        datetime: '20310304123456',
        nethackrc: 'OPTIONS=name:B30Towel,role=Wizard,race=human,gender=female,align=neutral,playmode=debug,!legacy,!tutorial,!splash_screen,showexp,time,pettype:none\n',
        moves: '',
    });
    const towel = { otyp: TOWEL, cursed: 1, spe: 0 };
    const calls = [];
    const messages = [];
    game.unported = new Set();
    const result = await use_towel(towel, game, {
        message: async (text) => { messages.push(text); },
        random: {
            rn2(bound) {
                calls.push(`rn2(${bound})`);
                return bound === 3 ? 2 : 5;
            },
            rn1(bound, base) {
                calls.push(`rn1(${bound},${base})`);
                return base + 5;
            },
        },
    });
    assert.deepEqual(calls, ['rn2(3)', 'rn1(10,3)']);
    assert.deepEqual(messages, ['Your hands get slimy!']);
    assert.equal(game.u.uprops[GLIB].intrinsic & TIMEOUT, 8);
    assert.equal(result, ECMD_TIME);
    assert.equal(game.unported.has('apply.c dry_a_towel'), false);
});

test('apply.c use_towel clears cream before its engulfing-blindness check',
    async () => {
    await runSegment({
        seed: 83015144,
        datetime: '20310506120000',
        nethackrc: 'OPTIONS=name:B30Cream,role=Rogue,race=human,gender=female,align=chaotic,playmode=debug,!legacy,!tutorial,!splash_screen,pettype:none\n',
        moves: '',
    });
    const messages = [];
    game.unported = new Set();
    game.u.ucreamed = 3;
    game.u.uprops[BLINDED].intrinsic = 3;
    game.u.uswallow = false;

    const result = await use_towel({
        otyp: TOWEL,
        cursed: 0,
        spe: 0,
    }, game, {
        message: async (text) => { messages.push(text); },
    });

    assert.equal(game.u.ucreamed, 0);
    assert.equal(game.u.uprops[BLINDED].intrinsic & TIMEOUT, 0);
    assert.deepEqual(messages, [
        "You've got the glop off.",
        'You can see again.',
    ]);
    assert.equal(game.unported.has('mhitu.c gulpmu'), false);
    assert.equal(result, ECMD_TIME);
});
