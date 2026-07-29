import assert from 'node:assert/strict';
import test from 'node:test';

import { BUFSZ } from '../js/const.js';
import { init_objects } from '../js/o_init.js';
import {
    COIN_CLASS,
    objects_globals_init,
    POT_WATER,
    SACK,
} from '../js/objects.js';
import { append_price_quote, contained_gold } from '../js/shk.js';
import { hidden_gold } from '../js/vault.js';

// The four seen-price fields carry init_objects()'s sentinel until
// record_price_quote() writes one, and no ported path calls that yet, so each
// case sets them directly. Expected strings are read from shk.c
// append_price_quote().
function priceState(seen = {}) {
    const state = {};
    objects_globals_init(state);
    // Fixed zero choices initialize the catalog without consuming randomness.
    init_objects(state, () => 0);
    Object.assign(state.objects[POT_WATER], seen);
    return state;
}

test('append_price_quote formats the buy and sell halves shk.c writes', () => {
    // C returns without writing when both ranges are still inverted, which is
    // every type in a game that has met no shopkeeper.
    assert.equal(
        append_price_quote('', POT_WATER, priceState({
            oc_buy_minseen: 1, oc_buy_maxseen: 0,
            oc_sell_minseen: 1, oc_sell_maxseen: 0,
        })),
        '',
    );

    // A single seen value prints alone; min < max prints as a range.
    assert.equal(
        append_price_quote('', POT_WATER, priceState({
            oc_buy_minseen: 20, oc_buy_maxseen: 20,
            oc_sell_minseen: 1, oc_sell_maxseen: 0,
        })),
        ' {buy 20}',
    );
    assert.equal(
        append_price_quote('', POT_WATER, priceState({
            oc_buy_minseen: 20, oc_buy_maxseen: 30,
            oc_sell_minseen: 1, oc_sell_maxseen: 0,
        })),
        ' {buy 20-30}',
    );
    assert.equal(
        append_price_quote('', POT_WATER, priceState({
            oc_buy_minseen: 1, oc_buy_maxseen: 0,
            oc_sell_minseen: 5, oc_sell_maxseen: 5,
        })),
        ' {sell 5}',
    );

    // With both halves present the separator is the single space C's `sep`
    // holds once the buy half has printed.
    assert.equal(
        append_price_quote('', POT_WATER, priceState({
            oc_buy_minseen: 20, oc_buy_maxseen: 30,
            oc_sell_minseen: 5, oc_sell_maxseen: 8,
        })),
        ' {buy 20-30 sell 5-8}',
    );
});

test('append_price_quote drops the whole suffix when it would overrun', () => {
    const state = priceState({
        oc_buy_minseen: 20, oc_buy_maxseen: 30,
        oc_sell_minseen: 5, oc_sell_maxseen: 8,
    });
    const quote = ' {buy 20-30 sell 5-8}';

    // C appends only while len2 < BUFSZ - len - 1, where len is the caller's
    // current length. The longest buffer that still admits the suffix leaves
    // exactly one character of slack.
    const fits = 'x'.repeat(BUFSZ - quote.length - 2);
    assert.equal(append_price_quote(fits, POT_WATER, state), quote);
    assert.equal(append_price_quote(`${fits}x`, POT_WATER, state), '');
});

function container({ cknown = true, contents = [] } = {}) {
    const cobj = contents.reduceRight(
        (nobj, obj) => Object.assign(obj, { nobj }),
        null,
    );
    return { otyp: SACK, cknown, cobj, nobj: null };
}

function gold(quan) {
    return { oclass: COIN_CLASS, quan, cobj: null, nobj: null };
}

test('contained_gold sums nested piles by shk.c\'s rules', () => {
    // C recurses only into a container whose contents the hero has seen,
    // unless even_if_unknown is set; loose gold always counts.
    const inner = container({ cknown: false, contents: [gold(7)] });
    const outer = container({ contents: [gold(3), inner] });

    assert.equal(contained_gold(outer, false), 3);
    assert.equal(contained_gold(outer, true), 10);

    // An empty container answers zero rather than skipping the walk.
    assert.equal(contained_gold(container(), false), 0);
});

test('hidden_gold walks the pack the way vault.c does', () => {
    // vault.c hidden_gold() counts gold inside carried containers only; the
    // hero's own purse is u.ugold, which it never reads.
    const state = {
        invent: null,
        u: {},
    };
    const seen = container({ contents: [gold(12)] });
    const unseen = container({ cknown: false, contents: [gold(5)] });
    seen.nobj = unseen;
    unseen.nobj = gold(100); /* loose gold in the pack, not in a container */
    state.invent = seen;

    assert.equal(hidden_gold(false, state), 12);
    assert.equal(hidden_gold(true, state), 17);
});
