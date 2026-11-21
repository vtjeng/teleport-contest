// SPDX-License-Identifier: BSD-3-Clause
//
// A JavaScript translation of FreeBSD's qsort.c as Apple Libc ships it.
// Copyright (c) 1992, 1993 The Regents of the University of California.
// All rights reserved. Distributed under the licence in
// licenses/FreeBSD-qsort-LICENSE.txt.
//
// qsort.js -- Apple Libc stdlib/FreeBSD/qsort.c (tag Libc-1752.120.2)
// qsort(), the C library sort of the judge's macOS recorder.
//
// The patched NetHack sorts through hacklib.c nh_deterministic_qsort(),
// whose result is the same on every host. The order in which the library
// calls the comparator is not, and a comparator with a side effect shows
// it: invent.c sortloot_cmp() classifies an object the first time it is
// compared, which marks it seen, so the discoveries list follows the call
// order (docs/testing.md, "The qsort() call order"). This file makes the
// calls macOS makes, with the arguments in the same order.
// experiments/host-parity/qsort-oracle/ logs a macOS host's calls, and
// scripts/hacklib-qsort.test.mjs replays that log against this file.
//
// The C sorts `n` elements of `es` bytes at pointer `a`. Here `v` is a
// JavaScript array and `a`, `pa`, `pb`, `pc`, `pd`, `pl`, `pm` and `pn` are
// indexes into it, so `es` is 1 and the swaptype variables, which only
// choose how bytes are exchanged, are gone. `cmp` receives two elements,
// where the C passes two element pointers, in the same argument order.
import { heapsort } from './heapsort.js';

// C ref: qsort.c swap().
function swap(v, a, b) {
    const t = v[a];
    v[a] = v[b];
    v[b] = t;
}

// C ref: qsort.c vecswap(). Exchange the `n` elements at `a` with those at
// `b`.
function vecswap(v, a, b, n) {
    for (; n > 0; --n) swap(v, a++, b++);
}

// C ref: qsort.c med3(). Find the median of 3 elements.
function med3(v, a, b, c, cmp) {
    return cmp(v[a], v[b]) < 0
        ? (cmp(v[b], v[c]) < 0 ? b : (cmp(v[a], v[c]) < 0 ? c : a))
        : (cmp(v[b], v[c]) > 0 ? b : (cmp(v[a], v[c]) < 0 ? a : c));
}

// C ref: qsort.c DEPTH() for __LP64__: 2 * (flsl(x) - 1). flsl() is the
// position of the highest set bit, counting from 1. An array length is
// below 2^32, which Math.clz32() covers.
function DEPTH(x) {
    return 2 * ((32 - Math.clz32(x)) - 1);
}

// C ref: qsort.c _isort(). Simple insertion sort routine. With a non-zero
// `swap_limit` it gives up, returning false, once it has made more swaps
// than that; the check follows the swap.
function _isort(v, a, n, cmp, swap_limit) {
    let swap_cnt = 0;
    for (let pm = a + 1; pm < a + n; pm += 1) {
        for (let pl = pm; pl > a && cmp(v[pl - 1], v[pl]) > 0; pl -= 1) {
            swap(v, pl, pl - 1);
            if (swap_limit && ++swap_cnt > swap_limit) return false;
        }
    }
    return true;
}

// C ref: qsort.c _qsort(). The `for (;;)` is the C's `loop:` label; each
// `continue` is a `goto loop`, and `depth_limit` falls on every pass.
function _qsort(v, a, n, cmp, depth_limit) {
    for (;;) {
        let swap_cnt = 0;

        if (depth_limit-- <= 0) {
            // We've hit our recursion limit, switch to heapsort
            heapsort(v, a, n, cmp);
            return;
        }

        if (n <= 7) {
            // For sufficiently small inputs, we'll just insertion sort.
            // Pass 0 as swap limit, since this must complete.
            _isort(v, a, n, cmp, 0);
            return;
        }

        // Compute the pseudomedian. Small arrays use 3 samples, large ones
        // use 9.
        let pl = a;
        let pm = a + Math.floor(n / 2);
        let pn = a + (n - 1);
        if (n > 40) {
            const d = Math.floor(n / 8);

            pl = med3(v, pl, pl + d, pl + 2 * d, cmp);
            pm = med3(v, pm - d, pm, pm + d, cmp);
            pn = med3(v, pn - 2 * d, pn - d, pn, cmp);
        }
        pm = med3(v, pl, pm, pn, cmp);

        // Pull the median to the front.
        swap(v, a, pm);
        let pa = a + 1;
        let pb = pa;
        let pc = a + (n - 1);
        let pd = pc;

        for (;;) {
            // - Move b forward while it's less than the median
            // - Move c backwards while it's greater than the median
            // - When equal to the median, swap to the outside
            // hacklib.c nh_qsort_idx_cmp() never returns 0 for two
            // different elements, so NetHack does not reach the two
            // `cmp_result == 0` arms.
            let cmp_result;
            while (pb <= pc && (cmp_result = cmp(v[pb], v[a])) <= 0) {
                if (cmp_result === 0) {
                    swap_cnt = 1;
                    swap(v, pa, pb);
                    pa += 1;
                }
                pb += 1;
            }
            while (pb <= pc && (cmp_result = cmp(v[pc], v[a])) >= 0) {
                if (cmp_result === 0) {
                    swap_cnt = 1;
                    swap(v, pc, pd);
                    pd -= 1;
                }
                pc -= 1;
            }
            if (pb > pc) break;
            swap(v, pb, pc);
            swap_cnt = 1;
            pb += 1;
            pc -= 1;
        }

        // Now the array is | = | < | > | = |, so swap the '=' into the
        // middle.
        pn = a + n;
        let d1 = Math.min(pa - a, pb - pa);
        vecswap(v, a, pb - d1, d1);
        d1 = Math.min(pd - pc, pn - pd - 1);
        vecswap(v, pb, pn - d1, d1);

        if (swap_cnt === 0) { // Switch to insertion sort
            const r = 1 + Math.floor(n / 4); // n > 7, so r >= 2
            if (_isort(v, a, n, cmp, r)) return;
            // The C's `goto nevermind`: carry on with the partitions.
        }

        d1 = pb - pa;
        const d2 = pd - pc;
        if (d1 <= d2) {
            // Recurse on left partition, then iterate on right partition
            if (d1 > 1) _qsort(v, a, d1, cmp, depth_limit);
            if (d2 > 1) {
                a = pn - d2;
                n = d2;
                continue;
            }
        } else {
            // Recurse on right partition, then iterate on left partition
            if (d2 > 1) _qsort(v, pn - d2, d2, cmp, depth_limit);
            if (d1 > 1) {
                n = d1;
                continue;
            }
        }
        return;
    }
}

// C ref: qsort.c qsort(). Sorts the JavaScript array `v` in place.
export function qsort(v, cmp) {
    _qsort(v, 0, v.length, cmp, DEPTH(v.length));
}
