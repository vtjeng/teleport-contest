import assert from 'node:assert/strict';
import test from 'node:test';
import { get_location } from '../../../../js/room_coordinates.js';
import { ANY_LOC } from '../../../../js/const.js';
import { resetGame } from '../../../../js/gstate.js';
import { initRng, rn2, enableRngLog, getRngLog } from '../../../../js/rng.js';
const frame = { xstart: 10, ystart: 4, xsize: 5, ysize: 3 };
function call(c, randomCore) {
  const state = resetGame(); state.u = { uz: { dnum: 0, dlevel: 1 } };
  return get_location(c, ANY_LOC, null, { state, frame, randomCore });
}
test('C source bounds and draw order, including endpoints', () => {
  for (const values of [[0, 0], [4, 2]]) {
    const draws = [];
    const c = call({ x: -1, y: -1 }, n => { draws.push(n); return values[draws.length - 1]; });
    assert.deepEqual(draws, [5, 3]);
    assert.deepEqual(c, { x: 10 + values[0], y: 4 + values[1] });
    // This assertion would reject an exclusive-width or swapped-axis mutation.
    assert.notDeepEqual(draws, [4, 2]);
  }
});
test('default randomCore is the real rn2 stream', () => {
  for (const seed of [28103101, 28103102, 28103103]) {
    initRng(seed); const expected = { x: 10 + rn2(5), y: 4 + rn2(3) };
    initRng(seed); enableRngLog();
    // resetGame in call would erase RNG, so use the production helper directly.
    const state = { u: { uz: { dnum: 0, dlevel: 1 } } };
    const c = get_location({ x: -1, y: -1 }, ANY_LOC, null, { state, frame });
    assert.deepEqual(c, expected);
    assert.equal(getRngLog().length, 2);
  }
});
test('fixed-coordinate control consumes no RNG', () => {
  assert.deepEqual(call({ x: 2, y: 1 }, () => assert.fail('unexpected draw')),
    { x: 12, y: 5 });
});
