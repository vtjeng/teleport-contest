// zap.c exclam(), the punctuation that ends a hit message. Every expectation
// below is read off the C return expression, not off the port.

import assert from 'node:assert/strict';
import test from 'node:test';

import { exclam } from '../js/zap.js';

// C ref: zap.c exclam() (3546-3553):
//     return (force < 0) ? "?" : (force <= 4) ? "." : "!";
// Three arms and two boundaries, so each arm gets a case and each boundary
// gets the pair that straddles it.
test('exclam picks its punctuation from the two force boundaries', () => {
    // The `force < 0` arm. C's own comment records that a large force is
    // usual with wands, so the negative side belongs to zaps rather than to
    // melee.
    assert.equal(exclam(-1), '?');
    // The first boundary. C's comment names zero as the sleep ray's force,
    // and `force < 0` sends it to the middle arm; `force <= 0` would not.
    assert.equal(exclam(0), '.');
    // The second boundary, straddled. `force <= 4` keeps 4 on the quiet side
    // and 5 on the loud one; a `force < 4` or `force <= 5` comparison, or one
    // written the other way round, moves one of these two.
    assert.equal(exclam(4), '.');
    assert.equal(exclam(5), '!');
});
