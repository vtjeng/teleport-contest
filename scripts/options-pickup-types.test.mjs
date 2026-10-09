// options.c:optfn_pickup_types3308-3402 request and production caller checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as options from '../js/options.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { COIN_CLASS, FOOD_CLASS, RING_CLASS, WEAPON_CLASS } from '../js/objects.js';

// options.c's local optreq enum; these values pin every no-input request.
const DO_INIT = 1, DO_SET = 2, GET_VAL = 4, GET_CNF_VAL = 5;
// options.c enum optnresult: successful request is 1, rejected request is 0.
const OPTN_OK = 1, OPTN_ERR = 0;

test('pickup requests share startup state and synchronous value results', () => {
    const state = options.parseNethackrc('OPTIONS=pickup_types:%=)\n');
    assert.equal(options.optfn_pickup_types(state, DO_INIT), OPTN_OK);
    assert.deepEqual(state.flags.pickup_types, [FOOD_CLASS, RING_CLASS, WEAPON_CLASS]);
    for (const request of [GET_VAL, GET_CNF_VAL])
        assert.equal(options.optfn_pickup_types(state, request), '%=)');
    // The source final return accepts requests outside the declared enum.
    assert.equal(options.optfn_pickup_types(state, 99), OPTN_OK);
    // Runtime explicit input parses in source order, retaining accepted types
    // even when a later duplicate fails; interactive error output is a gap.
    state.go.opt_initial = false;
    assert.equal(options.optfn_pickup_types(state, DO_SET, false, 'pickup_types:$%%'), OPTN_ERR);
    assert.deepEqual(state.flags.pickup_types, [COIN_CLASS, FOOD_CLASS]);
    for (const all of ['a', 'A']) {
        assert.equal(options.optfn_pickup_types(state, DO_SET, false, `pickup_types:${all}Z`), OPTN_OK);
        assert.deepEqual(state.flags.pickup_types, []);
    }
    assert.equal(options.optfn_pickup_types(state, GET_VAL), 'all');
    // strlen(opts)<=6 is C's compatibility arm: do not prompt on "pickup".
    assert.equal(options.optfn_pickup_types(state, DO_SET, true, 'pickup'), OPTN_OK);
    assert.equal(state.flags.pickup, false);
    assert.deepEqual(state.flags.pickup_types, []);
});

const CASES = [
    // Source response '%' replaces old ')'; empty/space/Escape sequence ends
    // with restored ')'; combination 'm' keeps old '$' and adds '%' in menu order.
    ['pickup-types-traditional-full', [FOOD_CLASS]],
    ['pickup-types-traditional-simple-restore', [WEAPON_CLASS]],
    ['pickup-types-combination-menu', [COIN_CLASS, FOOD_CLASS]],
];
for (const [name, expected] of CASES) {
    test(`production pickup request: ${name}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/options.c/${name}.session.json`, import.meta.url)));
        let boundary;
        await runSegment(recipe.segments[0], { onBoundary: e => { boundary = e; } });
        assert.equal(boundary, undefined);
        assert.deepEqual(game.flags.pickup_types, expected);
    });
}
