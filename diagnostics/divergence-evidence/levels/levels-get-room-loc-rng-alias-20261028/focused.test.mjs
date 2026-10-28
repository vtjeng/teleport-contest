import assert from 'node:assert/strict';
import test from 'node:test';
import { get_room_loc } from '../../../../js/room_coordinates.js';
import { resetGame } from '../../../../js/gstate.js';
import { initRng, rn2, enableRngLog, getRngLog } from '../../../../js/rng.js';
const room = { lx: 10, hx: 14, ly: 4, hy: 6, nsubrooms: 0 };
function call(c, randomCore) {
  const state = resetGame(); state.u = { uz: { dnum: 0, dlevel: 1 } };
  return get_room_loc(c, room, { state, randomCore });
}
test('C source bounds and draw order, including endpoints', () => {
  for (const values of [[0], [4]]) {
    const draws = [];
    const c = call({ x: -1, y: 1 }, n => { draws.push(n); return values[draws.length - 1]; });
    assert.deepEqual(draws, [5]);
    assert.deepEqual(c, { x: 10 + values[0], y: 5 });
    // This assertion would reject an exclusive-width or swapped-axis mutation.
    assert.notDeepEqual(draws, [4]);
  }
});
test('default randomCore is the real rn2 stream', () => {
  for (const seed of [28103101, 28103102, 28103103]) {
    initRng(seed); const expected = { x: 10 + rn2(5), y: 5 };
    initRng(seed); enableRngLog();
    // resetGame in call would erase RNG, so use the production helper directly.
    const state = { u: { uz: { dnum: 0, dlevel: 1 } } };
    const c = get_room_loc({ x: -1, y: 1 }, room, { state });
    assert.deepEqual(c, expected);
    assert.equal(getRngLog().length, 1);
  }
});
test('fixed-coordinate control consumes no RNG', () => {
  assert.deepEqual(call({ x: 2, y: 1 }, () => assert.fail('unexpected draw')),
    { x: 12, y: 5 });
});
test('negative y uses height, keeping fixed x and draw order', () => {
  for (const value of [0, 2]) {
    const draws = [];
    const c = call({ x: 2, y: -1 }, n => { draws.push(n); return value; });
    assert.deepEqual(draws, [3]);
    assert.deepEqual(c, { x: 12, y: 4 + value });
  }
});
