#!/usr/bin/env node
// make-cases.mjs -- write cases.txt, the key arrays that qsort-oracle.c
// sorts on the macOS runner.
//
// Each line is one case: the keys of elements 0..n-1, separated by spaces.
// Nothing here is random at run time: the permutations come from a fixed
// seed, so the file is the same on every host. `--check` fails if the
// committed file differs from what this script writes.
//
// For every n from 1 to 64 the cases are:
//
// - sorted, reversed and all-equal keys;
// - six random permutations of 0..n-1;
// - four random arrays with duplicate keys, drawn from 2, 3, n/4+1 and
//   n/2+1 values;
// - an organ pipe (rising then falling) and a sawtooth;
// - a sorted array with two random transpositions;
// - two shuffled halves: every key of the first half below every key of
//   the second, with the median in the middle, so that a quicksort
//   partition around the median has nothing to exchange;
// - an adversary: the keys McIlroy's "A Killer Adversary for Quicksort"
//   (1999) builds against js/qsort.js, which drive Apple's qsort() into its
//   heapsort fallback.
//
// LARGE_N adds a sorted, a reversed, an all-equal, two random, one
// duplicate-key, a two-halves and an adversary case at each larger size.
// An inventory holds at most 52 lettered objects, but a floor pile or a
// container can hold more.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { qsort } from '../../../js/qsort.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CASES_PATH = join(HERE, 'cases.txt');

const SEED = 0x51c0ffee;
const MAX_SMALL_N = 64;
const LARGE_N = [96, 128, 200, 333];

// mulberry32: a small fixed generator, so the cases do not depend on the
// JavaScript engine's Math.random().
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const random = mulberry32(SEED);
const below = (n) => Math.floor(random() * n);
const range = (n) => Array.from({ length: n }, (_, i) => i);

function shuffled(values) {
    const out = [...values];
    for (let i = out.length - 1; i > 0; --i) {
        const j = below(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function withDuplicates(n, values) {
    return range(n).map(() => below(values));
}

function transposed(n) {
    const out = range(n);
    for (let k = 0; k < 2 && n > 1; ++k) {
        const i = below(n);
        const j = below(n);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function twoHalves(n) {
    const half = Math.floor(n / 2);
    return [
        ...shuffled(range(half)),
        half,
        ...shuffled(range(n - half - 1).map((i) => half + 1 + i)),
    ].slice(0, n);
}

// McIlroy's adversary. Every key starts as "gas", larger than any solid
// key. When the sort compares two gas keys, one of them freezes to the
// next solid value: the candidate pivot if it is one of the two. The frozen
// keys make the sort repeat the same comparisons.
export function adversary(n) {
    const gas = n;
    const val = new Array(n).fill(gas);
    let nsolid = 0;
    let candidate = 0;
    const order = range(n);
    qsort(order, (x, y) => {
        if (val[x] === gas && val[y] === gas) {
            if (x === candidate) val[x] = nsolid++;
            else val[y] = nsolid++;
        }
        if (val[x] === gas) candidate = x;
        else if (val[y] === gas) candidate = y;
        return val[x] - val[y] || x - y;
    });
    return val.map((key) => (key === gas ? nsolid++ : key));
}

export function makeCases() {
    const cases = [];
    for (let n = 1; n <= MAX_SMALL_N; ++n) {
        cases.push(range(n), range(n).reverse(), new Array(n).fill(0));
        for (let k = 0; k < 6; ++k) cases.push(shuffled(range(n)));
        for (const values of [2, 3, Math.floor(n / 4) + 1, Math.floor(n / 2) + 1])
            cases.push(withDuplicates(n, values));
        cases.push(range(n).map((i) => Math.min(i, n - 1 - i)));
        cases.push(range(n).map((i) => i % 5));
        cases.push(transposed(n), twoHalves(n), adversary(n));
    }
    for (const n of LARGE_N) {
        cases.push(range(n), range(n).reverse(), new Array(n).fill(0));
        cases.push(shuffled(range(n)), shuffled(range(n)));
        cases.push(withDuplicates(n, 7), twoHalves(n), adversary(n));
    }
    return cases;
}

export function casesText() {
    return `${makeCases().map((keys) => keys.join(' ')).join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const text = casesText();
    if (process.argv[2] === '--check') {
        if (readFileSync(CASES_PATH, 'utf8') !== text) {
            console.error('cases.txt differs from make-cases.mjs; run it again');
            process.exit(1);
        }
    } else {
        writeFileSync(CASES_PATH, text);
        console.log(`${text.trim().split('\n').length} cases in ${CASES_PATH}`);
    }
}
