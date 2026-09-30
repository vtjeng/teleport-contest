import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { POT_OIL } from '../js/objects.js';
import { resetGame } from '../js/gstate.js';
import { light_cocktail } from '../js/apply.js';

const APPLY_C = readFileSync(
    new URL('../nethack-c/upstream/src/apply.c', import.meta.url), 'utf8',
);
const APPLY_JS = readFileSync(new URL('../js/apply.js', import.meta.url), 'utf8');

function cFunction(source, signature) {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `${signature} is present in apply.c`);
    const end = source.indexOf('\n}\n', start) + 2;
    assert.ok(end > start, `${signature} has a complete definition`);
    return source.slice(start, end);
}

test('light_cocktail retains the complete C branch and helper order', () => {
    const source = cFunction(APPLY_C, 'light_cocktail(struct obj **optr)\n{');
    // These source expressions cover the whole helper's branch order, pointer
    // writes, and the placement of begin_burn after optional shop billing.
    const calls = [
        'if (u.uswallow)',
        'if (obj->lamplit)',
        'end_burn(obj, TRUE)',
        'freeinv(obj)',
        '*optr = addinv(obj)',
        '} else if (Underwater)',
        'split1off = (obj->quan > 1L);',
        'obj = splitobj(obj, 1L);',
        'You("light %spotion.%s"',
        'check_unpaid(obj)',
        'bill_dummy_object(obj)',
        'makeknown(obj->otyp)',
        'begin_burn(obj, FALSE)',
        'obj_extract_self(obj)',
        'obj->nomerge = 1;',
        'obj = hold_another_object(obj,',
        '*optr = obj;',
    ];
    let previous = -1;
    for (const call of calls) {
        const index = source.indexOf(call);
        assert.ok(index > previous, `${call} follows the previous C operation`);
        previous = index;
    }

    const jsHelper = cFunction(
        APPLY_JS,
        'export async function light_cocktail(objp, state = game, env = {}) {',
    );
    // The JS implementation keeps the C branch and pointer order while
    // awaiting output and lifecycle helpers that can suspend in this port.
    const jsCalls = [
        'if (state.u?.uswallow)',
        'if (obj.lamplit)',
        'end_burn(obj, true',
        'if (!obj.owornmask)',
        'freeinv(obj',
        'objp.obj = await addinv_runtime(obj',
        'if (state.u?.uinwater)',
        'const split1off = obj.quan > 1;',
        'obj = splitobj(obj, 1',
        'const ownership = shk_your(obj, state);',
        'You light ${ownership}potion.',
        'if (obj.unpaid && costly_spot',
        'check_unpaid(obj, state)',
        'set_voice(shopkeeper',
        'await verbalize(',
        'await bill_dummy_object(obj',
        'discover_object(obj.otyp, true, true, true',
        'begin_burn(obj, false',
        'obj_extract_self(obj',
        'obj.nomerge = 1;',
        'await hold_another_object(',
        'if (obj) obj.nomerge = 0;',
        'objp.obj = obj;',
    ];
    previous = -1;
    for (const call of jsCalls) {
        const index = jsHelper.indexOf(call);
        assert.ok(index > previous, `${call} follows the previous JS operation`);
        previous = index;
    }

    const cDoapply = cFunction(APPLY_C, 'doapply(void)\n{');
    assert.match(cDoapply, /case POT_OIL:\s+light_cocktail\(&obj\);\s+break;/u);
    const namedArms = APPLY_JS.match(
        /const DOAPPLY_UNPORTED_NAMED_ARMS = new Set\(\[([\s\S]*?)\]\);/u,
    )?.[1];
    assert.ok(namedArms, 'the remaining doapply refusal list is present');
    assert.doesNotMatch(namedArms, /\bPOT_OIL\b/u);
    assert.match(
        APPLY_JS,
        /case POT_OIL:[\s\S]*?await light_cocktail\(objp, state, env\);\s+obj = objp\.obj;\s+return ECMD_TIME;/u,
    );
});

test('a swallowed hero is refused before lighting or changing the object pointer', async () => {
    const state = resetGame();
    // C apply.c:1709 checks u.uswallow before examining the potion's lit state.
    // A truthy holder selects the first C branch before object-state checks.
    state.u = { uswallow: {} };
    // One unlit inventory potion is enough to exercise the swallowed guard;
    // the stack count and flags do not affect this first C branch.
    const potion = {
        lamplit: false,
        otyp: POT_OIL,
        owornmask: 0,
        quan: 1,
        unpaid: false,
    };
    const pointer = { obj: potion };
    const messages = [];

    await light_cocktail(pointer, state, {
        message: async (line) => messages.push(line),
        random: { rn2: () => assert.fail('the swallowed branch draws no RNG') },
    });

    // apply.c:58 supplies this exact no_elbow_room message.
    assert.deepEqual(messages, ["You don't have enough elbow-room to maneuver."]);
    assert.equal(pointer.obj, potion);
    assert.equal(potion.lamplit, false);
});

test('an unlit potion underwater is refused before it is split or discovered', async () => {
    const state = resetGame();
    // C tests Underwater after the swallowed and already-lit branches.
    // This dry-to-water change is the C Underwater condition for an unlit item.
    state.u = { uswallow: null, uinwater: 1 };
    // Quantity two would enter splitobj if the underwater check moved later.
    const potion = {
        lamplit: false,
        otyp: POT_OIL,
        owornmask: 0,
        quan: 2,
        unpaid: false,
    };
    const pointer = { obj: potion };
    const messages = [];

    await light_cocktail(pointer, state, {
        message: async (line) => messages.push(line),
        random: { rn2: () => assert.fail('the underwater branch draws no RNG') },
    });

    // apply.c:1730 states the oxygen failure before quantity splitting.
    assert.deepEqual(messages, ['There is not enough oxygen to sustain a fire.']);
    assert.equal(pointer.obj, potion);
    assert.equal(potion.quan, 2);
    assert.equal(state.u.uinwater, 1);
});
