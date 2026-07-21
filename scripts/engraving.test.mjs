import assert from 'node:assert/strict';
import test from 'node:test';

import { DUST } from '../js/const.js';
import {
    engr_at,
    make_engr_at,
    wipe_engr_at,
    wipeout_text,
} from '../js/engrave.js';

function scriptedRandom(script) {
    const remaining = [...script];
    const calls = [];
    return {
        random: {
            rn2(bound) {
                calls.push(['rn2', bound]);
                const expected = remaining.shift();
                assert.ok(expected, `unexpected rn2(${bound})`);
                assert.deepEqual(expected.slice(0, 2), ['rn2', bound]);
                assert.ok(expected[2] >= 0 && expected[2] < bound);
                return expected[2];
            },
            rnd(bound) {
                assert.fail(`unexpected rnd(${bound})`);
            },
        },
        calls,
        done() {
            assert.deepEqual(remaining, []);
        },
    };
}

function noDrawRandom() {
    return {
        rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
    };
}

function nicheWipeScript() {
    return [
        // Index zero selects the unmapped 'a'; rubout zero makes it unreadable.
        ['rn2', 11, 0], ['rn2', 4, 0],
        // Index one selects 'd'; rubout one and replacement one choose '|'.
        ['rn2', 11, 1], ['rn2', 4, 1], ['rn2', 2, 1],
        // Index two is the embedded space. It still consumes both source draws.
        ['rn2', 11, 2], ['rn2', 4, 3],
        // Index ten selects 'm'; replacement one from "nr" is 'r'.
        ['rn2', 11, 10], ['rn2', 4, 1], ['rn2', 2, 1],
        // Index nine selects unmapped 'u', which becomes unreadable.
        ['rn2', 11, 9], ['rn2', 4, 2],
    ];
}

test('wipeout_text ages the teleport-niche message in source call order', () => {
    const scripted = scriptedRandom(nicheWipeScript());

    // mklev.c calls wipe_engr_at(..., 5, FALSE) for the 11-byte
    // teleport-trap warning "ad aerarium"; seed zero selects the core RNG path.
    assert.equal(
        wipeout_text('ad aerarium', 5, 0, { random: scripted.random }),
        '?| aerari?r',
    );
    scripted.done();
    assert.deepEqual(scripted.calls, nicheWipeScript().map(
        ([name, bound]) => [name, bound],
    ));
});

test('make_engr_at creates and replaces C-shaped DUST engraving state', () => {
    const state = {};
    const random = noDrawRandom();
    // These are mklev.c makeniche()'s coordinates, text, time, and type shape;
    // the arbitrary coordinates distinguish lookup from list position.
    const first = make_engr_at(
        17,
        8,
        'ad aerarium',
        null,
        0,
        DUST,
        { state, random },
    );

    assert.equal(engr_at(17, 8, state), first);
    assert.equal(engr_at(18, 8, state), null);
    assert.deepEqual(first.engr_txt, [
        'ad aerarium',
        'ad aerarium',
        'ad aerarium',
    ]);
    assert.deepEqual(
        [first.engr_x, first.engr_y, first.engr_time, first.engr_type],
        [17, 8, 0, DUST],
    );
    // Eleven source characters plus NUL occupy each of the three text slots.
    assert.equal(first.engr_szeach, 12);
    assert.equal(first.engr_alloc, 36);
    assert.equal(first.nxt_engr, null);
    assert.equal(first.guardobjects, false);
    assert.equal(first.nowipeout, false);
    assert.equal(first.eread, false);
    assert.equal(first.erevealed, false);

    // make_engr_at deletes an engraving already at the target coordinate.
    const replacement = make_engr_at(
        17,
        8,
        'new',
        'pristine',
        7,
        DUST,
        { state, random },
    );
    assert.equal(engr_at(17, 8, state), replacement);
    assert.notEqual(replacement, first);
    assert.equal(replacement.nxt_engr, null);
    assert.deepEqual(replacement.engr_txt, ['new', 'new', 'pristine']);
    // The longer eight-character pristine string plus NUL fixes all slot sizes.
    assert.equal(replacement.engr_szeach, 9);
    assert.equal(replacement.engr_alloc, 27);
});

test('wipe_engr_at ages only the actual DUST text and skips erosion odds', () => {
    const state = {};
    const random = noDrawRandom();
    const engraving = make_engr_at(
        17,
        8,
        'ad aerarium',
        null,
        0,
        DUST,
        { state, random },
    );
    const scripted = scriptedRandom(nicheWipeScript());

    assert.equal(
        wipe_engr_at(17, 8, 5, false, {
            state,
            random: scripted.random,
        }),
        engraving,
    );
    scripted.done();
    assert.deepEqual(engraving.engr_txt, [
        '?| aerari?r',
        'ad aerarium',
        'ad aerarium',
    ]);
    assert.equal(engr_at(17, 8, state), engraving);
});

test('wipe_engr_at deletes a DUST engraving whose actual text is erased', () => {
    const state = {};
    const random = noDrawRandom();
    // Underscore is one of engrave.c's small punctuation marks and a trailing
    // space checks the source's post-wipe trailing-space trim.
    make_engr_at(23, 9, '_ ', null, 0, DUST, { state, random });
    const scripted = scriptedRandom([
        // Select underscore from the two-character text; punctuation erasure
        // does not consume a replacement draw after the standard rn2(4).
        ['rn2', 2, 0], ['rn2', 4, 3],
    ]);

    assert.equal(
        wipe_engr_at(23, 9, 1, false, {
            state,
            random: scripted.random,
        }),
        null,
    );
    scripted.done();
    assert.equal(engr_at(23, 9, state), null);
    assert.equal(state.head_engr, null);
});
