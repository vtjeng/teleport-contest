// C ref: botl.c repad_with_dashes() (2167-2178), which wintty.c calls on the
// 30-character hitpointbar title when critically_low_hp(TRUE) holds:
//
//     char *p = eos(inoutbuf);
//     while (p >= inoutbuf + 2 && p[-1] == ' ' && p[-2] == ' ') {
//         p[-1] = '-';
//         p -= 2;
//     }
import assert from 'node:assert/strict';
import test from 'node:test';

import { repad_with_dashes } from '../js/display.js';

test('repad_with_dashes stops at the first pair that is not two spaces', () => {
    // "Al  Bo the Evoker" is 17 characters, padded to wintty.c's 30. The
    // 13 trailing spaces give six pairs; the seventh pair is "r ", so the
    // loop stops there and leaves the double space inside the name alone.
    const bar = 'Al  Bo the Evoker'.padEnd(30);
    assert.equal(repad_with_dashes(bar), 'Al  Bo the Evoker  - - - - - -');
});

test('repad_with_dashes dashes an all-space buffer down to its start', () => {
    // Four spaces are two pairs; p reaches inoutbuf itself and the
    // p >= inoutbuf + 2 bound ends the loop.
    assert.equal(repad_with_dashes('    '), ' - -');
});

test('repad_with_dashes leaves a buffer with no trailing pair unchanged', () => {
    // A 30-character title with no padding ends in a letter, so the first
    // test fails and nothing is replaced, interior double spaces included.
    const full = 'Xy  Zz the Thaumaturge Aaaaaaa';
    assert.equal(full.length, 30);
    assert.equal(repad_with_dashes(full), full);
    // A single trailing space is not a pair.
    assert.equal(repad_with_dashes('ab '), 'ab ');
});
