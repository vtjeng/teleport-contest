// Enforces the rule scripts/ascii-case.mjs describes: game code changes and
// compares letter case only through js/hacklib.js's ASCII-only helpers, as C
// does in the "C" locale. The first test scans js/; the others pin what the
// scan finds on small hand-written sources.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALLOWED,
    asciiCaseFindings,
    scanRepository,
    unexpectedFindings,
} from './ascii-case.mjs';

// The allowed sites, counted. 2 = js/terminal.js's two browser key-name
// tests (13 November 2026, when the other 302 sites in js/ were routed
// through the hacklib.js helpers). A change that adds an allowed site must
// give its reason in ALLOWED and raise this count; a change that removes
// one must lower it.
const ALLOWED_SITES = 2;

test('js/ changes letter case only through the ASCII-only helpers', () => {
    const findings = scanRepository();
    assert.deepEqual(unexpectedFindings(findings), []);
    const allowed = ALLOWED.reduce((total, entry) => total + entry.count, 0);
    assert.ok(allowed <= ALLOWED_SITES,
        `ALLOWED lists ${allowed} sites, above ${ALLOWED_SITES}; route the new ones through js/hacklib.js`);
    assert.ok(allowed >= ALLOWED_SITES,
        `ALLOWED lists ${allowed} sites; lower ALLOWED_SITES in this file from ${ALLOWED_SITES} to ${allowed}`);
    assert.equal(findings.length, ALLOWED_SITES);
    for (const entry of ALLOWED) assert.ok(entry.reason, `${entry.file} ${entry.code} needs a reason`);
});

test('the scan finds each Unicode-aware case operation', () => {
    // Each numbered line holds one finding; line 1 is the module's first line.
    const findings = asciiCaseFindings([
        "const a = name.toLowerCase();", // 1
        "const b = name.toUpperCase();", // 2
        "const c = name.toLocaleLowerCase('tr');", // 3
        "const d = name['toLocaleUpperCase']();", // 4: computed literal key
        "const e = names.sort((x, y) => x.localeCompare(y));", // 5
        "const f = /^the /iu.test(name);", // 6
        "const g = new RegExp('x', 'gi');", // 7
        "const h = RegExp(pattern, flags);", // 8: flags not a literal
        "const k = new Intl.Collator('en');", // 9
        "const m = names.map(String.prototype.toUpperCase.call);", // 10: unbound
    ].join('\n'));
    assert.deepEqual(findings.map(({ line }) => line), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('the scan accepts the ASCII-only helpers, comments and strings', () => {
    assert.deepEqual(asciiCaseFindings([
        "import { lcase, strcmpi } from './hacklib.js';",
        '// name.toLowerCase() would also change É',
        "const a = lcase(name);",
        "const b = 'toUpperCase';",
        "const c = /^[Tt]he /u.test(name);",
        "const d = new RegExp('x', 'gu');",
        "const e = names.sort(strcmpi);",
    ].join('\n')), []);
});

test('unexpectedFindings reports unlisted sites and wrong counts both ways', () => {
    const allowed = [{ file: 'js/a.js', code: 'k.toLowerCase', count: 2, reason: 'test' }];
    const site = { file: 'js/a.js', line: 3, kind: 'toLowerCase', code: 'k.toLowerCase' };
    // Two listed occurrences match the entry exactly.
    assert.deepEqual(unexpectedFindings([site, site], allowed), []);
    // One occurrence fewer than listed is reported, so a stale entry cannot stay.
    assert.equal(unexpectedFindings([site], allowed).length, 1);
    // One more than listed is reported too.
    assert.equal(unexpectedFindings([site, site, site], allowed).length, 1);
    // A site that ALLOWED does not name is reported with its location.
    const other = { file: 'js/b.js', line: 7, kind: 'toUpperCase', code: 'v.toUpperCase' };
    assert.match(unexpectedFindings([site, site, other], allowed)[0], /^js\/b\.js:7 toUpperCase/u);
});
