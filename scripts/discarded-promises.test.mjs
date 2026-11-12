// Every statement-level call in js/ that discards a promise is either awaited
// or listed, with a reason, in scripts/discarded-promise-allowlist.json.
// scripts/discarded-promises.mjs says why: a discarded promise is the one way
// code keeps running after js/end.js nh_terminate() ends a game.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { readJsSources, scanDiscardedPromises } from './discarded-promises.mjs';
import { assertExceptionCount } from './exception-count.mjs';

const ALLOWLIST = JSON.parse(readFileSync(
    new URL('./discarded-promise-allowlist.json', import.meta.url), 'utf8'));

// The allowlist's size, pinned both ways so that neither a new entry nor a
// raised count gets in unnoticed, and a removal lowers the pin. 291 entries
// holding 374 discarded calls: 289 and 372 on 9f7e42e6 (8 November 2026),
// plus sp_lev_object.js applyObjectFields()'s oname(), plus mon.js
// apply_newcham_steps()'s newmonhp() (branch levdiff, 11 November 2026).
// 293 and 376 since discard_minvent() calls extract_from_minvent() (branch
// minvent-extract, 12 November 2026): its two inline-copy entries went, and
// its four synchronous callers and worn.js's extract() arm came in. 292 and
// 374 since mklev.js fill_empty_maze() awaits its two makemon() calls
// (12 November 2026). 300 and 385 with eight level-creation-only callers of
// mktrap(), dodoor() and priestini(), which return a Promise only outside
// level creation (11 calls; branch wizloadlua-makemon, 12 November 2026).
const ALLOWLIST_PINS = { entries: 300, calls: 385 };

test('every discarded promise in js/ is on the allowlist with a reason', () => {
    const current = scanDiscardedPromises(readJsSources());
    const problems = [];
    for (const [key, count] of Object.entries(current)) {
        const entry = ALLOWLIST.entries[key];
        if (!entry) problems.push(`new: ${key} (${count}); await it or list it with a reason`);
        else if (entry.count !== count)
            problems.push(`changed: ${key} (${entry.count} -> ${count}); await it or update its count`);
    }
    for (const key of Object.keys(ALLOWLIST.entries))
        if (!Object.hasOwn(current, key)) problems.push(`stale: ${key}; remove its entry`);
    for (const [key, entry] of Object.entries(ALLOWLIST.entries))
        if (typeof entry.reason !== 'string' || !entry.reason.trim())
            problems.push(`no reason: ${key}`);
    assert.deepEqual(problems, []);
});

test('the allowlist holds the pinned number of entries and calls', () => {
    const entries = Object.values(ALLOWLIST.entries);
    assertExceptionCount(entries.length, ALLOWLIST_PINS.entries, {
        what: 'allowlist entries',
        pin: 'ALLOWLIST_PINS.entries in scripts/discarded-promises.test.mjs',
    });
    assertExceptionCount(entries.reduce((n, entry) => n + entry.count, 0), ALLOWLIST_PINS.calls, {
        what: 'allowed discarded calls',
        pin: 'ALLOWLIST_PINS.calls in scripts/discarded-promises.test.mjs',
    });
});

test('the scan finds discarded calls to async and promise-returning functions only', () => {
    // A stand-in js/ tree. Each line names the case it exercises; the
    // expected listing below holds exactly the discarded promises.
    const sources = {
        'js/a.js': [
            "import { later } from './b.js';",
            "import * as b from './b.js';",
            'export async function slow() {}',
            // Synchronous, but returns a promise on one path.
            'export function sometimes(x) { if (x) return slow(); return 1; }',
            'function plain() { return 2; }',
            'export async function caller() {',
            '    slow();', // discarded async call
            '    await slow();', // awaited: not listed
            '    sometimes(1);', // discarded promise-returning call
            '    plain();', // synchronous: not listed
            '    later();', // discarded call through a static import
            '    b.later();', // discarded call through a namespace import
            '    void slow();', // an explicit void still discards it
            '    const kept = slow();', // kept in a binding: not listed
            '    await kept;',
            "    const { later: dyn } = await import('./b.js');",
            '    dyn();', // discarded call through a dynamic import
            '    const run = () => { slow(); };', // nested arrow, named by its binding
            '    run();',
            '}',
        ].join('\n'),
        'js/b.js': [
            "import { slow } from './a.js';",
            // Forwards a promise through an expression-bodied arrow.
            'export const later = () => slow();',
        ].join('\n'),
    };
    assert.deepEqual(scanDiscardedPromises(sources), {
        'js/a.js | caller | b.later': 1,
        'js/a.js | caller | dyn': 1,
        'js/a.js | caller | later': 1,
        'js/a.js | caller | slow': 2,
        'js/a.js | caller | sometimes': 1,
        'js/a.js | run | slow': 1,
    });
});
