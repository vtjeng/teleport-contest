// C refs: nethack-c/patches/002-deterministic-qsort.patch, hacklib.c
// nh_deterministic_qsort() and nh_qsort_idx_cmp(); Apple Libc
// stdlib/FreeBSD/qsort.c and heapsort.c (js/qsort.js, js/heapsort.js).
//
// The patched NetHack sorts an index array with the C library's qsort(),
// breaking ties by index. The sorted result is the same on every host; the
// order of the comparator calls is the library's, and invent.c
// sortloot_cmp() makes it visible (docs/testing.md, "The qsort() call
// order"). The judge's recorder ran on macOS, so the port makes Apple
// Libc's calls.
//
// experiments/host-parity/qsort-oracle/results/macos-calls.txt is the log
// of a macOS host: qsort-oracle.c sorted every key array in cases.txt with
// that host's qsort() and printed each comparator call. This file fails if
// the log is missing, if cases.txt is not what make-cases.mjs writes, or if
// the port's calls differ from the log in any case, in order or in argument
// order.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { casesText } from '../experiments/host-parity/qsort-oracle/make-cases.mjs';
import { nh_deterministic_qsort } from '../js/hacklib.js';

const ORACLE = new URL('../experiments/host-parity/qsort-oracle/', import.meta.url);

// Sort elements whose keys are `keys` and return the comparator calls and
// the sorted element indexes in qsort-oracle.c's output format. The
// comparator returns 0 for equal keys, as a NetHack comparator may; the
// wrapper breaks the tie.
function traced(keys) {
    const calls = [];
    const items = keys.map((key, idx) => ({ key, idx }));
    const sorted = nh_deterministic_qsort(items, (a, b) => {
        calls.push([a.idx, b.idx]);
        return (a.key > b.key) - (a.key < b.key);
    });
    assert.equal(sorted, items);
    return { calls, order: items.map((item) => item.idx) };
}

function oracleLine({ calls, order }) {
    return `${calls.map(([a, b]) => `${a},${b} `).join('')}| ${order.join(' ')}`;
}

test('seven or fewer elements are insertion sorted, comparing neighbours as (left, right)', () => {
    // n <= 7 goes straight to _isort(). Keys 5, 9, 1: element 1 stays
    // after element 0 (call 0,1); element 2 moves left past element 1
    // (call 1,2, swap) and past element 0 (call 0,2, swap).
    const { calls, order } = traced([5, 9, 1]);
    assert.deepEqual(calls, [[0, 1], [1, 2], [0, 2]]);
    assert.deepEqual(order, [2, 0, 1]);
});

test('eight sorted elements: median of three, a partition without swaps, then the limited insertion sort', () => {
    // n = 8 is the smallest array _qsort() partitions. med3() of elements
    // 0, 4 and 7 calls (0,4) and (4,7) and picks 4, which moves to the
    // front. The scan from the left compares elements 1, 2, 3, 0 and 5
    // with the pivot and stops at 5; the scan from the right compares 7, 6
    // and 5 and stops. Nothing was exchanged, so _isort() runs over the
    // whole array, restored to its order, with a swap limit of 1 + 8/4 = 3.
    const { calls, order } = traced([1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(calls, [
        [0, 4], [4, 7],
        [1, 4], [2, 4], [3, 4], [0, 4], [5, 4],
        [7, 4], [6, 4], [5, 4],
        [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
    ]);
    assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('ties keep their original order', () => {
    // Four equal keys: every comparison is a tie, which the wrapper
    // breaks by index, so the insertion sort moves nothing.
    const { calls, order } = traced([7, 7, 7, 7]);
    assert.deepEqual(calls, [[0, 1], [1, 2], [2, 3]]);
    assert.deepEqual(order, [0, 1, 2, 3]);
});

test('fewer than two elements make no call', () => {
    assert.deepEqual(traced([]), { calls: [], order: [] });
    assert.deepEqual(traced([3]), { calls: [], order: [0] });
});

test('cases.txt is what make-cases.mjs writes', () => {
    assert.equal(readFileSync(new URL('cases.txt', ORACLE), 'utf8'), casesText());
});

test('the port makes the comparator calls a macOS host logged, for every case', () => {
    const cases = readFileSync(new URL('cases.txt', ORACLE), 'utf8')
        .trimEnd().split('\n').map((line) => line.split(' ').map(Number));
    const logged = readFileSync(new URL('results/macos-calls.txt', ORACLE), 'utf8')
        .trimEnd().split('\n');
    assert.equal(logged.length, cases.length);
    // 1,184 cases: 18 for each n from 1 to 64 and 8 for each of 4 larger
    // sizes (make-cases.mjs). A shorter file would test less than the
    // oracle was asked.
    assert.equal(cases.length, 64 * 18 + 4 * 8);
    const host = readFileSync(new URL('results/macos-host.txt', ORACLE), 'utf8');
    assert.match(host, /^ProductName:\s+macOS$/mu);

    let calls = 0;
    cases.forEach((keys, index) => {
        const result = traced(keys);
        calls += result.calls.length;
        assert.equal(oracleLine(result), logged[index],
            `case ${index + 1} (n = ${keys.length}, keys ${keys.join(' ')})`);
        // The result is the stable order, worked out without the port.
        const stable = keys.map((_, idx) => idx)
            .sort((a, b) => keys[a] - keys[b] || a - b);
        assert.deepEqual(result.order, stable, `case ${index + 1} is sorted stably`);
    });
    assert.ok(calls > 0);
});
