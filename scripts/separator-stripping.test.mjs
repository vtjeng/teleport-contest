// Enforces the rule scripts/separator-stripping.mjs describes: game code that
// compares names as C's fuzzymatch() does calls js/hacklib.js fuzzymatch()
// with the C call's ignore set, rather than deleting separator characters and
// comparing what is left. The first test scans the repository; the others pin
// what the scan finds on small hand-written sources.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALLOWED_SITES,
    scanRepository,
    separatorStrippingFindings,
} from './separator-stripping.mjs';

const lines = (source) => separatorStrippingFindings(source).map(({ line }) => line);

test('no game code deletes separators to compare names', () => {
    const findings = scanRepository();
    const allowed = (f) => ALLOWED_SITES.some(
        (site) => site.file === f.file && site.text === f.text);
    assert.deepEqual(
        findings.filter((f) => !allowed(f)).map((f) => `${f.file}:${f.line}: ${f.text}`),
        [],
        'call fuzzymatch() with the C call\'s ignore set instead',
    );
    // One allowed site, display.js's stripchars() port.  Each must still be
    // found exactly once: a site that moved or was removed leaves an entry
    // that would excuse a different deletion later.
    assert.equal(ALLOWED_SITES.length, 1);
    for (const site of ALLOWED_SITES) {
        assert.equal(
            findings.filter((f) => f.file === site.file && f.text === site.text).length,
            1,
            `${site.file}: ${site.text}`,
        );
    }
});

test('the scan finds class, escape, string and split deletions', () => {
    // Each numbered line holds one deletion; line 1 is the module's first line.
    assert.deepEqual(lines([
        "const a = lcase(x).replace(/[ _-]/gu, '');", // 1: the files.js shape
        "const b = lcase(x).replace(/[\" _-]+/gu, '');", // 2: display.js, with a quote
        "const c = x.replace(/[-_ ]+/g, \"\");", // 3: reordered, double quotes
        'const d = x.replace(/[\\s_-]+/g, ``);', // 4: \\s and an empty template
        "const e = x.replace(/\\s+/g, '');", // 5: \\s alone
        "const f = x.replaceAll('_', '').replaceAll('-', '');", // 6: chained, two calls on one line
        "const g = x.split(/[ -]/).join('');", // 7: split and join
        "const h = x.split(' ').join('');", // 8
        "const i = x.replace(/[\\(\\)\"]/g, '');", // 9: noneoftheabove()'s parentheses
        'const j = x', // 10
        "    .replace(/[ _]/gu, '');", // 11: a call that spans lines reports where it starts
    ].join('\n')), [1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10]);
});

test('the scan accepts trims, other sets and non-empty replacements', () => {
    assert.deepEqual(lines([
        "const a = x.replace(/^ +/u, '');", // trims the start only
        "const b = x.replace(/ +$/u, '');", // trims the end only
        "const c = x.replace(/[ \\t]+$/u, '');", // anchored class
        "const d = x.replace(/[%<>=+]/gu, '');", // no separator in the set
        "const e = x.replace(' (##)', '');", // a phrase, not a character set
        "const f = x.replace(/[ _-]/gu, ' ');", // replaces rather than deletes
        "const g = x.replace(/[A-Z]|[^a-z0-9]/gu, (c) => c);", // alternation
        "const h = x.split(' ').join(' ');", // rejoins with a separator
        "const i = x.replace(/a b/g, '');", // a sequence, not a set
    ].join('\n')), []);
});
