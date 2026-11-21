// SPDX-License-Identifier: BSD-3-Clause
//
// A JavaScript translation of FreeBSD's heapsort.c as Apple Libc ships it.
// Copyright (c) 1991, 1993 The Regents of the University of California.
// All rights reserved. Derived from software contributed to Berkeley by
// Ronnie Kon at Mindcraft Inc., Kevin Lew and Elmer Yglesias. Distributed
// under the licence in licenses/FreeBSD-qsort-LICENSE.txt.
//
// heapsort.js -- Apple Libc stdlib/FreeBSD/heapsort.c (tag
// Libc-1752.120.2) heapsort(). macOS's qsort() (js/qsort.js) falls back to
// it when quicksort's partitions stay lopsided for too long.
//
// The C sorts `nmemb` records of `size` bytes at `vbase`; this sorts the
// `nmemb` elements of the JavaScript array `v` that start at index `a`.
// The C numbers the records from 1 (`base = vbase - size`), so record i is
// `v[base + i]` here. `compar` receives two elements, where the C passes
// two record pointers, in the same argument order.

// C ref: heapsort.c CREATE(). Sift the record at `initval` down a heap of
// `nmemb` records.
function CREATE(v, base, initval, nmemb, compar) {
    let child_i;
    for (let par_i = initval; (child_i = par_i * 2) <= nmemb; par_i = child_i) {
        let child = base + child_i;
        if (child_i < nmemb && compar(v[child], v[child + 1]) < 0) {
            child += 1;
            ++child_i;
        }
        const par = base + par_i;
        if (compar(v[child], v[par]) <= 0) break;
        const tmp = v[par];
        v[par] = v[child];
        v[child] = tmp;
    }
}

// C ref: heapsort.c SELECT(). The top of the heap is free: pull the larger
// child up each level to the bottom, then walk back up to the place of `k`,
// the displaced record.
function SELECT(v, base, nmemb, k, compar) {
    let par_i;
    let child_i;
    for (par_i = 1; (child_i = par_i * 2) <= nmemb; par_i = child_i) {
        let child = base + child_i;
        if (child_i < nmemb && compar(v[child], v[child + 1]) < 0) {
            child += 1;
            ++child_i;
        }
        v[base + par_i] = v[child];
    }
    for (;;) {
        child_i = par_i;
        par_i = Math.floor(child_i / 2);
        const child = base + child_i;
        const par = base + par_i;
        if (child_i === 1 || compar(k, v[par]) < 0) {
            v[child] = k;
            break;
        }
        v[child] = v[par];
    }
}

// C ref: heapsort.c heapsort(). The C returns -1 for a zero size or a
// failed malloc() of `k`; neither can happen here.
export function heapsort(v, a, nmemb, compar) {
    if (nmemb <= 1) return 0;

    const base = a - 1;

    for (let l = Math.floor(nmemb / 2) + 1; --l;)
        CREATE(v, base, l, nmemb, compar);

    // For each element of the heap, save the largest element into its
    // final slot, save the displaced element (k), then recreate the heap.
    while (nmemb > 1) {
        const k = v[base + nmemb];
        v[base + nmemb] = v[base + 1];
        --nmemb;
        SELECT(v, base, nmemb, k, compar);
    }
    return 0;
}
