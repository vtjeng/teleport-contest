import assert from 'node:assert/strict';
import test from 'node:test';

import { runnerSpeed, sizeBalancedBatches } from './scoring-workspace.mjs';

test('size-balanced batches place the largest sessions first on the lightest batch', () => {
    // Sizes 8, 1, 5, 4, 2 over two batches: 8 opens batch 0, 5 opens batch 1,
    // 4 joins batch 1 (5 < 8), 2 joins batch 0 (8 < 9), and 1 joins batch 1
    // (9 < 10). Indices come back ascending within each batch.
    assert.deepEqual(sizeBalancedBatches([8, 1, 5, 4, 2], 2), [[0, 4], [1, 2, 3]]);
    // More batches than sessions leaves no empty batch; the larger session,
    // index 1, opens the first batch.
    assert.deepEqual(sizeBalancedBatches([3, 7], 9), [[1], [0]]);
    // Equal sizes keep file order, so the split is deterministic.
    assert.deepEqual(sizeBalancedBatches([1, 1, 1, 1], 2), [[0, 2], [1, 3]]);
});

test('runner speed fits startup plus a per-move cost like the frozen runner', () => {
    // Two exact points, 100 ms at 0 moves and 200 ms at 10 moves, give a
    // 100 ms startup and 10 ms per move with a perfect fit.
    assert.deepEqual(runnerSpeed([
        { time: { ms: 100, moves: 0 } },
        { time: { ms: 200, moves: 10 } },
        { passed: false }, // A session without a time does not enter the fit.
    ]), { startup_ms: 100, per_move_ms: 10, r2: 1, label: '100+10.00/turn', sessions: 2 });
    // One timed session is too few for a line, as in the runner.
    assert.equal(runnerSpeed([{ time: { ms: 5, moves: 1 } }]).label, '?');
});
