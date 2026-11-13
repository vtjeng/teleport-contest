// Every `throw new Error/TypeError/RangeError(...)` in js/ is listed, with
// its class and a reason, in scripts/throw-site-list.json.
// scripts/throw-sites.mjs says why: a throw ends the game, and where C calls
// impossible() instead it prints a report and goes on.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { assertExceptionCount } from './exception-count.mjs';
import { readJsSources, scanThrowSites } from './throw-sites.mjs';

const LIST = JSON.parse(readFileSync(
    new URL('./throw-site-list.json', import.meta.url), 'utf8'));

// The classes scripts/throw-sites.mjs defines. A throw that stands in for
// impossible() has no class here: port the call instead.
const CLASSES = new Set(['panic', 'lua-error', 'guard', 'invariant', 'unported']);

// The list's size, pinned both ways so that neither a new throw nor a
// raised count gets in unnoticed, and a removal lowers the pin. The audit of
// 13 November 2026 (branch audit-impossible-throws) found 814 throws under
// 805 keys at 8b1ac72af, ported the impossible() calls among them and left
// 735 under 729 keys: 516 invariant, 87 guard, 86 panic, 44 lua-error and
// 2 unported. js/hacklib.js bytesText() added one invariant.
const LIST_PINS = { entries: 730, sites: 736 };

test('every throw in js/ is on the list with a class and a reason', () => {
    const current = scanThrowSites(readJsSources());
    const problems = [];
    for (const [key, count] of Object.entries(current)) {
        const entry = LIST.entries[key];
        if (!entry) problems.push(`new: ${key} (${count}); port C's impossible() or list it with a class and reason`);
        else if (entry.count !== count)
            problems.push(`changed: ${key} (${entry.count} -> ${count}); update its count`);
    }
    for (const key of Object.keys(LIST.entries))
        if (!Object.hasOwn(current, key)) problems.push(`stale: ${key}; remove its entry`);
    for (const [key, entry] of Object.entries(LIST.entries)) {
        if (!CLASSES.has(entry.class)) problems.push(`bad class: ${key} (${entry.class})`);
        if (typeof entry.reason !== 'string' || !entry.reason.trim())
            problems.push(`no reason: ${key}`);
        if ((entry.class === 'panic' || entry.class === 'lua-error') && !entry.c)
            problems.push(`no C source line: ${key}`);
    }
    assert.deepEqual(problems, []);
});

test('the list holds the pinned number of entries and throws', () => {
    const entries = Object.values(LIST.entries);
    assertExceptionCount(entries.length, LIST_PINS.entries, {
        what: 'listed throw keys',
        pin: 'LIST_PINS.entries in scripts/throw-sites.test.mjs',
    });
    assertExceptionCount(entries.reduce((n, entry) => n + entry.count, 0), LIST_PINS.sites, {
        what: 'listed throws',
        pin: 'LIST_PINS.sites in scripts/throw-sites.test.mjs',
    });
});

test('the scan keys each listed throw by file, function and message head', () => {
    // A stand-in js/ file. Each line names the case it exercises.
    const sources = {
        'js/a.js': [
            'export function f(x) {',
            "    if (!x) throw new TypeError('f requires x');", // listed
            '    if (x < 0) throw new RangeError(`f: bad ${x}`);', // template literal
            "    if (x > 9) throw new Error('f: ' +", // message split over lines
            "        'too big');",
            "    if (x === 5) throw new Error('f: ' + 'too big');", // same key: counted
            "    if (x === 6) throw new UnsupportedThingError('x');", // other class: not listed
            '    try { g(); } catch (e) { throw e; }', // rethrow: not listed
            "    const h = () => { throw new Error('in h'); };", // named by its binding
            '    return h;',
            '}',
            "throw new Error('at load');", // module level
        ].join('\n'),
    };
    assert.deepEqual(scanThrowSites(sources), {
        "js/a.js | <module> | 'at load'": 1,
        "js/a.js | f | 'f requires x'": 1,
        "js/a.js | f | 'f: ' + 'too big'": 2,
        'js/a.js | f | `f: bad ${x}`': 1,
        "js/a.js | h | 'in h'": 1,
    });
});
