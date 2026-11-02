// Pin nh_deterministic_qsort(), the stable qsort() wrapper that
// nethack-c/patches/002-deterministic-qsort.patch adds to hacklib.c. The
// wrapper sorts an index array with glibc's qsort(), which is msort.c's
// top-down merge sort: msort_with_tmp() sorts the first n/2 elements, then
// the remaining n - n/2, then merges them, calling the comparator as
// (left, right). Every expected value below is derived from that algorithm,
// not by running the JavaScript and recording what it produced.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nh_deterministic_qsort } from '../js/hacklib.js';

// Sort `values` and return the sorted array and every comparator call.
function traced(values) {
    const calls = [];
    const sorted = nh_deterministic_qsort([...values], (a, b) => {
        calls.push([a, b]);
        return a.key - b.key;
    });
    return { sorted, calls };
}

test('three elements compare the last two before the first', () => {
    // n = 3 splits into n1 = 1 and n2 = 2: the run [1, 2] is sorted first,
    // and only the merge brings element 0 in. Keys 5, 9, 1 make element 2
    // sort before element 1, so the merge compares 0 with 2, then 0 with 1.
    const items = [{ id: 0, key: 5 }, { id: 1, key: 9 }, { id: 2, key: 1 }];
    const { sorted, calls } = traced(items);
    assert.deepEqual(calls.map(([a, b]) => [a.id, b.id]), [[1, 2], [0, 2], [0, 1]]);
    assert.deepEqual(sorted.map((item) => item.id), [2, 0, 1]);
});

test('five elements sort the pairs 0-1 and 3-4 before touching element 2', () => {
    // n = 5 splits into [0, 1] and [2, 3, 4]; the second run splits into
    // [2] and [3, 4]. Already-ordered keys 1..5 make each merge take every
    // left element first: (0,1), (3,4), (2,3), then (0,2), (1,2).
    const items = [1, 2, 3, 4, 5].map((key, id) => ({ id, key }));
    const { sorted, calls } = traced(items);
    assert.deepEqual(
        calls.map(([a, b]) => [a.id, b.id]),
        [[0, 1], [3, 4], [2, 3], [0, 2], [1, 2]],
    );
    assert.deepEqual(sorted.map((item) => item.id), [0, 1, 2, 3, 4]);
});

test('ties keep their original order', () => {
    // Equal keys 7, 7, 7, 7 compare equal, so the wrapper breaks each tie
    // by original index and the order is unchanged.
    const items = [0, 1, 2, 3].map((id) => ({ id, key: 7 }));
    assert.deepEqual(traced(items).sorted.map((item) => item.id), [0, 1, 2, 3]);
});
